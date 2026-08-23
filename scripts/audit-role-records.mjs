import pg from "pg";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
let connStr = envFile
  .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
  .replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });
const client = await pool.connect();

console.log("=== CURRENT ROLE & APPOINTMENT AUDIT ===");

const userRoles = await client.query(
  "SELECT ur.id, ur.user_id, u.email, ur.role FROM public.user_roles ur JOIN public.users u ON ur.user_id = u.id",
);
console.log("\n1. user_roles (Global):", userRoles.rows);

const centerMemberships = await client.query(
  "SELECT cm.id, cm.center_id, s.name as center_name, cm.user_id, u.email, cm.member_type, cm.is_active FROM public.center_memberships cm JOIN public.users u ON cm.user_id = u.id JOIN public.schools s ON cm.center_id = s.id",
);
console.log("\n2. center_memberships:", centerMemberships.rows);

const centerAppts = await client.query(
  "SELECT cra.id, cra.center_id, s.name as center_name, cra.user_id, u.email, cra.role, cra.is_active FROM public.center_role_appointments cra JOIN public.users u ON cra.user_id = u.id JOIN public.schools s ON cra.center_id = s.id",
);
console.log("\n3. center_role_appointments:", centerAppts.rows);

const teamAssigns = await client.query(
  "SELECT yta.id, yta.yearbook_id, y.title as yearbook_title, yta.user_id, u.email, yta.role, yta.is_active FROM public.yearbook_team_assignments yta JOIN public.users u ON yta.user_id = u.id JOIN public.yearbooks y ON yta.yearbook_id = y.id",
);
console.log("\n4. yearbook_team_assignments:", teamAssigns.rows);

client.release();
await pool.end();
