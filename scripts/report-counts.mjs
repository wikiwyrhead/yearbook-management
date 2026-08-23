import pgPkg from "pg";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
let connStr = envFile
  .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
  .replace("@postgres:5432", "@localhost:5432");
const pool = new pgPkg.Pool({ connectionString: connStr });
const client = await pool.connect();

const oldUserRoles = await client.query("SELECT COUNT(*) FROM public.user_roles");
const oldMembers = await client.query("SELECT COUNT(*) FROM public.yearbook_members");
const oldPageAssignments = await client.query("SELECT COUNT(*) FROM public.page_assignments");

const newMemberships = await client.query("SELECT COUNT(*) FROM public.center_memberships");
const newAppointments = await client.query("SELECT COUNT(*) FROM public.center_role_appointments");
const newTeamAssignments = await client.query(
  "SELECT COUNT(*) FROM public.yearbook_team_assignments",
);
const newAssignedPages = await client.query(
  "SELECT COUNT(*) FROM public.yearbook_assignment_pages",
);
const newAssignedSections = await client.query(
  "SELECT COUNT(*) FROM public.yearbook_assignment_sections",
);

console.log("OLD TABLES:");
console.log("- user_roles count:", oldUserRoles.rows[0].count);
console.log("- yearbook_members count:", oldMembers.rows[0].count);
console.log("- page_assignments count:", oldPageAssignments.rows[0].count);

console.log("\nNEW TABLES:");
console.log("- center_memberships count:", newMemberships.rows[0].count);
console.log("- center_role_appointments count:", newAppointments.rows[0].count);
console.log("- yearbook_team_assignments count:", newTeamAssignments.rows[0].count);
console.log("- yearbook_assignment_pages count:", newAssignedPages.rows[0].count);
console.log("- yearbook_assignment_sections count:", newAssignedSections.rows[0].count);

client.release();
await pool.end();
