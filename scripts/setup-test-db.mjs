// scripts/setup-test-db.mjs
import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { enforceTestDatabaseEnv } from "./test-db-guard.mjs";
import { seedDemoData } from "./seed-demo-data.mjs";

const { Pool } = pg;

export async function setupTestDatabase() {
  if (process.env.ALLOW_TEST_DATABASE_RESET !== "1") {
    console.error("REFUSED: ALLOW_TEST_DATABASE_RESET=1 required to reset the test database.");
    process.exit(1);
  }

  enforceTestDatabaseEnv();

  const testUrl = process.env.TEST_DATABASE_URL;
  let normalizedTestUrl = testUrl;
  if (normalizedTestUrl.includes("@postgres:5432")) {
    normalizedTestUrl = normalizedTestUrl.replace("@postgres:5432", "@localhost:5432");
  }

  // 1. Connect to admin postgres database to verify/create database existence
  const adminUrl = normalizedTestUrl.replace(
    /\/yearbook_disposable_test_db(\?.*)?$/,
    "/postgres$1",
  );
  const adminPool = new Pool({ connectionString: adminUrl });
  try {
    const checkDb = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'yearbook_disposable_test_db'",
    );
    if (checkDb.rows.length === 0) {
      console.log("[SetupTestDB] Creating database 'yearbook_disposable_test_db'...");
      await adminPool.query("CREATE DATABASE yearbook_disposable_test_db");
    }
  } finally {
    await adminPool.end();
  }

  // 2. Connect directly to yearbook_disposable_test_db
  const testPool = new Pool({ connectionString: normalizedTestUrl });
  const client = await testPool.connect();

  try {
    // 3. Validate active database connection
    const currentDbRes = await client.query("SELECT current_database();");
    const currentDb = currentDbRes.rows[0]?.current_database;
    if (currentDb !== "yearbook_disposable_test_db") {
      throw new Error(
        `REFUSED: Connected to database '${currentDb}', expected 'yearbook_disposable_test_db'.`,
      );
    }

    // 4. Verify existing disposable marker if tables exist
    const tablesCountRes = await client.query(
      "SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tableCount = tablesCountRes.rows[0]?.count || 0;

    if (tableCount > 0) {
      const markerCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = '__disposable_test_db_marker__'
        ) as has_marker;
      `);
      if (!markerCheck.rows[0]?.has_marker) {
        throw new Error(
          "REFUSED: Existing database lacks disposable marker table '__disposable_test_db_marker__'.",
        );
      }
    }

    console.log("[SetupTestDB] Resetting public schema in 'yearbook_disposable_test_db'...");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

    // 5. Apply base schema.sql
    const baseSchemaPath = path.resolve(process.cwd(), "src/lib/db/schema.sql");
    const baseSql = await fs.readFile(baseSchemaPath, "utf8");
    console.log("[SetupTestDB] Applying base schema.sql...");
    await client.query(baseSql);

    // 6. Recreate and assert disposable marker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.__disposable_test_db_marker__ (
        id serial PRIMARY KEY,
        marker text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.__disposable_test_db_marker__ (marker) VALUES ('disposable_test_db_verified');
    `);

    const markerVerify = await client.query(
      "SELECT count(*)::int as cnt FROM public.__disposable_test_db_marker__",
    );
    if (markerVerify.rows[0]?.cnt < 1) {
      throw new Error("FATAL: Failed to verify recreated marker in disposable test database.");
    }

    // 7. Apply latest incremental migrations (production blueprints, signoffs, readiness, canva tasks, classification)
    const incrementalMigrations = [
      "20260824000000_production_blueprints.sql",
      "20260824000001_production_triggers_and_signoffs.sql",
      "20260824000002_readiness_manifest_and_drift.sql",
      "20260824000003_canva_implementation_tasks.sql",
      "20260824000004_classify_historical_proofs.sql",
    ];
    const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
    console.log(`[SetupTestDB] Applying incremental feature migrations...`);
    for (const sqlFile of incrementalMigrations) {
      const filePath = path.join(migrationsDir, sqlFile);
      const sql = await fs.readFile(filePath, "utf8");
      try {
        await client.query(sql);
      } catch (migErr) {
        console.error(`[SetupTestDB] Migration failed on ${sqlFile}:`, migErr.message);
        throw migErr;
      }
    }
    console.log("[SetupTestDB] Migrations applied successfully.");
  } finally {
    client.release();
    await testPool.end();
  }

  // 8. Bootstrap core test accounts and fixtures via seedDemoData
  console.log("[SetupTestDB] Seeding test accounts and baseline fixtures...");
  await seedDemoData(normalizedTestUrl);

  console.log("[SetupTestDB] Disposable test database is fully provisioned and ready.");
}

// Allow direct execution: ALLOW_TEST_DATABASE_RESET=1 node scripts/setup-test-db.mjs
if (process.argv[1]?.endsWith("setup-test-db.mjs")) {
  setupTestDatabase().catch((err) => {
    console.error("[SetupTestDB Fatal Error]:", err);
    process.exit(1);
  });
}
