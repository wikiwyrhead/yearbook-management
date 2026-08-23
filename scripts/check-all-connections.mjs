import pg from "pg";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
let connStr = envFile
  .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
  .replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });

async function checkAll() {
  const orgRes = await pool.query(
    "SELECT id, provider, root_folder_id, updated_at FROM public.organization_storage_connections",
  );
  console.log("Org connections count:", orgRes.rows.length);
  console.log(JSON.stringify(orgRes.rows, null, 2));

  const memRes = await pool.query(
    "SELECT id, user_id, provider, account_email, updated_at FROM public.member_storage_connections",
  );
  console.log("Member connections count:", memRes.rows.length);
  console.log(JSON.stringify(memRes.rows, null, 2));

  await pool.end();
}

checkAll().catch(console.error);
