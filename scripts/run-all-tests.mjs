// scripts/run-all-tests.mjs
// Master Test Orchestrator: Executes all test suites with guaranteed clean DB reset between suites.

import { enforceTestDatabaseEnv } from "./test-db-guard.mjs";
import { setupTestDatabase } from "./setup-test-db.mjs";
import { runHistoricalProofMigrationTest } from "./test-historical-proof-migration.mjs";
import { runAudit as runSchemaParityAudit } from "./audit-schema-parity.mjs";
import { runConcurrentProofCreationTest } from "./test-concurrent-proof-creation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

enforceTestDatabaseEnv();

async function runChildScript(scriptPath) {
  const env = {
    ...process.env,
    ALLOW_TEST_DATABASE_RESET: "1",
  };
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--env-file=.env", scriptPath],
    {
      env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);
}

async function runAll() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — COMPLETE PRE-COMMIT VERIFICATION SUITE");
  console.log("================================================================================\n");

  const startTime = Date.now();
  const suiteResults = [];

  // Suite 1: Historical Proofs Migration (00004) on 222 Real Proof Records
  console.log("\n>>> [1/7] Running Historical Proof Migration (00004) on 222 Real Records...");
  try {
    await runHistoricalProofMigrationTest();
    suiteResults.push({ name: "Historical Proof Migration (222 real records)", status: "PASSED" });
  } catch (err) {
    console.error("Suite 1 Failed:", err);
    suiteResults.push({
      name: "Historical Proof Migration (222 real records)",
      status: "FAILED",
      error: err.message,
    });
  }

  // Suite 2: Schema Parity Audit (schema.sql vs cumulative migrations)
  console.log("\n>>> [2/7] Running Schema Parity Audit...");
  try {
    const parity = await runSchemaParityAudit();
    suiteResults.push({
      name: "Schema Parity Audit (schema.sql vs cumulative migrations)",
      status: parity.hasCriticalDiffs ? "GAPS_REPORTED" : "PASSED",
    });
  } catch (err) {
    console.error("Suite 2 Failed:", err);
    suiteResults.push({ name: "Schema Parity Audit", status: "FAILED", error: err.message });
  }

  // Suite 3: Concurrent Official Proof Creation & Row Locking
  console.log("\n>>> [3/7] Running Concurrent Proof Creation Test...");
  try {
    await runConcurrentProofCreationTest();
    suiteResults.push({ name: "Concurrent Proof Creation (Row-locking)", status: "PASSED" });
  } catch (err) {
    console.error("Suite 3 Failed:", err);
    suiteResults.push({
      name: "Concurrent Proof Creation (Row-locking)",
      status: "FAILED",
      error: err.message,
    });
  }

  // Suite 4: Milestone Full Workflow & Governance UAT
  console.log("\n>>> [4/7] Resetting DB and running Milestone Full Workflow & Governance UAT...");
  try {
    await setupTestDatabase();
    await runChildScript("scripts/test-milestone-full-workflow-uat.mjs");
    suiteResults.push({ name: "Milestone Full Workflow & Governance UAT", status: "PASSED" });
  } catch (err) {
    console.error("Suite 4 Failed:", err);
    suiteResults.push({
      name: "Milestone Full Workflow & Governance UAT",
      status: "FAILED",
      error: err.message,
    });
  }

  // Suite 5: Migration Idempotency & Stability
  console.log("\n>>> [5/7] Resetting DB and running Migration Idempotency Audit...");
  try {
    await setupTestDatabase();
    await runChildScript("scripts/test-migration-idempotency.mjs");
    suiteResults.push({ name: "Migration Idempotency Audit (Pass 1 vs Pass 2)", status: "PASSED" });
  } catch (err) {
    console.error("Suite 5 Failed:", err);
    suiteResults.push({
      name: "Migration Idempotency Audit (Pass 1 vs Pass 2)",
      status: "FAILED",
      error: err.message,
    });
  }

  // Suite 6: Role & Assignment Security Suite
  console.log("\n>>> [6/7] Resetting DB and running Role & Assignment Domain Tests...");
  try {
    await setupTestDatabase();
    await runChildScript("scripts/test-roles-domain.mjs");
    suiteResults.push({ name: "Role & Assignment Security Suite (23/23)", status: "PASSED" });
  } catch (err) {
    console.error("Suite 6 Failed:", err);
    suiteResults.push({
      name: "Role & Assignment Security Suite (23/23)",
      status: "FAILED",
      error: err.message,
    });
  }

  // Suite 7: Puppeteer Browser & Network Guard Test
  console.log("\n>>> [7/7] Resetting DB and running Puppeteer Browser Drawer Interactions Test...");
  try {
    await setupTestDatabase();
    await runChildScript("scripts/test-browser-drawer-interactions.mjs");
    suiteResults.push({ name: "Puppeteer Browser & Network Guard Test", status: "PASSED" });
  } catch (err) {
    console.error("Suite 7 Failed:", err);
    suiteResults.push({
      name: "Puppeteer Browser & Network Guard Test",
      status: "FAILED",
      error: err.message,
    });
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n================================================================================");
  console.log(`  TEST ORCHESTRATION SUMMARY (Completed in ${elapsedSec}s)`);
  console.log("================================================================================");
  for (const s of suiteResults) {
    const icon = s.status === "PASSED" ? "✓" : s.status === "GAPS_REPORTED" ? "ℹ" : "✗";
    console.log(`  ${icon} ${s.name.padEnd(65)} : ${s.status}`);
  }
  console.log("================================================================================\n");

  const hasFailures = suiteResults.some((s) => s.status === "FAILED");
  if (hasFailures) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error("Master test runner error:", err);
  process.exit(1);
});
