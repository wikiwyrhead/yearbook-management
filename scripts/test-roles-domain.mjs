import pg from "pg";
import { promises as fs, default as fsSync } from "node:fs";
import * as path from "node:path";

const { Pool } = pg;

async function runDomainSecurityTests() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — ROLE & ASSIGNMENT DOMAIN SECURITY VERIFICATION SUITE");
  console.log("================================================================================\n");

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
  if (connectionString.includes("@postgres:5432")) {
    connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${testName} — ${details}`);
      failedTests++;
    }
  }

  try {
    const schoolAId = "aaaaaaa1-1111-1111-1111-111111111111";
    const schoolBId = "bbbbbbb1-1111-1111-1111-111111111111";
    const ybAId = "aaaaaaa2-2222-2222-2222-222222222222";
    const ybBId = "bbbbbbb2-2222-2222-2222-222222222222";

    const adminId = "11111111-1111-1111-1111-111111111111";
    const coordAId = "22222222-2222-2222-2222-222222222222";
    const teacherAId = "88888888-8888-8888-8888-888888888888";
    const memberAId = "33333333-3333-3333-3333-333333333333";
    const studentAId = "44444444-4444-4444-4444-444444444444";
    const coordBId = "55555555-5555-5555-5555-555555555555";
    const studentBId = "77777777-7777-7777-7777-777777777777";

    // -------------------------------------------------------------------------
    // TEST GROUP 1: Center Appointments & Coordinator Authority
    // -------------------------------------------------------------------------
    console.log("--- TEST GROUP 1: Center Appointments & Coordinator Authority ---");

    // 1.1 Super Admin can manage center roles
    const saCheck = await client.query(
      "SELECT public.can_manage_center_roles($1, $2) as can_manage",
      [adminId, schoolAId],
    );
    assert(
      saCheck.rows[0]?.can_manage === true,
      "1.1 Super Admin can_manage_center_roles returns true",
    );

    // 1.2 Center Coordinator CANNOT manage center roles
    const coordCenterCheck = await client.query(
      "SELECT public.can_manage_center_roles($1, $2) as can_manage",
      [coordAId, schoolAId],
    );
    assert(
      coordCenterCheck.rows[0]?.can_manage === false,
      "1.2 Center Coordinator can_manage_center_roles returns false (Denied from assigning Center roles)",
    );

    // 1.3 Coordinator is active for School A and manages Yearbooks in School A
    const coordAActive = await client.query(
      "SELECT public.is_active_coordinator($1, $2) as is_coord",
      [coordAId, schoolAId],
    );
    assert(coordAActive.rows[0]?.is_coord === true, "1.3 Elena is active Coordinator for School A");

    const coordAYbManage = await client.query(
      "SELECT public.can_manage_yearbook($1, $2) as can_manage",
      [coordAId, ybAId],
    );
    assert(
      coordAYbManage.rows[0]?.can_manage === true,
      "1.4 Elena can_manage_yearbook for School A's Yearbook",
    );

    // 1.5 Coordinator of School A CANNOT manage School B
    const coordAtoB = await client.query(
      "SELECT public.can_manage_yearbook($1, $2) as can_manage",
      [coordAId, ybBId],
    );
    assert(
      coordAtoB.rows[0]?.can_manage === false,
      "1.5 Elena (School A Coord) CANNOT manage School B's Yearbook",
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Invariants & Cross-Center Isolation
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 2: Invariants & Cross-Center Isolation ---");

    // 2.1 Center Membership constraint: member_type allows ONLY 'teacher', 'student', or 'staff'
    let invalidTypeFailed = false;
    try {
      await client.query(
        `INSERT INTO public.center_memberships (center_id, user_id, member_type, assigned_by)
         VALUES ($1, $2, 'invalid_role', $3)`,
        [schoolAId, studentBId, adminId],
      );
    } catch (err) {
      invalidTypeFailed = true;
    }
    assert(
      invalidTypeFailed,
      "2.1 Database rejects invalid member_type (only 'teacher', 'student', 'staff' permitted)",
    );

    // 2.2 Role-to-membership invariant: Advisor requires teacher membership
    const teachMem = await client.query(
      `SELECT member_type FROM public.center_memberships WHERE center_id = $1 AND user_id = $2 AND is_active = true`,
      [schoolAId, teacherAId],
    );
    assert(
      teachMem.rows[0]?.member_type === "teacher",
      "2.2 Dr. Arthur Harrison is active Teacher membership in School A",
    );

    // 2.3 Editorial Member requires student membership (Chloe Bennett)
    const stuMem = await client.query(
      `SELECT member_type FROM public.center_memberships WHERE center_id = $1 AND user_id = $2 AND is_active = true`,
      [schoolAId, studentAId],
    );
    assert(
      stuMem.rows[0]?.member_type === "student",
      "2.3 Chloe Bennett is active Student membership in School A",
    );

    // 2.4 Marcus Vance is canonical Staff/Member
    const staffMem = await client.query(
      `SELECT member_type FROM public.center_memberships WHERE center_id = $1 AND user_id = $2 AND is_active = true`,
      [schoolAId, memberAId],
    );
    assert(
      staffMem.rows[0]?.member_type === "staff",
      "2.4 Marcus Vance is canonical Staff/Member in School A",
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Page-Scoped Proof & Editing Authorization
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 3: Page-Scoped Proof & Editing Authorization ---");

    // Ensure Chloe has Page 10 assigned in Yearbook A
    const p10Res = await client.query(
      "SELECT id FROM public.pages WHERE yearbook_id = $1 AND page_number = 10",
      [ybAId],
    );
    const p10Id = p10Res.rows[0]?.id;
    if (p10Id) {
      const ytaChloe = await client.query(
        "SELECT id FROM public.yearbook_team_assignments WHERE yearbook_id = $1 AND user_id = $2 AND is_active = true",
        [ybAId, studentAId],
      );
      if (ytaChloe.rows[0]?.id) {
        await client.query(
          "INSERT INTO public.yearbook_assignment_pages (assignment_id, page_id, yearbook_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
          [ytaChloe.rows[0].id, p10Id, ybAId],
        );
        await client.query(
          "INSERT INTO public.page_assignments (page_id, yearbook_id, user_id, kind) VALUES ($1, $2, $3, 'primary') ON CONFLICT DO NOTHING",
          [p10Id, ybAId, studentAId],
        );
      }
    }

    // Get an assigned page ID for Chloe and an unassigned page ID
    const assignedPageRes = await client.query(
      `SELECT ap.page_id 
       FROM public.yearbook_assignment_pages ap
       JOIN public.yearbook_team_assignments yta ON ap.assignment_id = yta.id
       WHERE yta.user_id = $1 AND yta.yearbook_id = $2
       LIMIT 1`,
      [studentAId, ybAId],
    );
    const assignedPageId = assignedPageRes.rows[0]?.page_id;

    const unassignedPageRes = await client.query(
      `SELECT p.id 
       FROM public.pages p
       WHERE p.yearbook_id = $1
         AND p.id NOT IN (
           SELECT ap.page_id 
           FROM public.yearbook_assignment_pages ap
           JOIN public.yearbook_team_assignments yta ON ap.assignment_id = yta.id
           WHERE yta.user_id = $2
         )
       LIMIT 1`,
      [ybAId, studentAId],
    );
    const unassignedPageId = unassignedPageRes.rows[0]?.id;

    assert(
      !!assignedPageId && !!unassignedPageId,
      "3.0 Found test assigned and unassigned pages in Yearbook A",
    );

    // 3.1 Chloe (Editorial Member) CAN edit and review proof for assigned Page
    const chloeAssignedEdit = await client.query(
      "SELECT public.can_edit_assigned_page($1, $2, $3) as can_edit",
      [studentAId, ybAId, assignedPageId],
    );
    const chloeAssignedProof = await client.query(
      "SELECT public.can_review_proof_page($1, $2, $3) as can_review",
      [studentAId, ybAId, assignedPageId],
    );
    assert(chloeAssignedEdit.rows[0]?.can_edit === true, "3.1 Chloe CAN edit assigned Page");
    assert(
      chloeAssignedProof.rows[0]?.can_review === true,
      "3.2 Chloe CAN review proof for assigned Page",
    );

    // 3.2 Chloe CANNOT edit or review proof for unassigned Page
    const chloeUnassignedEdit = await client.query(
      "SELECT public.can_edit_assigned_page($1, $2, $3) as can_edit",
      [studentAId, ybAId, unassignedPageId],
    );
    const chloeUnassignedProof = await client.query(
      "SELECT public.can_review_proof_page($1, $2, $3) as can_review",
      [studentAId, ybAId, unassignedPageId],
    );
    assert(
      chloeUnassignedEdit.rows[0]?.can_edit === false,
      "3.3 Chloe CANNOT edit unassigned Page (Page-scoped isolation)",
    );
    assert(
      chloeUnassignedProof.rows[0]?.can_review === false,
      "3.4 Chloe CANNOT review proof for unassigned Page",
    );

    // 3.3 Super Admin & Coordinator have full proof review on unassigned pages
    const saUnassignedProof = await client.query(
      "SELECT public.can_review_proof_page($1, $2, $3) as can_review",
      [adminId, ybAId, unassignedPageId],
    );
    const coordUnassignedProof = await client.query(
      "SELECT public.can_review_proof_page($1, $2, $3) as can_review",
      [coordAId, ybAId, unassignedPageId],
    );
    assert(
      saUnassignedProof.rows[0]?.can_review === true,
      "3.5 Super Admin CAN review proof on unassigned Page",
    );
    assert(
      coordUnassignedProof.rows[0]?.can_review === true,
      "3.6 Coordinator CAN review proof on unassigned Page",
    );

    // 3.4 Approval and Locking authority
    const saApprove = await client.query(
      "SELECT public.can_approve_and_lock($1, $2) as can_approve",
      [adminId, ybAId],
    );
    const coordApprove = await client.query(
      "SELECT public.can_approve_and_lock($1, $2) as can_approve",
      [coordAId, ybAId],
    );
    const chloeApprove = await client.query(
      "SELECT public.can_approve_and_lock($1, $2) as can_approve",
      [studentAId, ybAId],
    );
    const marcusApprove = await client.query(
      "SELECT public.can_approve_and_lock($1, $2) as can_approve",
      [memberAId, ybAId],
    );
    assert(saApprove.rows[0]?.can_approve === true, "3.7 Super Admin can_approve_and_lock = true");
    assert(
      coordApprove.rows[0]?.can_approve === true,
      "3.8 Coordinator can_approve_and_lock = true",
    );
    assert(
      chloeApprove.rows[0]?.can_approve === false,
      "3.9 Editorial Member can_approve_and_lock = false (Cannot sign off or lock)",
    );
    assert(
      marcusApprove.rows[0]?.can_approve === false,
      "3.10 Staff/Member can_approve_and_lock = false (Cannot sign off or lock)",
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Database Composite FK Isolation (Cross-Yearbook Prevention)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 4: Composite Foreign Key Isolation ---");

    // Get an assignment from Yearbook A and a page from Yearbook B
    const assignARes = await client.query(
      "SELECT id FROM public.yearbook_team_assignments WHERE yearbook_id = $1 LIMIT 1",
      [ybAId],
    );
    const pageBRes = await client.query(
      "SELECT id FROM public.pages WHERE yearbook_id = $1 LIMIT 1",
      [ybBId],
    );
    const assignAId = assignARes.rows[0]?.id;
    const pageBId = pageBRes.rows[0]?.id;

    let crossYbAssignmentFailed = false;
    try {
      await client.query(
        `INSERT INTO public.yearbook_assignment_pages (assignment_id, page_id, yearbook_id)
         VALUES ($1, $2, $3)`,
        [assignAId, pageBId, ybAId],
      );
    } catch (err) {
      crossYbAssignmentFailed = true;
    }
    assert(
      crossYbAssignmentFailed,
      "4.1 PostgreSQL composite FK physically prevents assigning a School B page to a School A assignment",
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 5: Appointment Edge Cases & Soft Deactivation
    // -------------------------------------------------------------------------
    console.log("\n--- TEST GROUP 5: Appointment Edge Cases & Soft Deactivation ---");

    // 5.1 Expired appointment denial
    const testExpiredUser = "99999999-9999-9999-9999-999999999999";
    await client.query(
      `INSERT INTO public.users (id, email, password_hash, full_name)
       VALUES ($1, 'expired@test.yearbook', 'hash', 'Expired Coord')
       ON CONFLICT (id) DO NOTHING`,
      [testExpiredUser],
    );

    await client.query(
      `INSERT INTO public.center_role_appointments (center_id, user_id, role, start_date, end_date, is_active, assigned_by)
       VALUES ($1, $2, 'coordinator', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '10 days', true, $3)
       ON CONFLICT DO NOTHING`,
      [schoolAId, testExpiredUser, adminId],
    );

    const expiredCheck = await client.query(
      "SELECT public.is_active_coordinator($1, $2) as is_coord",
      [testExpiredUser, schoolAId],
    );
    assert(
      expiredCheck.rows[0]?.is_coord === false,
      "5.1 Expired appointment (end_date < today) is correctly denied active coordinator status",
    );

    // 5.2 Date validation constraint prevents end_date < start_date
    let invalidDatesFailed = false;
    try {
      await client.query(
        `INSERT INTO public.center_role_appointments (center_id, user_id, role, start_date, end_date, is_active, assigned_by)
         VALUES ($1, $2, 'coordinator', '2026-06-01', '2026-01-01', true, $3)`,
        [schoolAId, testExpiredUser, adminId],
      );
    } catch (err) {
      invalidDatesFailed = true;
    }
    assert(
      invalidDatesFailed,
      "5.2 CHECK constraint prevents creating appointment where end_date < start_date",
    );

    console.log(
      "\n================================================================================",
    );
    console.log(`  RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log(
      "================================================================================\n",
    );

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runDomainSecurityTests().catch((err) => {
  console.error("Test Suite Execution Error:", err);
  process.exit(1);
});
