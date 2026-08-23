import pg from "pg";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
let connStr = envFile
  .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
  .replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });

async function check() {
  const centerRes = await pool.query(
    "SELECT id, center_id, provider, account_email, status, root_folder_id, updated_at FROM public.center_storage_connections",
  );
  console.log("Center connections count:", centerRes.rows.length);
  console.log(JSON.stringify(centerRes.rows, null, 2));

  const ybConfig = await pool.query(
    "SELECT * FROM public.yearbook_storage_config WHERE yearbook_id = 'f40b6896-9a90-4a14-ac4a-f9e204002716'",
  );
  console.log("Yearbook config:", JSON.stringify(ybConfig.rows, null, 2));

  await pool.end();
}

check().catch(console.error);
