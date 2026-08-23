import pg from "pg";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
let connStr = envFile
  .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
  .replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });
const client = await pool.connect();

console.log("=== DIAGNOSING YEARBOOK f40b6896-9a90-4a14-ac4a-f9e204002716 ===");

// 1. Check Yearbook existence
const ybRes = await client.query("SELECT * FROM public.yearbooks WHERE id = $1", [
  "f40b6896-9a90-4a14-ac4a-f9e204002716",
]);
console.log("Yearbook record:", ybRes.rows);

if (ybRes.rows.length > 0) {
  const yb = ybRes.rows[0];
  const schoolRes = await client.query("SELECT * FROM public.schools WHERE id = $1", [
    yb.school_id,
  ]);
  console.log("School/Center record:", schoolRes.rows);

  const pagesRes = await client.query("SELECT COUNT(*) FROM public.pages WHERE yearbook_id = $1", [
    yb.id,
  ]);
  console.log("Pages count:", pagesRes.rows[0].count);

  const sectionsRes = await client.query(
    "SELECT COUNT(*) FROM public.sections WHERE yearbook_id = $1",
    [yb.id],
  );
  console.log("Sections count:", sectionsRes.rows[0].count);

  const teamRes = await client.query(
    "SELECT * FROM public.yearbook_team_assignments WHERE yearbook_id = $1",
    [yb.id],
  );
  console.log("Team assignments:", teamRes.rows);

  const coordApptRes = await client.query(
    "SELECT * FROM public.center_role_appointments WHERE center_id = $1",
    [yb.school_id],
  );
  console.log("Center role appointments:", coordApptRes.rows);

  const centerMemRes = await client.query(
    "SELECT * FROM public.center_memberships WHERE center_id = $1",
    [yb.school_id],
  );
  console.log("Center memberships:", centerMemRes.rows);
}

// 2. Check center_role_appointments table for invalid roles (e.g. 'advisor', 'super_admin')
const allAppts = await client.query("SELECT * FROM public.center_role_appointments");
console.log("\nAll center_role_appointments:", allAppts.rows);

client.release();
await pool.end();
