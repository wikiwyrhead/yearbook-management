import pg from "pg";
import fs from "fs";
import { requireCanvaPageAccess } from "../src/lib/design/canva.server.ts";

const envFile = fs.readFileSync(".env", "utf8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

let connStr = (process.env.DATABASE_URL || "").replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });

async function testRoleEnforcement() {
  console.log("=== Testing Canva Role & Page Assignment Security Boundaries ===");

  const yearbookId = "f40b6896-9a90-4a14-ac4a-f9e204002716"; // QA Class of 2027
  const superAdminId = "11111111-1111-1111-1111-111111111111"; // System Admin
  const coordAId = "22222222-2222-2222-2222-222222222222"; // Coordinator Center A
  const coordBId = "55555555-5555-5555-5555-555555555555"; // Coordinator Center B
  const memberId = "33333333-3333-3333-3333-333333333333"; // Editorial Member
  const studentId = "44444444-4444-4444-4444-444444444444"; // Student Contributor

  // Fetch 2 pages in this yearbook
  const pageRes = await pool.query(
    `SELECT id, position FROM public.pages WHERE yearbook_id = $1 ORDER BY position LIMIT 2`,
    [yearbookId],
  );
  if (pageRes.rows.length < 2) throw new Error("Need at least 2 pages for testing");
  const page1Id = pageRes.rows[0].id;
  const page2Id = pageRes.rows[1].id;

  // 1. Super Admin Test
  console.log("\n1. Testing Super Admin Permissions...");
  const saAccess = await requireCanvaPageAccess(superAdminId, yearbookId, page1Id);
  console.log("✓ Super Admin access granted:", saAccess);
  if (!saAccess.isSuperAdmin) throw new Error("Super Admin was not recognized!");

  // 2. Active Center Coordinator Test
  console.log("\n2. Testing Center Coordinator Permissions...");
  const coordAccess = await requireCanvaPageAccess(coordAId, yearbookId, page1Id);
  console.log(`✓ Center A Coordinator access granted:`, coordAccess);
  if (!coordAccess.isCoordinator) throw new Error("Coordinator was not recognized!");

  // 3. Cross-Center Coordinator Isolation Test
  console.log("\n3. Testing Cross-Center Coordinator Isolation (Center B accessing Center A)...");
  let crossCenterBlocked = false;
  try {
    await requireCanvaPageAccess(coordBId, yearbookId, page1Id);
  } catch (err) {
    crossCenterBlocked = true;
    console.log(
      `✓ Center B Coordinator correctly blocked from Center A yearbook: "${err.message}"`,
    );
  }
  if (!crossCenterBlocked)
    throw new Error("Security failure: Cross-Center coordinator was not blocked!");

  // 4. Editorial Member Assigned vs Unassigned Page Test
  console.log("\n4. Testing Editorial Member Page Assignment Scoping...");
  // Create active editorial team membership for memberId
  await pool.query(
    `INSERT INTO public.yearbook_team_assignments (yearbook_id, user_id, role, is_active)
     VALUES ($1, $2, 'editorial_member', true)
     ON CONFLICT DO NOTHING`,
    [yearbookId, memberId],
  );

  // Assign member to page 1 only
  await pool.query(
    `INSERT INTO public.page_assignments (page_id, yearbook_id, user_id, kind)
     VALUES ($1, $2, $3, 'designer')
     ON CONFLICT (page_id, user_id, kind) DO NOTHING`,
    [page1Id, yearbookId, memberId],
  );

  // Ensure page 2 is not assigned
  await pool.query(`DELETE FROM public.page_assignments WHERE page_id = $1 AND user_id = $2`, [
    page2Id,
    memberId,
  ]);

  // Test access to assigned page 1
  const p1Access = await requireCanvaPageAccess(memberId, yearbookId, page1Id);
  console.log(
    `✓ Editorial Member assigned to Page 1: Access granted (${p1Access.isAssignedEditor})`,
  );

  // Test access to unassigned page 2 (Must be DENIED)
  let p2Denied = false;
  try {
    await requireCanvaPageAccess(memberId, yearbookId, page2Id);
  } catch (err) {
    p2Denied = true;
    console.log(`✓ Editorial Member denied access to unassigned Page 2: "${err.message}"`);
  }
  if (!p2Denied) throw new Error("Security failure: Editorial member accessed unassigned page!");

  // 5. Advisor Read-Only Restriction Test
  console.log("\n5. Testing Advisor Read-Only Restriction...");
  const advisorUserId = "88888888-8888-8888-8888-888888888888";
  await pool.query(
    `INSERT INTO public.users (id, email, password_hash) VALUES ($1, 'advisor-test@test.yearbook', 'test_hash') ON CONFLICT (id) DO NOTHING`,
    [advisorUserId],
  );
  await pool.query(
    `INSERT INTO public.yearbook_team_assignments (yearbook_id, user_id, role, is_active)
     VALUES ($1, $2, 'advisor', true)
     ON CONFLICT DO NOTHING`,
    [yearbookId, advisorUserId],
  );

  let advisorBlocked = false;
  try {
    await requireCanvaPageAccess(advisorUserId, yearbookId, page1Id);
  } catch (err) {
    advisorBlocked = true;
    console.log(`✓ Advisor correctly blocked from Canva design modification: "${err.message}"`);
  }
  if (!advisorBlocked) throw new Error("Security failure: Advisor was not blocked!");

  // 6. Unassigned Student Contributor Test
  console.log("\n6. Testing Unassigned Student Contributor Access Denied...");
  let studentBlocked = false;
  try {
    await requireCanvaPageAccess(studentId, yearbookId, page1Id);
  } catch (err) {
    studentBlocked = true;
    console.log(`✓ Unassigned student correctly denied Canva access: "${err.message}"`);
  }
  if (!studentBlocked) throw new Error("Security failure: Student was not blocked!");

  await pool.end();
  console.log(
    "\n[PASS] All 6 Canva role, cross-center isolation, and page assignment tests passed 100%!",
  );
  process.exit(0);
}

testRoleEnforcement().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
