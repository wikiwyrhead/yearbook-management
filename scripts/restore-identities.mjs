/**
 * Identity Restoration Script
 * Non-destructively realigns user identities according to the approved role model:
 * 1. Marcus Vance (member@test.yearbook): Staff/Member only. Deactivates Student membership and editorial assignments.
 * 2. Chloe Bennett (student@test.yearbook): Genuine active Center Student promoted to annual editorial_member for Page 10.
 */
import pg from "pg";
import fs from "fs";

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}
const pool = new pg.Pool({ connectionString });

async function restoreIdentities() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Restoring identities non-destructively...");

    const schoolAId = "aaaaaaa1-1111-1111-1111-111111111111";
    const schoolQaId = "3f7ff3c9-0560-43a0-8de0-edeb9914e176";
    const ybQaId = "f40b6896-9a90-4a14-ac4a-f9e204002716";
    const ybAId = "aaaaaaa2-2222-2222-2222-222222222222";
    const page10QaId = "08566f26-c68b-4650-94f6-76969f1f583b";
    const adminId = "11111111-1111-1111-1111-111111111111";
    const coordAId = "22222222-2222-2222-2222-222222222222";
    const teacherAId = "88888888-8888-8888-8888-888888888888";
    const marcusId = "33333333-3333-3333-3333-333333333333";
    const chloeId = "44444444-4444-4444-4444-444444444444";

    const schools = [schoolAId, schoolQaId];

    // Ensure Coordinator appointments
    for (const sid of schools) {
      await client.query(
        `INSERT INTO public.center_role_appointments (center_id, user_id, role, start_date, is_active, assigned_by)
         VALUES ($1, $2, 'coordinator', CURRENT_DATE, true, $3)
         ON CONFLICT (center_id, user_id) WHERE is_active = true AND role = 'coordinator'
         DO UPDATE SET updated_at = now()`,
        [sid, coordAId, adminId],
      );
      await client.query(
        `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
         VALUES ($1, $2, 'teacher', CURRENT_DATE, true, $3)
         ON CONFLICT (center_id, user_id) WHERE is_active = true
         DO UPDATE SET member_type = 'teacher', updated_at = now()`,
        [sid, teacherAId, adminId],
      );
    }

    // 1. MARCUS VANCE (Staff/Member)
    // Soft-deactivate student membership
    await client.query(
      `UPDATE public.center_memberships 
       SET is_active = false, end_date = CURRENT_DATE, updated_at = now() 
       WHERE user_id = $1 AND member_type = 'student'`,
      [marcusId],
    );

    // Soft-deactivate annual editorial_member / student_contributor assignments
    await client.query(
      `UPDATE public.yearbook_team_assignments 
       SET is_active = false, end_date = CURRENT_DATE, updated_at = now() 
       WHERE user_id = $1 AND role IN ('editorial_member', 'student_contributor')`,
      [marcusId],
    );

    // Remove operational page assignments for Marcus
    await client.query(`DELETE FROM public.page_assignments WHERE user_id = $1`, [marcusId]);

    // Create or reactivate canonical Staff membership for Marcus
    for (const sid of schools) {
      await client.query(
        `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
         VALUES ($1, $2, 'staff', CURRENT_DATE, true, $3)
         ON CONFLICT (center_id, user_id) WHERE is_active = true
         DO UPDATE SET member_type = 'staff', updated_at = now()`,
        [sid, marcusId, adminId],
      );
    }

    // Update user profile display name
    await client.query(
      `UPDATE public.users SET full_name = 'Marcus Vance (Staff Member)' WHERE id = $1`,
      [marcusId],
    );
    await client.query(
      `UPDATE public.profiles SET full_name = 'Marcus Vance (Staff Member)' WHERE id = $1`,
      [marcusId],
    );

    // 2. CHLOE BENNETT (Genuine Center Student & Promoted Editorial Member)
    // Ensure active Student membership in Center A and QA School
    for (const sid of schools) {
      await client.query(
        `INSERT INTO public.center_memberships (center_id, user_id, member_type, start_date, is_active, assigned_by)
         VALUES ($1, $2, 'student', CURRENT_DATE, true, $3)
         ON CONFLICT (center_id, user_id) WHERE is_active = true
         DO UPDATE SET member_type = 'student', updated_at = now()`,
        [sid, chloeId, adminId],
      );
    }

    const stuMemRes = await client.query(
      `SELECT id FROM public.center_memberships WHERE user_id = $1 AND center_id = $2 AND is_active = true`,
      [chloeId, schoolQaId],
    );
    const chloeMemId = stuMemRes.rows[0]?.id;

    // Soft-deactivate previous student_contributor assignment for School A yearbooks
    await client.query(
      `UPDATE public.yearbook_team_assignments 
       SET is_active = false, end_date = CURRENT_DATE, updated_at = now() 
       WHERE user_id = $1 AND yearbook_id IN ($2, $3) AND role = 'student_contributor'`,
      [chloeId, ybQaId, ybAId],
    );

    // Create or activate annual editorial_member assignment for Chloe on QA yearbook
    const assignQaRes = await client.query(
      `INSERT INTO public.yearbook_team_assignments (
         yearbook_id, user_id, center_membership_id, role, start_date, is_active, assigned_by
       ) VALUES ($1, $2, $3, 'editorial_member', CURRENT_DATE, true, $4)
       ON CONFLICT (yearbook_id, user_id, role) WHERE is_active = true
       DO UPDATE SET updated_at = now()
       RETURNING id`,
      [ybQaId, chloeId, chloeMemId, coordAId],
    );
    const chloeAssignQaId = assignQaRes.rows[0]?.id;

    // Assign Chloe to Page 10 in QA Yearbook
    await client.query(
      `INSERT INTO public.yearbook_assignment_pages (assignment_id, page_id, yearbook_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [chloeAssignQaId, page10QaId, ybQaId],
    );

    // Create or activate annual editorial_member assignment for Chloe on Demo Yearbook A
    const assignARes = await client.query(
      `INSERT INTO public.yearbook_team_assignments (
         yearbook_id, user_id, center_membership_id, role, start_date, is_active, assigned_by
       ) VALUES ($1, $2, $3, 'editorial_member', CURRENT_DATE, true, $4)
       ON CONFLICT (yearbook_id, user_id, role) WHERE is_active = true
       DO UPDATE SET updated_at = now()
       RETURNING id`,
      [ybAId, chloeId, chloeMemId, coordAId],
    );
    const chloeAssignAId = assignARes.rows[0]?.id;

    const page10ARes = await client.query(
      `SELECT id FROM public.pages WHERE yearbook_id = $1 AND page_number = 10`,
      [ybAId],
    );
    const page10AId = page10ARes.rows[0]?.id;
    if (page10AId) {
      await client.query(
        `INSERT INTO public.yearbook_assignment_pages (assignment_id, page_id, yearbook_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [chloeAssignAId, page10AId, ybAId],
      );
    }

    await client.query(
      `INSERT INTO public.page_assignments (page_id, yearbook_id, user_id, kind)
       VALUES ($1, $2, $3, 'designer')
       ON CONFLICT (page_id, user_id, kind) DO NOTHING`,
      [page10QaId, ybQaId, chloeId],
    );

    // Update user profile display name
    await client.query(
      `UPDATE public.users SET full_name = 'Chloe Bennett (Student Editor)' WHERE id = $1`,
      [chloeId],
    );
    await client.query(
      `UPDATE public.profiles SET full_name = 'Chloe Bennett (Student Editor)' WHERE id = $1`,
      [chloeId],
    );

    await client.query("COMMIT");
    console.log("✅ Identity restoration completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to restore identities:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

restoreIdentities();
