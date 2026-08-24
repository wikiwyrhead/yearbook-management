import pg from "pg";
import { enforceTestDatabaseEnv } from "./test-db-guard.mjs";
import { runMigration } from "./migrate-domain-roles.mjs";

enforceTestDatabaseEnv();

let connStr = process.env.TEST_DATABASE_URL;
if (connStr.includes("@postgres:5432")) {
  connStr = connStr.replace("@postgres:5432", "@localhost:5432");
}
const pool = new pg.Pool({ connectionString: connStr });

async function runIdempotencyAudit() {
  const client = await pool.connect();
  console.log("================================================================================");
  console.log("  MIGRATION IDEMPOTENCY & STABILITY AUDIT");
  console.log("================================================================================");

  async function getTableChecksums() {
    const tables = [
      "center_memberships",
      "center_role_appointments",
      "yearbook_team_assignments",
      "yearbook_assignment_pages",
      "yearbook_assignment_sections",
    ];
    const stats = {};
    for (const t of tables) {
      const countRes = await client.query(`SELECT COUNT(*) FROM public.${t}`);
      const md5Res = await client.query(
        `SELECT md5(string_agg(id::text, ',' ORDER BY id)) as hash FROM public.${t}`,
      );
      stats[t] = {
        count: parseInt(countRes.rows[0].count, 10),
        checksum: md5Res.rows[0].hash || "empty",
      };
    }
    return stats;
  }

  // Baseline state
  const baseline = await getTableChecksums();
  console.log("\n[Pass 1 Baseline Counts & Checksums]:");
  for (const [tbl, data] of Object.entries(baseline)) {
    console.log(`  - ${tbl}: count=${data.count}, checksum=${data.checksum.slice(0, 12)}...`);
  }

  // Execution 1
  console.log("\n--- Executing Migration Pass 1 ---");
  const pass1 = await runMigration();
  const afterPass1 = await getTableChecksums();
  console.log("  Pass 1 result: Success");

  // Execution 2
  console.log("\n--- Executing Migration Pass 2 (Idempotency Check) ---");
  const pass2 = await runMigration();
  const afterPass2 = await getTableChecksums();
  console.log("  Pass 2 result: Success");

  // Compare Pass 1 vs Pass 2
  let isIdempotent = true;
  console.log("\n[Comparison Pass 1 vs Pass 2]:");
  for (const tbl of Object.keys(afterPass1)) {
    const diffCount = afterPass2[tbl].count - afterPass1[tbl].count;
    const sameChecksum = afterPass2[tbl].checksum === afterPass1[tbl].checksum;
    console.log(`  - ${tbl}: Δcount=${diffCount}, Checksum Match=${sameChecksum}`);
    if (diffCount !== 0 || !sameChecksum) {
      isIdempotent = false;
    }
  }

  console.log("\n================================================================================");
  if (isIdempotent) {
    console.log("  ✓ IDEMPOTENCY VERIFIED: Zero new records created, checksums 100% identical.");
  } else {
    console.log("  ✗ IDEMPOTENCY FAILED: Data mutated on secondary pass.");
  }
  console.log("================================================================================");

  client.release();
  await pool.end();

  if (!isIdempotent) process.exit(1);
}

runIdempotencyAudit().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
