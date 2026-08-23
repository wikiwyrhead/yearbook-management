import pg from "pg";
import fs from "fs";

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

async function testMigrations() {
  console.log("=== Testing Canva User-Scoped Database Migrations & Idempotency ===");

  // 1. Verify canva_user_connections table
  const userConnRes = await pool.query(
    `SELECT column_name, data_type, is_nullable 
     FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'canva_user_connections'
     ORDER BY ordinal_position`,
  );
  console.log(`✓ public.canva_user_connections columns count: ${userConnRes.rows.length}`);
  const userCols = userConnRes.rows.map((r) => r.column_name);
  const requiredUserCols = [
    "user_id",
    "canva_user_id",
    "team_id",
    "display_name",
    "credentials",
    "scopes",
    "status",
    "created_at",
    "updated_at",
  ];
  for (const col of requiredUserCols) {
    if (!userCols.includes(col)) throw new Error(`Missing column ${col} in canva_user_connections`);
  }
  console.log("✓ All canva_user_connections columns verified.");

  // 2. Verify canva_designs table
  const designRes = await pool.query(
    `SELECT column_name, data_type 
     FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'canva_designs'
     ORDER BY ordinal_position`,
  );
  console.log(`✓ public.canva_designs columns count: ${designRes.rows.length}`);
  const designCols = designRes.rows.map((r) => r.column_name);
  const requiredDesignCols = [
    "id",
    "yearbook_id",
    "page_id",
    "created_by",
    "canva_design_id",
    "title",
    "thumbnail_url",
    "edit_url",
    "view_url",
    "last_synced_at",
  ];
  for (const col of requiredDesignCols) {
    if (!designCols.includes(col)) throw new Error(`Missing column ${col} in canva_designs`);
  }
  console.log("✓ All canva_designs columns verified.");

  // 3. Test Migration Idempotency by re-running migration script
  const migrationSql = fs.readFileSync(
    "supabase/migrations/009_canva_user_integrations.sql",
    "utf8",
  );
  await pool.query(migrationSql);
  console.log("✓ Migration script re-applied successfully without errors (Idempotent).");

  await pool.end();
  console.log("\n[PASS] Canva migration verification passed 100%!");
}

testMigrations().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
