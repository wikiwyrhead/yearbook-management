// scripts/test-concurrent-proof-creation.mjs
// Verifies that createProofRound uses transactional row locking (SELECT ... FOR UPDATE)
// to prevent duplicate official_round_number values under concurrent execution.

import assert from "node:assert/strict";
import { enforceTestDatabaseEnv } from "./test-db-guard.mjs";
import { setupTestDatabase } from "./setup-test-db.mjs";

enforceTestDatabaseEnv();

export async function runConcurrentProofCreationTest() {
  console.log("================================================================================");
  console.log("  CONCURRENT OFFICIAL PROOF CREATION & ROW-LOCKING VERIFICATION");
  console.log("================================================================================\n");

  console.log("[1/4] Resetting and seeding disposable test database...");
  await setupTestDatabase();

  const { getDbPool } = await import("../src/lib/db/pool.server.ts");
  const { createProofRound } = await import("../src/lib/proofing/rounds.server.ts");

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    // 1. Create a dedicated test yearbook for concurrency testing
    console.log("[2/4] Provisioning isolated test school and yearbook...");
    const userRes = await client.query(
      "SELECT id FROM public.users WHERE email = 'admin@test.yearbook'",
    );
    const adminUserId = userRes.rows[0].id;

    const schoolRes = await client.query(
      `
      INSERT INTO public.schools (id, name, created_by, is_active)
      VALUES (gen_random_uuid(), 'Concurrency Test Academy', $1, true)
      RETURNING id
    `,
      [adminUserId],
    );
    const schoolId = schoolRes.rows[0].id;

    const ybRes = await client.query(
      `
      INSERT INTO public.yearbooks (id, school_id, title, year, page_count, created_by)
      VALUES (gen_random_uuid(), $1, 'Concurrency Test Edition 2026', 2026, 12, $2)
      RETURNING id
    `,
      [schoolId, adminUserId],
    );
    const yearbookId = ybRes.rows[0].id;

    // Seed 4 pages for this yearbook
    for (let i = 1; i <= 4; i++) {
      await client.query(
        `
        INSERT INTO public.pages (yearbook_id, position, page_number, physical_index, title)
        VALUES ($1, $2, $2, $2, $3)
      `,
        [yearbookId, i, `Page ${i}`],
      );
    }

    // Create session cookie for admin
    const sessionToken = "session_concurrency_test_admin";
    await client.query(
      `
      INSERT INTO public.sessions (id, user_id, expires_at)
      VALUES ($1, $2, now() + interval '1 day')
      ON CONFLICT (id) DO NOTHING
    `,
      [sessionToken, adminUserId],
    );
    const cookieHeader = `milestone_session=${sessionToken}`;

    // 2. Dispatch 10 simultaneous concurrent calls to createProofRound
    const CONCURRENCY_LEVEL = 10;
    console.log(
      `[3/4] Dispatching ${CONCURRENCY_LEVEL} concurrent createProofRound calls simultaneously...`,
    );

    const startTimestamp = Date.now();
    const tasks = Array.from({ length: CONCURRENCY_LEVEL }, (_, idx) => {
      const callId = idx + 1;
      return createProofRound(
        {
          yearbookId,
          roundName: `Concurrent Stress Test Round ${callId}`,
          filePath: `proofs/concurrent_stress_${callId}.pdf`,
          checksumSha256: `sha256_mock_hash_concurrent_${callId}`,
        },
        cookieHeader,
      );
    });

    const results = await Promise.all(tasks);
    const durationMs = Date.now() - startTimestamp;
    console.log(
      `  ✓ All ${CONCURRENCY_LEVEL} concurrent proof creations resolved in ${durationMs}ms without errors or deadlocks.`,
    );

    // 3. Inspect returned round numbers
    console.log("\n[4/4] Verifying sequence integrity and unique constraint compliance...");
    const officialNumbers = results.map((r) => r.officialRoundNumber).sort((a, b) => a - b);
    const technicalNumbers = results.map((r) => r.roundNumber).sort((a, b) => a - b);

    console.log("  Returned official round numbers:", officialNumbers);
    console.log("  Returned technical round numbers:", technicalNumbers);

    const expectedSequence = Array.from({ length: CONCURRENCY_LEVEL }, (_, idx) => idx + 1);
    assert.deepEqual(
      officialNumbers,
      expectedSequence,
      `Official round numbers must be strictly sequential 1..${CONCURRENCY_LEVEL} without collisions or gaps`,
    );
    assert.deepEqual(
      technicalNumbers,
      expectedSequence,
      `Technical round numbers must be strictly sequential 1..${CONCURRENCY_LEVEL} without collisions or gaps`,
    );

    // Verify database rows directly
    const dbRowsRes = await client.query(
      `
      SELECT id, round_number, official_round_number, round_classification
      FROM public.proofs
      WHERE yearbook_id = $1
      ORDER BY official_round_number ASC
    `,
      [yearbookId],
    );

    assert.equal(
      dbRowsRes.rows.length,
      CONCURRENCY_LEVEL,
      `Expected exactly ${CONCURRENCY_LEVEL} proofs in database`,
    );
    for (let i = 0; i < CONCURRENCY_LEVEL; i++) {
      const row = dbRowsRes.rows[i];
      assert.equal(
        row.round_classification,
        "official_master",
        "All created rounds must be official_master",
      );
      assert.equal(
        row.official_round_number,
        i + 1,
        `Row ${i} official_round_number must be ${i + 1}`,
      );
      assert.equal(row.round_number, i + 1, `Row ${i} round_number must be ${i + 1}`);
    }

    console.log(
      "\n================================================================================",
    );
    console.log(`  CONCURRENCY TEST (${CONCURRENCY_LEVEL} PARALLEL CALLS): 100% PASSED`);
    console.log(
      "================================================================================\n",
    );

    return { success: true, count: CONCURRENCY_LEVEL, officialNumbers };
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("test-concurrent-proof-creation.mjs")) {
  runConcurrentProofCreationTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Concurrent proof creation test failed:", err);
      process.exit(1);
    });
}
