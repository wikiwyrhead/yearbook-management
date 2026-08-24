// scripts/test-historical-proof-migration.mjs
// Tests migration 20260824000004 against a disposable database populated with
// the actual 222 historical proof rows extracted read-only from yearbook_db.

import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { enforceTestDatabaseEnv } from "./test-db-guard.mjs";

enforceTestDatabaseEnv();

let testConnStr = process.env.TEST_DATABASE_URL;
if (testConnStr.includes("@postgres:5432")) {
  testConnStr = testConnStr.replace("@postgres:5432", "@localhost:5432");
}

let devConnStr = testConnStr.replace(/\/yearbook_disposable_test_db(\?.*)?$/, "/yearbook_db$1");

export async function runHistoricalProofMigrationTest() {
  console.log("================================================================================");
  console.log("  HISTORICAL PROOF MIGRATION (00004) ON REAL HISTORICAL DATA");
  console.log("================================================================================\n");

  const testPool = new pg.Pool({ connectionString: testConnStr });
  const devPool = new pg.Pool({ connectionString: devConnStr });

  const testClient = await testPool.connect();
  const devClient = await devPool.connect();

  try {
    // 1. Verify source and target databases
    const devDbName = (await devClient.query("SELECT current_database()")).rows[0].current_database;
    const testDbName = (await testClient.query("SELECT current_database()")).rows[0]
      .current_database;
    console.log(`[Read-Only Source] Connected to: ${devDbName}`);
    console.log(`[Disposable Target] Connected to: ${testDbName}`);

    if (devDbName !== "yearbook_db") {
      throw new Error(`REFUSED: Source database is '${devDbName}', expected 'yearbook_db'`);
    }
    if (testDbName !== "yearbook_disposable_test_db") {
      throw new Error(
        `REFUSED: Target database is '${testDbName}', expected 'yearbook_disposable_test_db'`,
      );
    }

    // 2. Reset test database public schema
    console.log("\n[1/6] Resetting public schema in disposable test database...");
    await testClient.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await testClient.query(`
      CREATE TABLE IF NOT EXISTS public.__disposable_test_db_marker__ (
        id serial PRIMARY KEY,
        marker text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.__disposable_test_db_marker__ (marker) VALUES ('disposable_test_db_verified');
    `);

    // 3. Apply baseline schema and migrations through 00003 (pre-00004 state)
    console.log("[2/6] Applying base schema and migrations through 20260824000003...");
    const baseSql = await fs.readFile("src/lib/db/schema.sql", "utf8");
    await testClient.query(baseSql);

    const preMigrations = [
      "20260824000000_production_blueprints.sql",
      "20260824000001_production_triggers_and_signoffs.sql",
      "20260824000002_readiness_manifest_and_drift.sql",
      "20260824000003_canva_implementation_tasks.sql",
    ];

    for (const f of preMigrations) {
      const sql = await fs.readFile(path.join("supabase/migrations", f), "utf8");
      await testClient.query(sql);
    }

    // Remove pre-existing 00004 columns/constraints if they exist in schema.sql
    await testClient.query(`
      ALTER TABLE public.proofs DROP CONSTRAINT IF EXISTS chk_proof_round_classification_enum;
      ALTER TABLE public.proofs DROP CONSTRAINT IF EXISTS chk_proof_official_round_number;
      DROP INDEX IF EXISTS public.uq_official_round_number;
      ALTER TABLE public.proofs DROP COLUMN IF EXISTS round_classification;
      ALTER TABLE public.proofs DROP COLUMN IF EXISTS official_round_number;
    `);

    // 4. Extract parent fixtures from dev DB (users -> schools -> yearbooks) dynamically
    console.log(
      "\n[3/6] Extracting parent records (users, schools, yearbooks) from yearbook_db...",
    );

    // Users
    const devUsers = (
      await devClient.query("SELECT id, email, password_hash, full_name FROM public.users")
    ).rows;
    for (const u of devUsers) {
      await testClient.query(
        "INSERT INTO public.users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
        [u.id, u.email, u.password_hash, u.full_name],
      );
    }

    // Schools
    const devSchools = (
      await devClient.query("SELECT id, name, created_by, is_active FROM public.schools")
    ).rows;
    for (const s of devSchools) {
      await testClient.query(
        "INSERT INTO public.schools (id, name, created_by, is_active) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
        [s.id, s.name, s.created_by, s.is_active],
      );
    }

    // Yearbooks
    const devYearbooks = (
      await devClient.query(
        "SELECT id, school_id, title, year, page_count, created_by FROM public.yearbooks",
      )
    ).rows;
    for (const y of devYearbooks) {
      await testClient.query(
        "INSERT INTO public.yearbooks (id, school_id, title, year, page_count, created_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
        [y.id, y.school_id, y.title, y.year, y.page_count, y.created_by],
      );
    }

    // 5. Extract all historical proofs dynamically from dev DB (without personal/OAuth data)
    console.log("[4/6] Extracting all 222 historical proofs from yearbook_db...");
    const devColsRes = await devClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'proofs'
        AND column_name NOT IN ('round_classification', 'official_round_number')
      ORDER BY ordinal_position;
    `);
    const cols = devColsRes.rows.map((r) => r.column_name);

    const devProofsRes = await devClient.query(
      `SELECT ${cols.join(", ")} FROM public.proofs ORDER BY created_at ASC`,
    );
    const historicalProofs = devProofsRes.rows;
    console.log(`  ✓ Extracted ${historicalProofs.length} proof records from yearbook_db.`);
    assert.equal(
      historicalProofs.length,
      222,
      "Expected exactly 222 historical proof rows in yearbook_db",
    );

    for (const p of historicalProofs) {
      const colNames = cols.join(", ");
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
      const values = cols.map((col) => p[col]);
      await testClient.query(
        `INSERT INTO public.proofs (${colNames}) VALUES (${placeholders})`,
        values,
      );
    }

    const unmigratedCount = (
      await testClient.query("SELECT count(*)::int as cnt FROM public.proofs")
    ).rows[0].cnt;
    assert.equal(unmigratedCount, 222, "Failed to copy all 222 proof records to test DB");
    console.log(
      `  ✓ Successfully loaded ${unmigratedCount} unmigrated proof records into public.proofs on disposable DB.`,
    );

    // 6. Apply migration 20260824000004_classify_historical_proofs.sql
    console.log("\n[5/6] Executing migration '20260824000004_classify_historical_proofs.sql'...");
    const mig00004Sql = await fs.readFile(
      "supabase/migrations/20260824000004_classify_historical_proofs.sql",
      "utf8",
    );
    await testClient.query(mig00004Sql);
    console.log("  ✓ Migration 00004 applied cleanly without SQL errors.");

    // 7. Verify Classification Totals & Constraints
    console.log("\n[6/6] Verifying classification totals, constraints, and index integrity...");

    // Legacy & Horizons classification breakdown
    const legacyYbId = "aaaaaaa2-2222-2222-2222-222222222222";
    const legacyStats = (
      await testClient.query(
        `
      SELECT 
        count(*)::int as total,
        count(CASE WHEN round_classification = 'legacy_preview' THEN 1 END)::int as preview_count,
        count(CASE WHEN round_classification = 'development_test' THEN 1 END)::int as test_count,
        count(CASE WHEN round_classification = 'unknown' THEN 1 END)::int as unknown_count,
        count(CASE WHEN round_classification = 'official_master' THEN 1 END)::int as master_count
      FROM public.proofs
      WHERE yearbook_id = $1
    `,
        [legacyYbId],
      )
    ).rows[0];

    console.log("  Legacy & Horizons Classification:", legacyStats);
    assert.equal(legacyStats.total, 221, "Legacy & Horizons must have exactly 221 proofs");
    assert.equal(legacyStats.preview_count, 1, "Legacy & Horizons must have 1 legacy_preview");
    assert.equal(legacyStats.test_count, 2, "Legacy & Horizons must have 2 development_test");
    assert.equal(legacyStats.unknown_count, 218, "Legacy & Horizons must have 218 unknown");
    assert.equal(legacyStats.master_count, 0, "Legacy & Horizons must have 0 official_master");

    // Milestone 2025 classification breakdown
    const milestoneYbId = "ddddddd2-2222-2222-2222-222222222222";
    const milestoneStats = (
      await testClient.query(
        `
      SELECT 
        count(*)::int as total,
        count(CASE WHEN round_classification = 'official_master' THEN 1 END)::int as master_count,
        max(official_round_number) as official_num
      FROM public.proofs
      WHERE yearbook_id = $1
    `,
        [milestoneYbId],
      )
    ).rows[0];

    console.log("  Milestone 2025 Classification:", milestoneStats);
    assert.equal(milestoneStats.total, 1, "Milestone 2025 must have exactly 1 proof");
    assert.equal(
      milestoneStats.master_count,
      1,
      "Milestone 2025 proof must be classified as official_master",
    );
    assert.equal(
      milestoneStats.official_num,
      1,
      "Milestone 2025 proof official_round_number must be 1",
    );

    // Constraint Verification
    console.log("\n  Testing check constraints and unique index enforcement...");

    // Negative test 1: Illegal classification value
    await assert.rejects(
      testClient.query(
        `
        INSERT INTO public.proofs (yearbook_id, created_by, round_name, round_number, round_classification)
        VALUES ($1, $2, 'Negative Test Proof', 991, 'invalid_classification')
      `,
        [milestoneYbId, devUsers[0].id],
      ),
      /chk_proof_round_classification_enum/,
      "Database must reject invalid round_classification value",
    );
    console.log(
      "  ✓ Negative test passed: 'chk_proof_round_classification_enum' rejected invalid classification.",
    );

    // Negative test 2: official_master without official_round_number
    await assert.rejects(
      testClient.query(
        `
        INSERT INTO public.proofs (yearbook_id, created_by, round_name, round_number, round_classification, official_round_number)
        VALUES ($1, $2, 'Negative Test Proof', 992, 'official_master', NULL)
      `,
        [milestoneYbId, devUsers[0].id],
      ),
      /chk_proof_official_round_number/,
      "Database must reject official_master with NULL official_round_number",
    );
    console.log(
      "  ✓ Negative test passed: 'chk_proof_official_round_number' rejected official_master with NULL number.",
    );

    // Negative test 3: non-official classification with non-null official_round_number
    await assert.rejects(
      testClient.query(
        `
        INSERT INTO public.proofs (yearbook_id, created_by, round_name, round_number, round_classification, official_round_number)
        VALUES ($1, $2, 'Negative Test Proof', 993, 'unknown', 5)
      `,
        [milestoneYbId, devUsers[0].id],
      ),
      /chk_proof_official_round_number/,
      "Database must reject unknown classification with non-null official_round_number",
    );
    console.log(
      "  ✓ Negative test passed: 'chk_proof_official_round_number' rejected unknown classification with number.",
    );

    // Negative test 4: Duplicate official_round_number for same yearbook
    await assert.rejects(
      testClient.query(
        `
        INSERT INTO public.proofs (yearbook_id, created_by, round_name, round_number, round_classification, official_round_number)
        VALUES ($1, $2, 'Negative Test Proof', 994, 'official_master', 1)
      `,
        [milestoneYbId, devUsers[0].id],
      ),
      /uq_official_round_number/,
      "Database must reject duplicate official_round_number for same yearbook",
    );
    console.log(
      "  ✓ Negative test passed: 'uq_official_round_number' rejected duplicate official round number.",
    );

    console.log(
      "\n================================================================================",
    );
    console.log("  HISTORICAL MIGRATION (00004) ON 222 REAL ROWS: 100% PASSED");
    console.log(
      "================================================================================\n",
    );

    return { success: true, legacyStats, milestoneStats };
  } finally {
    testClient.release();
    devClient.release();
    await testPool.end();
    await devPool.end();
  }
}

if (process.argv[1]?.endsWith("test-historical-proof-migration.mjs")) {
  runHistoricalProofMigrationTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Historical proof migration test failed:", err);
      process.exit(1);
    });
}
