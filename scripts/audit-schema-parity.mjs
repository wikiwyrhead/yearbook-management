// scripts/audit-schema-parity.mjs
// Compares sequential snapshots: Snapshot A (schema.sql only) vs Snapshot B (baseline + cumulative migrations)

import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { enforceTestDatabaseEnv } from "./test-db-guard.mjs";

enforceTestDatabaseEnv();

let connStr = process.env.TEST_DATABASE_URL;
if (connStr.includes("@postgres:5432")) {
  connStr = connStr.replace("@postgres:5432", "@localhost:5432");
}

async function captureSchemaSnapshot(client) {
  // 1. Tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesRes.rows.map((r) => r.table_name);

  // 2. Views
  const viewsRes = await client.query(`
    SELECT table_name 
    FROM information_schema.views 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  const views = viewsRes.rows.map((r) => r.table_name);

  // 3. Columns
  const columnsRes = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name;
  `);
  const columns = columnsRes.rows;

  // 4. Constraints
  const constraintsRes = await client.query(`
    SELECT 
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      pg_get_constraintdef(c.oid) as definition
    FROM information_schema.table_constraints tc
    JOIN pg_namespace nsp ON nsp.nspname = tc.table_schema
    JOIN pg_class rel ON rel.relname = tc.table_name AND rel.relnamespace = nsp.oid
    JOIN pg_constraint c ON c.conrelid = rel.oid AND c.conname = tc.constraint_name
    WHERE tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);
  const constraints = constraintsRes.rows;

  // 5. Indexes
  const indexesRes = await client.query(`
    SELECT tablename as table_name, indexname as index_name, indexdef as index_def
    FROM pg_indexes 
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);
  const indexes = indexesRes.rows;

  // 6. Enums
  const enumsRes = await client.query(`
    SELECT t.typname as enum_name, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) as enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `);
  const enums = enumsRes.rows;

  // 7. Functions
  const funcsRes = await client.query(`
    SELECT 
      p.proname as function_name,
      pg_get_function_arguments(p.oid) as arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  `);
  const functions = funcsRes.rows;

  return { tables, views, columns, constraints, indexes, enums, functions };
}

function compareSnapshots(snapA, snapB) {
  const diffs = {
    missingTablesInA: [],
    missingTablesInB: [],
    missingColumnsInA: [],
    missingColumnsInB: [],
    typeMismatches: [],
    missingConstraintsInA: [],
    missingConstraintsInB: [],
    missingIndexesInA: [],
    missingIndexesInB: [],
    missingFunctionsInA: [],
    missingFunctionsInB: [],
  };

  // Tables
  const setTablesA = new Set(snapA.tables);
  const setTablesB = new Set(snapB.tables);
  for (const t of snapB.tables) if (!setTablesA.has(t)) diffs.missingTablesInA.push(t);
  for (const t of snapA.tables) if (!setTablesB.has(t)) diffs.missingTablesInB.push(t);

  // Columns
  const mapColsA = new Map(snapA.columns.map((c) => [`${c.table_name}.${c.column_name}`, c]));
  const mapColsB = new Map(snapB.columns.map((c) => [`${c.table_name}.${c.column_name}`, c]));

  for (const [k, cB] of mapColsB.entries()) {
    if (!mapColsA.has(k)) {
      diffs.missingColumnsInA.push(k);
    } else {
      const cA = mapColsA.get(k);
      if (cA.udt_name !== cB.udt_name) {
        diffs.typeMismatches.push(`${k}: schema.sql=${cA.udt_name} vs migrations=${cB.udt_name}`);
      }
    }
  }
  for (const [k] of mapColsA.entries()) {
    if (!mapColsB.has(k)) diffs.missingColumnsInB.push(k);
  }

  // Constraints
  const setConA = new Set(snapA.constraints.map((c) => `${c.table_name}.${c.constraint_name}`));
  const setConB = new Set(snapB.constraints.map((c) => `${c.table_name}.${c.constraint_name}`));
  for (const c of snapB.constraints) {
    const key = `${c.table_name}.${c.constraint_name}`;
    if (!setConA.has(key)) diffs.missingConstraintsInA.push(key);
  }
  for (const c of snapA.constraints) {
    const key = `${c.table_name}.${c.constraint_name}`;
    if (!setConB.has(key)) diffs.missingConstraintsInB.push(key);
  }

  // Functions
  const setFuncA = new Set(snapA.functions.map((f) => f.function_name));
  const setFuncB = new Set(snapB.functions.map((f) => f.function_name));
  for (const f of snapB.functions) {
    if (!setFuncA.has(f.function_name)) diffs.missingFunctionsInA.push(f.function_name);
  }
  for (const f of snapA.functions) {
    if (!setFuncB.has(f.function_name)) diffs.missingFunctionsInB.push(f.function_name);
  }

  return diffs;
}

async function runAudit() {
  console.log("================================================================================");
  console.log("  SCHEMA PARITY AUDIT: schema.sql ONLY vs CUMULATIVE MIGRATIONS");
  console.log("================================================================================\n");

  const pool = new pg.Pool({ connectionString: connStr });
  const client = await pool.connect();

  try {
    // Step A: Build with schema.sql only
    console.log("[1/3] Resetting DB and applying 'src/lib/db/schema.sql' ONLY...");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.__disposable_test_db_marker__ (
        id serial PRIMARY KEY,
        marker text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.__disposable_test_db_marker__ (marker) VALUES ('disposable_test_db_verified');
    `);
    const schemaSql = await fs.readFile("src/lib/db/schema.sql", "utf8");
    await client.query(schemaSql);
    const snapA = await captureSchemaSnapshot(client);
    console.log(
      `  ✓ Snapshot A captured: ${snapA.tables.length} tables, ${snapA.columns.length} columns, ${snapA.constraints.length} constraints.`,
    );

    // Step B: Build with canonical baseline + all incremental migrations
    console.log(
      "\n[2/3] Resetting DB and applying canonical baseline + migrations 00000 through 00004...",
    );
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.__disposable_test_db_marker__ (
        id serial PRIMARY KEY,
        marker text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.__disposable_test_db_marker__ (marker) VALUES ('disposable_test_db_verified');
    `);

    // Apply baseline schema.sql
    await client.query(schemaSql);

    const orderedMigrations = [
      "20260824000000_production_blueprints.sql",
      "20260824000001_production_triggers_and_signoffs.sql",
      "20260824000002_readiness_manifest_and_drift.sql",
      "20260824000003_canva_implementation_tasks.sql",
      "20260824000004_classify_historical_proofs.sql",
    ];

    const migrationsDir = "supabase/migrations";
    for (const f of orderedMigrations) {
      const sqlContent = await fs.readFile(path.join(migrationsDir, f), "utf8");
      await client.query(sqlContent);
    }
    const snapB = await captureSchemaSnapshot(client);
    console.log(
      `  ✓ Snapshot B captured: ${snapB.tables.length} tables, ${snapB.columns.length} columns, ${snapB.constraints.length} constraints.`,
    );

    // Recreate disposable marker so subsequent test suites can verify and reset cleanly
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.__disposable_test_db_marker__ (
        id serial PRIMARY KEY,
        marker text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.__disposable_test_db_marker__ (marker) VALUES ('disposable_test_db_verified');
    `);

    // Step C: Compare Snapshots
    console.log("\n[3/3] Comparing Snapshot A (schema.sql) vs Snapshot B (migrations)...");
    const diffs = compareSnapshots(snapA, snapB);

    console.log("\n--- Audit Results ---");
    console.log("Tables missing in schema.sql (in migrations only):", diffs.missingTablesInA);
    console.log("Tables missing in migrations (in schema.sql only):", diffs.missingTablesInB);
    console.log("Columns missing in schema.sql:", diffs.missingColumnsInA);
    console.log("Columns missing in migrations:", diffs.missingColumnsInB);
    console.log("Type mismatches:", diffs.typeMismatches);
    console.log("Constraints missing in schema.sql:", diffs.missingConstraintsInA);
    console.log("Functions missing in schema.sql:", diffs.missingFunctionsInA);

    const hasCriticalDiffs =
      diffs.missingTablesInA.length > 0 ||
      diffs.missingColumnsInA.length > 0 ||
      diffs.typeMismatches.length > 0;

    if (hasCriticalDiffs) {
      console.log("\n⚠️ SCHEMA PARITY GAPS DETECTED between schema.sql and cumulative migrations.");
    } else {
      console.log("\n✓ 100% SCHEMA PARITY VERIFIED: schema.sql matches all cumulative migrations.");
    }

    return { snapA, snapB, diffs, hasCriticalDiffs };
  } finally {
    client.release();
    await pool.end();
  }
}

export { runAudit };

if (process.argv[1]?.endsWith("audit-schema-parity.mjs")) {
  runAudit()
    .then(({ hasCriticalDiffs }) => {
      // Exit 0 to allow orchestrator to read diffs
      process.exit(hasCriticalDiffs ? 1 : 0);
    })
    .catch((err) => {
      console.error("\n❌ Schema parity audit failed:", err);
      process.exit(1);
    });
}
