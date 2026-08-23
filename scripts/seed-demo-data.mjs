import pg from "pg";
import { scrypt, randomBytes, createHash } from "node:crypto";
import { promisify } from "node:util";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { promises as fs, default as fsSync } from "node:fs";
import * as path from "node:path";

const scryptAsync = promisify(scrypt);
const { Pool } = pg;

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export async function seedDemoData() {
  const isLocal = (process.env.DATA_BACKEND || "local") === "local";
  if (!isLocal) {
    console.log("[Demo Seed] Skipping local demo seed (DATA_BACKEND != local)");
    return;
  }

  let connectionString = process.env.DATABASE_URL || "";
  if (!connectionString && fsSync.existsSync(".env")) {
    const envContent = fsSync.readFileSync(".env", "utf8");
    const m = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
    if (m) connectionString = m[1];
  }
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Set it in .env or as an environment variable before running this script."
    );
  }
  // If running from host outside docker network
  const isInsideDocker = fsSync.existsSync("/.dockerenv") || process.env.HOSTNAME?.length === 12;
  if (!isInsideDocker && connectionString.includes("@postgres:5432")) {
    connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
  }

  console.log(
    "[Demo Seed] Connecting to PostgreSQL at:",
    connectionString.replace(/:[^:@]+@/, ":****@"),
  );

  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();

  console.log("[Demo Seed] Connected. Checking schema...");
  const tableCheck = await client.query("SELECT to_regclass('public.users') as exists");
  if (!tableCheck.rows[0]?.exists) {
    const schemaPath = path.join(process.cwd(), "src/lib/db/schema.sql");
    const schemaSql = await fs.readFile(schemaPath, "utf8");
    await client.query(schemaSql);
  }
  await client.query("ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url TEXT;");
  await client.query("ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS notes TEXT;");
  await client.query(
    "ALTER TABLE public.yearbook_approvals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();",
  );

  console.log("[Demo Seed] 1. Seeding Core Test Accounts...");

  const testAccountsMeta = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      email: "admin@test.yearbook",
      role: "super_admin",
      name: "System Admin (LocalDev)",
      scope: "Global Administration",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      email: "coordinator@test.yearbook",
      role: "coordinator",
      name: "Elena Rostova (Coordinator)",
      scope: "School A (Demo High School)",
    },
    {
      id: "88888888-8888-8888-8888-888888888888",
      email: "teacher@test.yearbook",
      role: "advisor",
      name: "Dr. Arthur Harrison (Faculty Advisor)",
      scope: "School A (Demo High School)",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      email: "member@test.yearbook",
      role: "staff",
      name: "Marcus Vance (Staff Member)",
      scope: "School A (Demo High School)",
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      email: "student@test.yearbook",
      role: "editorial_member",
      name: "Chloe Bennett (Student Editor)",
      scope: "School A (Demo High School)",
    },
    {
      id: "55555555-5555-5555-5555-555555555555",
      email: "coordinator-b@test.yearbook",
      role: "coordinator",
      name: "David Kim (School B Coordinator)",
      scope: "School B (RLS Isolation)",
    },
    {
      id: "66666666-6666-6666-6666-666666666666",
      email: "member-b@test.yearbook",
      role: "staff",
      name: "Sarah Jenkins (School B Staff Member)",
      scope: "School B (RLS Isolation)",
    },
    {
      id: "77777777-7777-7777-7777-777777777777",
      email: "student-b@test.yearbook",
      role: "student_contributor",
      name: "Toby Ziegler (School B Student)",
      scope: "School B (RLS Isolation)",
    },
  ];

  const localDevAccountsPath = path.join(process.cwd(), ".localdev/test-accounts.json");
  let savedAccounts = {};
  if (fsSync.existsSync(localDevAccountsPath)) {
    try {
      savedAccounts = JSON.parse(fsSync.readFileSync(localDevAccountsPath, "utf8"));
    } catch {
      savedAccounts = {};
    }
  }

  const generatedDocAccounts = [];

  for (const acc of testAccountsMeta) {
    let plainPass = savedAccounts[acc.email]?.password;
    if (!plainPass) {
      plainPass = "Mb8!" + randomBytes(12).toString("hex") + "$Z1";
      savedAccounts[acc.email] = { ...acc, password: plainPass };
    }
    generatedDocAccounts.push({ ...acc, password: plainPass });

    const pHash = await hashPassword(plainPass);
    await client.query(
      `INSERT INTO public.users (id, email, password_hash, full_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET password_hash = $3, email = $2, full_name = $4`,
      [acc.id, acc.email, pHash, acc.name],
    );

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = $2, full_name = $3`,
      [acc.id, acc.email, acc.name],
    );

    await client.query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [acc.id, acc.role === "super_admin" ? "super_admin" : "member"],
    );
  }

  // Ensure gitignored .localdev files are synced safely
  try {
    const localDevDir = path.join(process.cwd(), ".localdev");
    if (!fsSync.existsSync(localDevDir)) fsSync.mkdirSync(localDevDir, { recursive: true });
    fsSync.writeFileSync(localDevAccountsPath, JSON.stringify(savedAccounts, null, 2));

    let md = `# Milestone Yearbook — LocalDev Test Accounts\n\n> [!IMPORTANT]\n> These credentials are generated strictly for LocalDev testing on \`http://yearbook-manager.test\`.\n> This file is excluded from Git via \`.gitignore\`.\n\n| Email | Role | Name | LocalDev Password | Assigned Scope |\n|---|---|---|---|---|\n`;
    for (const a of generatedDocAccounts) {
      md += `| \`${a.email}\` | \`${a.role}\` | ${a.name} | \`${a.password}\` | ${a.scope} |\n`;
    }
    md += `\n---\n\n## Testing Matrix & Roles\n\n- **\`admin@test.yearbook\`**: Global Super Admin.\n- **\`coordinator@test.yearbook\`**: School A Coordinator.\n- **\`teacher@test.yearbook\`**: School A Faculty Advisor.\n- **\`member@test.yearbook\`**: Student Editorial Member (School A).\n- **\`student@test.yearbook\`**: Student Contributor (School A).\n- **\`coordinator-b@test.yearbook\`**: School B Coordinator.\n- **\`student-b@test.yearbook\`**: School B Student.\n`;
    fsSync.writeFileSync(path.join(localDevDir, "test-accounts.md"), md);
  } catch {
    // Ignore in container if filesystem is read-only
  }

  let storageBase = process.env.STORAGE_LOCAL_PATH || "/data/storage";
  try {
    if (!fsSync.existsSync(storageBase)) {
      fsSync.mkdirSync(storageBase, { recursive: true });
    }
  } catch {
    storageBase = path.join(process.cwd(), ".localdev/storage");
    fsSync.mkdirSync(storageBase, { recursive: true });
  }

  // ==================================================
  // SCHOOL A: Demo High School (55+ students, 48 pages)
  // ==================================================
  console.log("[Demo Seed] 2. Seeding School A (Demo High School — 55+ Students, 48 Pages)...");
  const schoolAId = "aaaaaaa1-1111-1111-1111-111111111111";
  const ybAId = "aaaaaaa2-2222-2222-2222-222222222222";
  const adminId = "11111111-1111-1111-1111-111111111111";
  const coordAId = "22222222-2222-2222-2222-222222222222";
  const teacherAId = "88888888-8888-8888-8888-888888888888";
  const memberAId = "33333333-3333-3333-3333-333333333333";
  const studentAId = "44444444-4444-4444-4444-444444444444";

  await client.query(
    `INSERT INTO public.schools (id, name, short_name, city, state, address, contact_name, contact_email, created_by)
     VALUES ($1, 'Demo High School (LocalDev)', 'DHS', 'San Francisco', 'CA', '100 Mission St', 'Elena Rostova', 'coordinator@test.yearbook', $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name`,
    [schoolAId, adminId],
  );

  await client.query(
    `INSERT INTO public.yearbooks (id, school_id, year, title, theme, page_count, created_by)
     VALUES ($1, $2, 2026, 'Legacy & Horizons', 'Retro Futurism', 48, $3)
     ON CONFLICT (id) DO UPDATE SET page_count = 48, title = EXCLUDED.title, theme = EXCLUDED.theme`,
    [ybAId, schoolAId, coordAId],
  );

  // Center Appointments & Memberships for School A
  await client.query(
    `INSERT INTO public.center_role_appointments (center_id, user_id, role, start_date, is_active, assigned_by)
     VALUES ($1, $2, 'coordinator', CURRENT_DATE, true, $3)
     ON CONFLICT DO NOTHING`,
    [schoolAId, coordAId, adminId],
  );

  const teachMemRes = await client.query(
    `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
     VALUES ($1, $2, 'teacher', CURRENT_DATE, true, $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [schoolAId, teacherAId, adminId],
  );
  const teachMemId = teachMemRes.rows[0]?.id;

  const memMemRes = await client.query(
    `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
     VALUES ($1, $2, 'staff', CURRENT_DATE, true, $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [schoolAId, memberAId, adminId],
  );
  const memMemId = memMemRes.rows[0]?.id;

  const stuMemRes = await client.query(
    `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
     VALUES ($1, $2, 'student', CURRENT_DATE, true, $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [schoolAId, studentAId, adminId],
  );
  const stuMemId = stuMemRes.rows[0]?.id;

  // Annual Yearbook Team Assignments
  await client.query(
    `INSERT INTO public.yearbook_team_assignments (yearbook_id, user_id, center_membership_id, role, start_date, is_active, assigned_by)
     VALUES 
       ($1, $2, $3, 'advisor', CURRENT_DATE, true, $4),
       ($1, $5, $6, 'editorial_member', CURRENT_DATE, true, $7)
     ON CONFLICT DO NOTHING`,
    [ybAId, teacherAId, teachMemId, adminId, studentAId, stuMemId, coordAId],
  );

  await client.query(
    `INSERT INTO public.yearbook_members (yearbook_id, user_id, role)
     VALUES ($1, $2, 'coordinator'), ($1, $3, 'staff'), ($1, $4, 'student')
     ON CONFLICT DO NOTHING`,
    [ybAId, coordAId, memberAId, studentAId],
  );

  // 8 Sections
  const sectionDefs = [
    { name: "Front Matter & Dedication", color: "#3b82f6", pos: 1 },
    { name: "Senior Class of 2026", color: "#10b981", pos: 2 },
    { name: "Faculty & Academics", color: "#8b5cf6", pos: 3 },
    { name: "Varsity & Club Athletics", color: "#f59e0b", pos: 4 },
    { name: "Student Life & Spirit", color: "#ec4899", pos: 5 },
    { name: "Clubs & Organizations", color: "#14b8a6", pos: 6 },
    { name: "Visual & Performing Arts", color: "#6366f1", pos: 7 },
    { name: "Graduation & Retrospective", color: "#ef4444", pos: 8 },
  ];

  const sectionIds = [];
  for (const s of sectionDefs) {
    const sRes = await client.query(
      `INSERT INTO public.sections (yearbook_id, name, color, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [ybAId, s.name, s.color, s.pos],
    );
    if (sRes.rows[0]) {
      sectionIds.push(sRes.rows[0].id);
    } else {
      const existing = await client.query(
        "SELECT id FROM public.sections WHERE yearbook_id = $1 AND position = $2",
        [ybAId, s.pos],
      );
      sectionIds.push(existing.rows[0]?.id);
    }
  }

  // Page Statuses & Types
  const statuses = [
    { name: "Drafting", color: "#94a3b8", pos: 1, terminal: false },
    { name: "In Layout", color: "#3b82f6", pos: 2, terminal: false },
    { name: "Ready for Review", color: "#f59e0b", pos: 3, terminal: false },
    { name: "Approved for Print", color: "#10b981", pos: 4, terminal: true },
  ];
  const statusIds = [];
  for (const st of statuses) {
    const stRes = await client.query(
      `INSERT INTO public.page_statuses (yearbook_id, name, color, position, is_terminal)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [ybAId, st.name, st.color, st.pos, st.terminal],
    );
    if (stRes.rows[0]) statusIds.push(stRes.rows[0].id);
    else {
      const existing = await client.query(
        "SELECT id FROM public.page_statuses WHERE yearbook_id = $1 AND position = $2",
        [ybAId, st.pos],
      );
      statusIds.push(existing.rows[0]?.id);
    }
  }

  const ptRes = await client.query(
    `INSERT INTO public.page_types (yearbook_id, name, position)
     VALUES ($1, 'Feature Spread', 1)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ybAId],
  );
  let ptId = ptRes.rows[0]?.id;
  if (!ptId) {
    const existing = await client.query(
      "SELECT id FROM public.page_types WHERE yearbook_id = $1 LIMIT 1",
      [ybAId],
    );
    ptId = existing.rows[0]?.id;
  }

  // 48 Pages across 8 Sections (6 pages per section)
  console.log("[Demo Seed] Seeding 48 pages across 8 sections...");
  const pagesList = [];
  for (let i = 1; i <= 48; i++) {
    const sIdx = Math.floor((i - 1) / 6);
    const secId = sectionIds[sIdx] || sectionIds[0];
    const statId = statusIds[i % 4] || statusIds[0];
    const secName = sectionDefs[sIdx]?.name || "Feature";

    const title =
      i === 1
        ? "Cover & Opening"
        : i === 48
          ? "Back Cover & Signatures"
          : `${secName} - Spread ${i}`;
    const pRes = await client.query(
      `INSERT INTO public.pages (yearbook_id, section_id, page_type_id, status_id, position, page_number, title, description)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [ybAId, secId, ptId, statId, i, title, `Page ${i} of ${secName} in DHS 2026 Yearbook`],
    );

    if (pRes.rows[0]) {
      pagesList.push(pRes.rows[0]);
    } else {
      const existing = await client.query(
        "SELECT * FROM public.pages WHERE yearbook_id = $1 AND position = $2",
        [ybAId, i],
      );
      if (existing.rows[0]) pagesList.push(existing.rows[0]);
    }
  }

  // Assign Marcus Vance (editorial_member) to Pages 1, 2, 3, 4
  const marcusAssignRes = await client.query(
    `SELECT id FROM public.yearbook_team_assignments WHERE yearbook_id = $1 AND user_id = $2 AND role = 'editorial_member' AND is_active = true`,
    [ybAId, memberAId],
  );
  const marcusAssignId = marcusAssignRes.rows[0]?.id;
  if (marcusAssignId) {
    for (let pIdx = 0; pIdx < Math.min(4, pagesList.length); pIdx++) {
      const targetPage = pagesList[pIdx];
      if (targetPage) {
        await client.query(
          `INSERT INTO public.yearbook_assignment_pages (assignment_id, page_id, yearbook_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [marcusAssignId, targetPage.id, ybAId],
        );
      }
    }
  }

  // 55+ Students Dataset
  console.log("[Demo Seed] Seeding 55+ student records across Grades 9-12...");
  const firstNames = [
    "Chloe",
    "Liam",
    "Sophia",
    "Jackson",
    "Emily",
    "Ethan",
    "Olivia",
    "Noah",
    "Mia",
    "Lucas",
    "Ava",
    "Oliver",
    "Isabella",
    "Aiden",
    "Harper",
    "Mason",
    "Evelyn",
    "Elijah",
    "Abigail",
    "Logan",
    "Emily",
    "James",
    "Charlotte",
    "Benjamin",
    "Amelia",
    "Lucas",
    "Ella",
    "Henry",
    "Scarlett",
    "Alexander",
    "Grace",
    "Sebastian",
    "Victoria",
    "Jack",
    "Riley",
    "Owen",
    "Aria",
    "Theodore",
    "Lily",
    "Samuel",
    "Aubrey",
    "Daniel",
    "Zoey",
    "Matthew",
    "Hannah",
    "Joseph",
    "Nora",
    "Carter",
    "Leah",
    "David",
    "Stella",
    "Wyatt",
    "Maya",
    "John",
    "Eleanor",
  ];
  const lastNames = [
    "Bennett",
    "Henderson",
    "Martinez",
    "Reed",
    "Taylor",
    "Davis",
    "Chen",
    "Wilson",
    "Anderson",
    "Miller",
    "Thomas",
    "White",
    "Harris",
    "Clark",
    "Lewis",
    "Robinson",
    "Walker",
    "Perez",
    "Hall",
    "Young",
    "Allen",
    "Sanchez",
    "Wright",
    "King",
    "Scott",
    "Green",
    "Baker",
    "Adams",
    "Nelson",
    "Hill",
    "Ramirez",
    "Campbell",
    "Mitchell",
    "Roberts",
    "Carter",
    "Phillips",
    "Evans",
    "Turner",
    "Torres",
    "Parker",
    "Collins",
    "Edwards",
    "Stewart",
    "Flores",
    "Morris",
    "Nguyen",
    "Murphy",
    "Rivera",
    "Cook",
    "Rogers",
    "Morgan",
    "Peterson",
    "Cooper",
    "Reed",
    "Bailey",
  ];

  for (let i = 0; i < 55; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    const grade = ["9", "10", "11", "12"][i % 4];
    const homeroom = `Room ${101 + (i % 8)}`;
    const email =
      i === 0 ? "student@test.yearbook" : `${fn.toLowerCase()}.${ln.toLowerCase()}@test.yearbook`;
    const subStatus = i % 3 === 0 ? "submitted" : i % 3 === 1 ? "approved" : "missing";

    await client.query(
      `INSERT INTO public.students (yearbook_id, first_name, last_name, grade, homeroom, email, submission_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [ybAId, fn, ln, grade, homeroom, email, subStatus],
    );
  }

  // 10 Faculty Members
  console.log("[Demo Seed] Seeding Faculty & Staff...");
  const facultyList = [
    { first: "Dr. Arthur", last: "Pendelton", dept: "Administration", title: "Principal" },
    { first: "Sarah", last: "Connors", dept: "Science", title: "AP Physics Teacher" },
    { first: "Robert", last: "Oppen", dept: "Science", title: "Chemistry Dept Head" },
    { first: "Maria", last: "Santos", dept: "Languages", title: "Spanish Literature" },
    { first: "James", last: "Vanderbilt", dept: "Fine Arts", title: "Art & Design" },
    { first: "Karen", last: "Novak", dept: "Mathematics", title: "Calculus & Geometry" },
    { first: "Michael", last: "Chang", dept: "Social Studies", title: "World History" },
    { first: "Rachel", last: "Adams", dept: "Athletics", title: "Athletic Director" },
    { first: "David", last: "Kowalski", dept: "Technology", title: "Computer Science" },
    { first: "Laura", last: "Ingalls", dept: "English", title: "Creative Writing" },
  ];

  for (const fac of facultyList) {
    await client.query(
      `INSERT INTO public.faculty (yearbook_id, first_name, last_name, department, title)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [ybAId, fac.first, fac.last, fac.dept, fac.title],
    );
  }

  // Page Assignments and Requirements
  if (pagesList.length >= 4) {
    await client.query(
      `INSERT INTO public.page_assignments (page_id, yearbook_id, user_id, kind)
       VALUES ($1, $2, $3, 'designer'), ($4, $2, $5, 'proofreader')
       ON CONFLICT DO NOTHING`,
      [pagesList[0].id, ybAId, memberAId, pagesList[1].id, coordAId],
    );

    await client.query(
      `INSERT INTO public.page_requirements (page_id, yearbook_id, label, needed, have, position)
       VALUES ($1, $2, 'High-Res Principal Portrait', 1, 1, 1),
              ($3, $2, 'Senior Group Action Shot', 4, 3, 1),
              ($4, $2, 'Varsity Soccer Championship Banner', 2, 2, 1)
       ON CONFLICT DO NOTHING`,
      [pagesList[0].id, ybAId, pagesList[1].id, pagesList[2].id],
    );
  }

  // Binary Assets
  await fs.mkdir(path.join(storageBase, "yearbook_assets", "yearbooks", ybAId), {
    recursive: true,
  });
  await fs.mkdir(path.join(storageBase, "yearbook_proofs", "yearbooks", ybAId, "proofs"), {
    recursive: true,
  });
  await fs.mkdir(
    path.join(storageBase, "yearbook_production", "yearbooks", ybAId, "production", "v1"),
    { recursive: true },
  );

  const samplePhotoPath = path.join(
    storageBase,
    "yearbook_assets",
    "yearbooks",
    ybAId,
    "sample_cover.png",
  );
  await fs.writeFile(samplePhotoPath, TINY_PNG);

  await client.query(
    `INSERT INTO public.assets (yearbook_id, file_name, file_type, file_size, storage_path, asset_type, status, uploaded_by)
     VALUES ($1, 'sample_cover.png', 'image/png', $2, $3, 'photo', 'approved', $4)
     ON CONFLICT DO NOTHING`,
    [ybAId, TINY_PNG.length, `yearbooks/${ybAId}/sample_cover.png`, coordAId],
  );

  // Multi-page PDF Proof
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let p = 1; p <= 8; p++) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(`Demo High School — 2026 Yearbook Proof Spread ${p}`, {
      x: 50,
      y: 740,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(`SECTION SPREAD ${p}`, {
      x: 50,
      y: 700,
      size: 24,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(`Status: Ready for Review | Pages ${p * 2 - 1} - ${p * 2}`, {
      x: 50,
      y: 675,
      size: 11,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawRectangle({
      x: 50,
      y: 80,
      width: 512,
      height: 570,
      borderWidth: 1,
      borderColor: rgb(0.8, 0.8, 0.8),
      color: rgb(0.97, 0.97, 0.97),
    });

    page.drawText(`[ Milestone Proof Engine — DHS 2026 Fixture Spread ${p} ]`, {
      x: 50,
      y: 55,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const proofBytes = await pdfDoc.save();
  const proofFilePath = path.join(
    storageBase,
    "yearbook_proofs",
    "yearbooks",
    ybAId,
    "proofs",
    "proof_v1.pdf",
  );
  await fs.writeFile(proofFilePath, Buffer.from(proofBytes));

  const proofRes = await client.query(
    `INSERT INTO public.proofs (yearbook_id, pdf_storage_path, storage_path, version, status, created_by)
     VALUES ($1, $2, $2, 1, 'ready', $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [ybAId, `yearbooks/${ybAId}/proofs/proof_v1.pdf`, coordAId],
  );
  let proofId = proofRes.rows[0]?.id;
  if (!proofId) {
    const existing = await client.query(
      "SELECT id FROM public.proofs WHERE yearbook_id = $1 LIMIT 1",
      [ybAId],
    );
    proofId = existing.rows[0]?.id;
  }

  if (pagesList.length > 0 && proofId) {
    await client.query(
      `INSERT INTO public.corrections (yearbook_id, page_id, proof_id, page_number, title, description, coordinates, status, category, priority, created_by)
       VALUES ($1, $2, $3, 1, 'Header font sizing', 'Increase title tracking and adjust margin by 4px.', '{"x":25.5,"y":18.2}'::jsonb, 'resolved', 'layout', 'medium', $4)
       ON CONFLICT DO NOTHING`,
      [ybAId, pagesList[0].id, proofId, coordAId],
    );

    await client.query(
      `INSERT INTO public.page_approvals (yearbook_id, page_id, proof_id, approved_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [ybAId, pagesList[0].id, proofId, coordAId],
    );
  }

  await client.query(
    `INSERT INTO public.preflight_reports (yearbook_id, status, blocking_issues, warnings, results, run_by)
     VALUES ($1, 'PASS', '[]'::jsonb, '[]'::jsonb, '{"totalPages":48,"completePages":48,"openCorrections":0}'::jsonb, $2)
     ON CONFLICT DO NOTHING`,
    [ybAId, coordAId],
  );

  const snapRes = await client.query(
    `INSERT INTO public.production_snapshots (yearbook_id, version, snapshot_data, created_by)
     VALUES ($1, 1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      ybAId,
      JSON.stringify({ yearbook_id: ybAId, pagesCount: 48, timestamp: new Date().toISOString() }),
      coordAId,
    ],
  );
  let snapId = snapRes.rows[0]?.id;
  if (!snapId) {
    const existing = await client.query(
      "SELECT id FROM public.production_snapshots WHERE yearbook_id = $1 LIMIT 1",
      [ybAId],
    );
    snapId = existing.rows[0]?.id;
  }

  const masterDoc = await PDFDocument.create();
  const mFont = await masterDoc.embedFont(StandardFonts.HelveticaBold);
  const mPage = masterDoc.addPage([612, 792]);
  mPage.drawText("Milestone Yearbook — Master Production Final Archive (48 Pages)", {
    x: 50,
    y: 700,
    size: 18,
    font: mFont,
  });
  const masterBytes = await masterDoc.save();
  const masterBuf = Buffer.from(masterBytes);
  const masterSha = createHash("sha256").update(masterBuf).digest("hex");
  const masterFilePath = path.join(
    storageBase,
    "yearbook_production",
    "yearbooks",
    ybAId,
    "production",
    "v1",
    "master.pdf",
  );
  await fs.writeFile(masterFilePath, masterBuf);

  if (snapId) {
    await client.query(
      `INSERT INTO public.production_packages (yearbook_id, snapshot_id, manifest, storage_path, checksum_sha256, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        ybAId,
        snapId,
        JSON.stringify({ files: [{ name: "master.pdf", size: masterBuf.length }], version: 1 }),
        `yearbooks/${ybAId}/production/v1/master.pdf`,
        masterSha,
        coordAId,
      ],
    );
  }

  // ==================================================
  // SCHOOL B: RLS Isolation Test School
  // ==================================================
  console.log("[Demo Seed] 3. Seeding School B (RLS Isolation Test School)...");
  const schoolBId = "bbbbbbb1-1111-1111-1111-111111111111";
  const ybBId = "bbbbbbb2-2222-2222-2222-222222222222";
  const coordBId = "55555555-5555-5555-5555-555555555555";
  const memberBId = "66666666-6666-6666-6666-666666666666";
  const studentBId = "77777777-7777-7777-7777-777777777777";

  await client.query(
    `INSERT INTO public.schools (id, name, short_name, city, state, address, contact_name, contact_email, created_by)
     VALUES ($1, 'RLS Isolation Test School (LocalDev)', 'RLS-B', 'Austin', 'TX', '200 Congress Ave', 'David Kim', 'coordinator-b@test.yearbook', $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name`,
    [schoolBId, coordBId],
  );

  await client.query(
    `INSERT INTO public.yearbooks (id, school_id, year, title, theme, page_count, created_by)
     VALUES ($1, $2, 2026, 'Isolated Horizons 2026', 'Confidential', 16, $3)
     ON CONFLICT (id) DO UPDATE SET page_count = 16, title = EXCLUDED.title, theme = EXCLUDED.theme`,
    [ybBId, schoolBId, coordBId],
  );

  await client.query(
    `INSERT INTO public.yearbook_members (yearbook_id, user_id, role)
     VALUES ($1, $2, 'coordinator'), ($1, $3, 'staff'), ($1, $4, 'student')
     ON CONFLICT DO NOTHING`,
    [ybBId, coordBId, memberBId, studentBId],
  );

  // Coordinator role appointment for School B
  await client.query(
    `INSERT INTO public.center_role_appointments (center_id, user_id, role, start_date, is_active, assigned_by)
     VALUES ($1, $2, 'coordinator', CURRENT_DATE, true, $3)
     ON CONFLICT DO NOTHING`,
    [schoolBId, coordBId, adminId],
  );

  // Center memberships for School B staff (member-b) and student (student-b)
  const memberBMemRes = await client.query(
    `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
     VALUES ($1, $2, 'student', CURRENT_DATE, true, $3)
     ON CONFLICT (center_id, user_id) WHERE is_active = true DO UPDATE SET member_type = 'student', updated_at = now()
     RETURNING id`,
    [schoolBId, memberBId, adminId],
  );
  const memberBMemId = memberBMemRes.rows[0]?.id;

  const studentBMemRes = await client.query(
    `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
     VALUES ($1, $2, 'student', CURRENT_DATE, true, $3)
     ON CONFLICT (center_id, user_id) WHERE is_active = true DO UPDATE SET member_type = 'student', updated_at = now()
     RETURNING id`,
    [schoolBId, studentBId, adminId],
  );
  const studentBMemId = studentBMemRes.rows[0]?.id;

  // Yearbook team assignments for School B
  if (memberBMemId) {
    await client.query(
      `INSERT INTO public.yearbook_team_assignments (yearbook_id, user_id, center_membership_id, role, start_date, is_active, assigned_by)
       VALUES ($1, $2, $3, 'editorial_member', CURRENT_DATE, true, $4)
       ON CONFLICT DO NOTHING`,
      [ybBId, memberBId, memberBMemId, coordBId],
    );
  }
  if (studentBMemId) {
    await client.query(
      `INSERT INTO public.yearbook_team_assignments (yearbook_id, user_id, center_membership_id, role, start_date, is_active, assigned_by)
       VALUES ($1, $2, $3, 'student_contributor', CURRENT_DATE, true, $4)
       ON CONFLICT DO NOTHING`,
      [ybBId, studentBId, studentBMemId, coordBId],
    );
  }

  for (let j = 1; j <= 16; j++) {
    await client.query(
      `INSERT INTO public.pages (yearbook_id, position, page_number, title, description)
       VALUES ($1, $2, $2, $3, 'Confidential School B Page')
       ON CONFLICT DO NOTHING`,
      [ybBId, j, `School B Page ${j}`],
    );
  }

  // 15 Students in School B
  for (let k = 1; k <= 15; k++) {
    await client.query(
      `INSERT INTO public.students (yearbook_id, first_name, last_name, grade, homeroom, email, submission_status)
       VALUES ($1, $2, $3, $4, 'Room B-101', $5, 'approved')
       ON CONFLICT DO NOTHING`,
      [ybBId, `StudentB_${k}`, `LastName_${k}`, "12", `student_b_${k}@test.yearbook`],
    );
  }

  // ==================================================
  // PRINT SERVICE BUREAU CATALOG
  // ==================================================
  console.log("[Demo Seed] 4. Seeding Service Bureaus Catalog...");
  await client.query(
    `INSERT INTO public.service_bureaus (name, code, contact_email, notes)
     VALUES 
       ('Milestone Press & Print', 'milestone_press', 'press@milestoneyearbooks.com', 'Primary high-volume offset yearbook printing partner'),
       ('Precision Bindery & Litho', 'precision_bindery', 'orders@precisionbindery.com', 'Specialty foil stamping and leatherette hardbound editions')
     ON CONFLICT (code) DO NOTHING`,
  );

  console.log(
    "[Demo Seed] Complete: 3 Schools, 3 Yearbooks, 55+ Students in School A, 15 Students in School B, 10 Faculty, Fixtures Seeded.",
  );
  client.release();
  await pool.end();
}

seedDemoData().catch((err) => {
  console.error("[Demo Seed Error]:", err);
  process.exit(1);
});
