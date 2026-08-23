import { query } from "./pool.server";
import { SCHEMA_SQL } from "./schema";
import { hashPassword } from "@/lib/auth/password.server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createHash } from "node:crypto";
import { localStorageProvider } from "@/lib/storage/local.provider";

export async function initializeLocalDatabase(): Promise<void> {
  console.log("[Local DB] Checking / Initializing PostgreSQL schema...");

  try {
    await query(SCHEMA_SQL);
    console.log("[Local DB] Schema initialized successfully.");
  } catch (err) {
    console.error("[Local DB] Schema initialization error:", err);
    throw err;
  }

  // Check if test accounts already exist
  const existingUsers = await query(`SELECT COUNT(*)::int as count FROM public.users`);
  if (existingUsers.rows[0]?.count > 0) {
    console.log(`[Local DB] Found ${existingUsers.rows[0].count} existing users. Skipping seed.`);
    return;
  }

  console.log("[Local DB] Seeding initial test accounts & School A/B dataset...");

  // 1. Create Users
  const testAccounts = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      email: "admin@test.yearbook",
      role: "super_admin",
      name: "System Admin (LocalDev)",
      pass: "Mb7!admin_pass$X9",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      email: "coordinator@test.yearbook",
      role: "coordinator",
      name: "Elena Rostova (Coordinator)",
      pass: "Mb7!coord_pass$X9",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      email: "member@test.yearbook",
      role: "member",
      name: "Marcus Vance (Staff Member)",
      pass: "Mb7!member_pass$X9",
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      email: "student@test.yearbook",
      role: "student",
      name: "Chloe Bennett (Student)",
      pass: "Mb7!student_pass$X9",
    },
    {
      id: "55555555-5555-5555-5555-555555555555",
      email: "coordinator-b@test.yearbook",
      role: "coordinator",
      name: "David Kim (School B Coordinator)",
      pass: "Mb7!coord_b_pass$X9",
    },
  ];

  for (const acc of testAccounts) {
    const pHash = await hashPassword(acc.pass);
    await query(
      `INSERT INTO public.users (id, email, password_hash, full_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET password_hash = $3, full_name = $4`,
      [acc.id, acc.email, pHash, acc.name],
    );

    await query(
      `INSERT INTO public.profiles (id, email, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [acc.id, acc.email, acc.name],
    );

    await query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [acc.id, acc.role],
    );
  }

  // 2. School A: Demo High School
  const schoolAId = "aaaaaaa1-1111-1111-1111-111111111111";
  const ybAId = "aaaaaaa2-2222-2222-2222-222222222222";
  const coordAId = "22222222-2222-2222-2222-222222222222";
  const memberAId = "33333333-3333-3333-3333-333333333333";
  const studentAId = "44444444-4444-4444-4444-444444444444";

  await query(
    `INSERT INTO public.schools (id, name, short_name, city, state, created_by)
     VALUES ($1, 'Demo High School (LocalDev)', 'DHS', 'San Francisco', 'CA', $2)
     ON CONFLICT (id) DO NOTHING`,
    [schoolAId, coordAId],
  );

  await query(
    `INSERT INTO public.yearbooks (id, school_id, year, title, theme, page_count, created_by)
     VALUES ($1, $2, 2026, 'Legacy & Horizons', 'Retro Futurism', 16, $3)
     ON CONFLICT (id) DO NOTHING`,
    [ybAId, schoolAId, coordAId],
  );

  await query(
    `INSERT INTO public.yearbook_members (yearbook_id, user_id, role)
     VALUES ($1, $2, 'coordinator'), ($1, $3, 'staff'), ($1, $4, 'student')
     ON CONFLICT DO NOTHING`,
    [ybAId, coordAId, memberAId, studentAId],
  );

  // Sections
  const sec1Res = await query(
    `INSERT INTO public.sections (yearbook_id, name, color, position) VALUES ($1, 'Front Matter / Dedication', '#3b82f6', 1) RETURNING id`,
    [ybAId],
  );
  const sec2Res = await query(
    `INSERT INTO public.sections (yearbook_id, name, color, position) VALUES ($1, 'Senior Portraits', '#10b981', 2) RETURNING id`,
    [ybAId],
  );
  const sec3Res = await query(
    `INSERT INTO public.sections (yearbook_id, name, color, position) VALUES ($1, 'Faculty & Academics', '#8b5cf6', 3) RETURNING id`,
    [ybAId],
  );
  const sec4Res = await query(
    `INSERT INTO public.sections (yearbook_id, name, color, position) VALUES ($1, 'Athletics & Student Life', '#f59e0b', 4) RETURNING id`,
    [ybAId],
  );

  const sec1 = sec1Res.rows[0]?.id;
  const sec2 = sec2Res.rows[0]?.id;
  const sec3 = sec3Res.rows[0]?.id;
  const sec4 = sec4Res.rows[0]?.id;

  // Page Status & Types
  const psRes = await query(
    `INSERT INTO public.page_statuses (yearbook_id, name, color, position) VALUES ($1, 'Ready for Review', '#10b981', 3) RETURNING id`,
    [ybAId],
  );
  const psId = psRes.rows[0]?.id;

  const ptRes = await query(
    `INSERT INTO public.page_types (yearbook_id, name, position) VALUES ($1, 'Feature Spread', 1) RETURNING id`,
    [ybAId],
  );
  const ptId = ptRes.rows[0]?.id;

  // 16 Pages Ladder
  const pagesList: any[] = [];
  for (let i = 1; i <= 16; i++) {
    const secId = i <= 2 ? sec1 : i <= 8 ? sec2 : i <= 12 ? sec3 : sec4;
    const pageRes = await query(
      `INSERT INTO public.pages (yearbook_id, section_id, page_type_id, status_id, position, page_number, title, description)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
       RETURNING *`,
      [
        ybAId,
        secId,
        ptId,
        psId,
        i,
        i === 1 ? "Cover & Opening" : `Spread Page ${i}`,
        `Page ${i} of Demo High School 2026 Yearbook`,
      ],
    );
    if (pageRes.rows[0]) pagesList.push(pageRes.rows[0]);
  }

  // Page Assignments
  if (pagesList.length > 0) {
    await query(
      `INSERT INTO public.page_assignments (page_id, yearbook_id, user_id, kind)
       VALUES ($1, $2, $3, 'designer'), ($4, $2, $5, 'proofreader')
       ON CONFLICT DO NOTHING`,
      [pagesList[0].id, ybAId, memberAId, pagesList[1].id, coordAId],
    );

    // Requirements
    await query(
      `INSERT INTO public.page_requirements (page_id, yearbook_id, label, needed, have, position)
       VALUES ($1, $2, 'High-Res Principal Portrait', 1, 1, 1)`,
      [pagesList[0].id, ybAId],
    );
  }

  // 3. Real Multi-Page PDF Proof Spread
  console.log("[Local DB] Generating real multi-page PDF proof fixture...");
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= 4; i++) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(`Demo High School — 2026 Yearbook Proof Spread`, {
      x: 50,
      y: 740,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(`SPREAD PAGE ${i}`, {
      x: 50,
      y: 700,
      size: 24,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(
      `Section: ${i <= 2 ? "Front Matter" : "Senior Portraits"} | Status: Ready for Review`,
      { x: 50, y: 675, size: 11, font: fontRegular, color: rgb(0.3, 0.3, 0.3) },
    );

    page.drawRectangle({
      x: 50,
      y: 80,
      width: 512,
      height: 570,
      borderWidth: 1,
      borderColor: rgb(0.8, 0.8, 0.8),
      color: rgb(0.97, 0.97, 0.97),
    });

    page.drawText(`[ Milestone Proof Engine — LocalDev Fixture Spread ${i} ]`, {
      x: 50,
      y: 55,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const proofBytes = await pdfDoc.save();
  const proofStoragePath = `yearbooks/${ybAId}/proofs/proof_v1.pdf`;
  await localStorageProvider.upload(
    "yearbook_proofs",
    proofStoragePath,
    Buffer.from(proofBytes),
    "application/pdf",
  );

  const proofRes = await query(
    `INSERT INTO public.proofs (yearbook_id, pdf_storage_path, version, status, created_by)
     VALUES ($1, $2, 1, 'ready', $3)
     RETURNING id`,
    [ybAId, proofStoragePath, coordAId],
  );
  const proofId = proofRes.rows[0]?.id;

  // Corrections
  if (pagesList.length > 0) {
    await query(
      `INSERT INTO public.corrections (yearbook_id, page_id, proof_id, page_number, title, description, coordinates, status, created_by)
       VALUES ($1, $2, $3, 1, 'Header font sizing', 'Increase title tracking and adjust margin by 4px.', '{"x":25.5,"y":18.2}'::jsonb, 'resolved', $4)`,
      [ybAId, pagesList[0].id, proofId, coordAId],
    );

    await query(
      `INSERT INTO public.page_approvals (yearbook_id, page_id, approved_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [ybAId, pagesList[0].id, coordAId],
    );
  }

  // Preflight
  await query(
    `INSERT INTO public.preflight_reports (yearbook_id, status, blocking_issues, warnings, results, run_by)
     VALUES ($1, 'PASS', '[]'::jsonb, '[]'::jsonb, '{"totalPages":16,"completePages":16,"openCorrections":0}'::jsonb, $2)`,
    [ybAId, coordAId],
  );

  // Snapshot
  const snapRes = await query(
    `INSERT INTO public.production_snapshots (yearbook_id, version, snapshot_data, created_by)
     VALUES ($1, 1, $2, $3)
     RETURNING id`,
    [
      ybAId,
      JSON.stringify({ yearbook_id: ybAId, pages: pagesList, timestamp: new Date().toISOString() }),
      coordAId,
    ],
  );
  const snapId = snapRes.rows[0]?.id;

  // Master Production Package
  const masterDoc = await PDFDocument.create();
  const mFont = await masterDoc.embedFont(StandardFonts.HelveticaBold);
  const mPage = masterDoc.addPage([612, 792]);
  mPage.drawText("Milestone Yearbook — Master Production Final Archive", {
    x: 50,
    y: 700,
    size: 20,
    font: mFont,
  });
  const masterBytes = await masterDoc.save();
  const masterBuf = Buffer.from(masterBytes);
  const masterSha = createHash("sha256").update(masterBuf).digest("hex");
  const masterStoragePath = `yearbooks/${ybAId}/production/v1/master.pdf`;

  await localStorageProvider.upload(
    "yearbook_production",
    masterStoragePath,
    masterBuf,
    "application/pdf",
  );

  await query(
    `INSERT INTO public.production_packages (yearbook_id, snapshot_id, manifest, storage_path, checksum_sha256, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      ybAId,
      snapId,
      JSON.stringify({ files: [{ name: "master.pdf", size: masterBuf.length }], version: 1 }),
      masterStoragePath,
      masterSha,
      coordAId,
    ],
  );

  // 4. School B: RLS Isolation Test School
  const schoolBId = "bbbbbbb1-1111-1111-1111-111111111111";
  const ybBId = "bbbbbbb2-2222-2222-2222-222222222222";
  const coordBId = "55555555-5555-5555-5555-555555555555";

  await query(
    `INSERT INTO public.schools (id, name, short_name, city, state, created_by)
     VALUES ($1, 'RLS Isolation Test School (LocalDev)', 'RLS-B', 'Austin', 'TX', $2)
     ON CONFLICT (id) DO NOTHING`,
    [schoolBId, coordBId],
  );

  await query(
    `INSERT INTO public.yearbooks (id, school_id, year, title, theme, page_count, created_by)
     VALUES ($1, $2, 2026, 'Isolated Horizons 2026', 'Confidential', 4, $3)
     ON CONFLICT (id) DO NOTHING`,
    [ybBId, schoolBId, coordBId],
  );

  await query(
    `INSERT INTO public.yearbook_members (yearbook_id, user_id, role)
     VALUES ($1, $2, 'coordinator')
     ON CONFLICT DO NOTHING`,
    [ybBId, coordBId],
  );

  for (let j = 1; j <= 4; j++) {
    await query(
      `INSERT INTO public.pages (yearbook_id, position, page_number, title, description)
       VALUES ($1, $2, $2, $3, 'Confidential School B Page')`,
      [ybBId, j, `School B Page ${j}`],
    );
  }

  console.log("[Local DB] Seed completed successfully.");
}
