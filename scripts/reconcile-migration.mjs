import pg from "pg";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
let connStr = envFile
  .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
  .replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });
const client = await pool.connect();

console.log("=== MIGRATION RECONCILIATION AUDIT ===");

// 1. page_assignments breakdown
const totalPageAssignments = await client.query("SELECT COUNT(*) FROM public.page_assignments");
console.log("Total legacy page_assignments:", totalPageAssignments.rows[0].count);

const byKind = await client.query(`
  SELECT kind, COUNT(*) as count
  FROM public.page_assignments
  GROUP BY kind
`);
console.log("Legacy page_assignments by kind:", byKind.rows);

const byUserAndKind = await client.query(`
  SELECT user_id, kind, COUNT(*) as count
  FROM public.page_assignments
  GROUP BY user_id, kind
`);
console.log("Legacy page_assignments by user_id and kind:", byUserAndKind.rows);

const distinctUserPage = await client.query(`
  SELECT COUNT(DISTINCT (user_id, page_id)) FROM public.page_assignments
`);
console.log(
  "Distinct (user_id, page_id) pairs in legacy page_assignments:",
  distinctUserPage.rows[0].count,
);

const totalAssignedPages = await client.query(
  "SELECT COUNT(*) FROM public.yearbook_assignment_pages",
);
console.log("\nTotal new yearbook_assignment_pages:", totalAssignedPages.rows[0].count);

const newByAssignment = await client.query(`
  SELECT yta.user_id, yta.role, COUNT(*) as count
  FROM public.yearbook_assignment_pages yap
  JOIN public.yearbook_team_assignments yta ON yap.assignment_id = yta.id
  GROUP BY yta.user_id, yta.role
`);
console.log("New yearbook_assignment_pages by user_id and role:", newByAssignment.rows);

// 2. yearbook_members breakdown
const totalMembers = await client.query("SELECT COUNT(*) FROM public.yearbook_members");
console.log("\nTotal legacy yearbook_members:", totalMembers.rows[0].count);

const membersList = await client.query(
  "SELECT id, yearbook_id, user_id, role, school_id FROM public.yearbook_members",
);
console.log("Legacy yearbook_members list:", membersList.rows);

const totalCenterMemberships = await client.query("SELECT COUNT(*) FROM public.center_memberships");
const totalAppointments = await client.query(
  "SELECT COUNT(*) FROM public.center_role_appointments",
);
const totalTeamAssignments = await client.query(
  "SELECT COUNT(*) FROM public.yearbook_team_assignments",
);

console.log("\nNew table counts:");
console.log("- center_memberships:", totalCenterMemberships.rows[0].count);
console.log("- center_role_appointments:", totalAppointments.rows[0].count);
console.log("- yearbook_team_assignments:", totalTeamAssignments.rows[0].count);

const teamAssignList = await client.query(
  "SELECT id, yearbook_id, user_id, role, is_active FROM public.yearbook_team_assignments",
);
console.log("New yearbook_team_assignments list:", teamAssignList.rows);

const apptList = await client.query(
  "SELECT id, center_id, user_id, role, is_active FROM public.center_role_appointments",
);
console.log("New center_role_appointments list:", apptList.rows);

const centerMemList = await client.query(
  "SELECT id, center_id, user_id, member_type, is_active FROM public.center_memberships",
);
console.log("New center_memberships list:", centerMemList.rows);

client.release();
await pool.end();
