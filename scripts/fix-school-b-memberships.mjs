/**
 * Fix School B center_memberships for member-b and student-b.
 * Non-destructive: uses ON CONFLICT DO NOTHING.
 * Also verifies RLS invariants.
 */
import pg from "pg";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
let dbUrl = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
if (dbUrl.includes("@postgres:5432")) dbUrl = dbUrl.replace("@postgres:5432", "@localhost:5432");

const pool = new pg.Pool({ connectionString: dbUrl });

const SCHOOL_B_ID = "bbbbbbb1-1111-1111-1111-111111111111";
const SCHOOL_A_ID = "aaaaaaa1-1111-1111-1111-111111111111";
const YB_B_ID = "bbbbbbb2-2222-2222-2222-222222222222";
const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const MEMBER_B_ID = "66666666-6666-6666-6666-666666666666"; // Sarah Jenkins
const STUDENT_B_ID = "77777777-7777-7777-7777-777777777777"; // Toby Ziegler
const COORD_B_ID = "55555555-5555-5555-5555-555555555555"; // David Kim

// School A users (should NOT have School B memberships/assignments)
const SCHOOL_A_USERS = [
  "22222222-2222-2222-2222-222222222222", // coordinator
  "33333333-3333-3333-3333-333333333333", // member
  "44444444-4444-4444-4444-444444444444", // student
  "88888888-8888-8888-8888-888888888888", // teacher
];

async function run() {
  console.log("=== School B Center Membership Fix ===");

  await pool.query("BEGIN");
  try {
    // Fix 1: Insert center_membership for member-b (Sarah Jenkins — student type in School B)
    const r1 = await pool.query(
      `INSERT INTO public.center_memberships (center_id, user_id, member_type, is_active, start_date, assigned_by)
       VALUES ($1, $2, 'student', true, CURRENT_DATE, $3)
       ON CONFLICT (center_id, user_id) WHERE is_active = true DO UPDATE SET member_type = 'student', updated_at = now()
       RETURNING id`,
      [SCHOOL_B_ID, MEMBER_B_ID, ADMIN_ID]
    );
    console.log("member-b membership upserted:", r1.rows[0]?.id ?? "already existed");

    // Fix 2: Insert center_membership for student-b (Toby Ziegler — student type in School B)
    const r2 = await pool.query(
      `INSERT INTO public.center_memberships (center_id, user_id, member_type, is_active, start_date, assigned_by)
       VALUES ($1, $2, 'student', true, CURRENT_DATE, $3)
       ON CONFLICT (center_id, user_id) WHERE is_active = true DO UPDATE SET member_type = 'student', updated_at = now()
       RETURNING id`,
      [SCHOOL_B_ID, STUDENT_B_ID, ADMIN_ID]
    );
    console.log("student-b membership upserted:", r2.rows[0]?.id ?? "already existed");

    await pool.query("COMMIT");
    console.log("Transaction committed.\n");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }

  // ── Verification: Invariant 1 — Memberships belong to same Center as their Yearbook ──
  console.log("── Invariant 1: Memberships in same center as yearbook ──");
  const yb = await pool.query("SELECT school_id FROM public.yearbooks WHERE id = $1", [YB_B_ID]);
  const ybSchoolId = yb.rows[0].school_id;
  const mbs = await pool.query(
    `SELECT u.email, cm.member_type, cm.center_id, cm.is_active 
     FROM public.center_memberships cm 
     JOIN public.users u ON u.id = cm.user_id 
     WHERE cm.user_id IN ($1, $2) AND cm.is_active = true`,
    [MEMBER_B_ID, STUDENT_B_ID]
  );
  mbs.rows.forEach(r => {
    const match = r.center_id === ybSchoolId;
    console.log(`  ${r.email}: member_type=${r.member_type}, center matches yearbook: ${match ? "✅" : "❌"}`);
  });

  // ── Invariant 2: School B Coordinator can manage School B Editorial Member ──
  console.log("\n── Invariant 2: Coord-B has coordinator appointment for School B ──");
  const coordAppt = await pool.query(
    `SELECT role, center_id FROM public.center_role_appointments 
     WHERE user_id = $1 AND is_active = true`,
    [COORD_B_ID]
  );
  const coordManagesB = coordAppt.rows.some(r => r.center_id === SCHOOL_B_ID && r.role === "coordinator");
  console.log(`  coordinator-b has coordinator role for School B: ${coordManagesB ? "✅" : "❌"}`);
  // Check editorial_member assignment exists for School B yearbook
  const editAssign = await pool.query(
    `SELECT yta.user_id, yta.role, yta.yearbook_id FROM public.yearbook_team_assignments yta
     WHERE yta.yearbook_id = $1 AND yta.user_id = $2 AND yta.role = 'editorial_member' AND yta.is_active = true`,
    [YB_B_ID, MEMBER_B_ID]
  );
  console.log(`  member-b has editorial_member assignment in School B yearbook: ${editAssign.rows.length > 0 ? "✅" : "❌"}`);

  // ── Invariant 3: School B users cannot access School A ──
  console.log("\n── Invariant 3: School B users have no School A memberships or assignments ──");
  const schoolBUsers = [MEMBER_B_ID, STUDENT_B_ID, COORD_B_ID];
  const crossMem = await pool.query(
    `SELECT u.email, cm.center_id FROM public.center_memberships cm
     JOIN public.users u ON u.id = cm.user_id
     WHERE cm.user_id = ANY($1::uuid[]) AND cm.center_id = $2 AND cm.is_active = true`,
    [schoolBUsers, SCHOOL_A_ID]
  );
  console.log(`  School B users with School A memberships: ${crossMem.rows.length} ${crossMem.rows.length === 0 ? "✅" : "❌ VIOLATION"}`);
  const yb_a = await pool.query("SELECT id FROM public.yearbooks WHERE school_id = $1 LIMIT 1", [SCHOOL_A_ID]);
  if (yb_a.rows.length > 0) {
    const crossTeam = await pool.query(
      `SELECT u.email FROM public.yearbook_team_assignments yta
       JOIN public.users u ON u.id = yta.user_id
       WHERE yta.user_id = ANY($1::uuid[]) AND yta.yearbook_id = $2 AND yta.is_active = true`,
      [schoolBUsers, yb_a.rows[0].id]
    );
    console.log(`  School B users with School A yearbook assignments: ${crossTeam.rows.length} ${crossTeam.rows.length === 0 ? "✅" : "❌ VIOLATION"}`);
  }

  // ── Invariant 4: School A users cannot access School B ──
  console.log("\n── Invariant 4: School A users have no School B memberships or assignments ──");
  const crossMemA = await pool.query(
    `SELECT u.email FROM public.center_memberships cm
     JOIN public.users u ON u.id = cm.user_id
     WHERE cm.user_id = ANY($1::uuid[]) AND cm.center_id = $2 AND cm.is_active = true`,
    [SCHOOL_A_USERS, SCHOOL_B_ID]
  );
  console.log(`  School A users with School B memberships: ${crossMemA.rows.length} ${crossMemA.rows.length === 0 ? "✅" : "❌ VIOLATION"}`);
  const crossTeamA = await pool.query(
    `SELECT u.email FROM public.yearbook_team_assignments yta
     JOIN public.users u ON u.id = yta.user_id
     WHERE yta.user_id = ANY($1::uuid[]) AND yta.yearbook_id = $2 AND yta.is_active = true`,
    [SCHOOL_A_USERS, YB_B_ID]
  );
  console.log(`  School A users with School B yearbook assignments: ${crossTeamA.rows.length} ${crossTeamA.rows.length === 0 ? "✅" : "❌ VIOLATION"}`);

  // ── Invariant 5: No editorial_member assignment without active student membership ──
  console.log("\n── Invariant 5: No editorial_member assignment without active student membership ──");
  const violators = await pool.query(
    `SELECT u.email, yta.role, yta.yearbook_id FROM public.yearbook_team_assignments yta
     JOIN public.users u ON u.id = yta.user_id
     WHERE yta.role = 'editorial_member' AND yta.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.center_memberships cm
       JOIN public.yearbooks y ON y.school_id = cm.center_id
       WHERE cm.user_id = yta.user_id AND cm.is_active = true AND y.id = yta.yearbook_id
     )`
  );
  console.log(`  editorial_member assignments without active center membership: ${violators.rows.length} ${violators.rows.length === 0 ? "✅" : "❌ VIOLATION:"}`);
  if (violators.rows.length > 0) console.log("  Violations:", violators.rows.map(r => r.email));

  console.log("\n=== Fix Complete ===");
  await pool.end();
}

run().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
