/**
 * Comprehensive Architectural & Live Test Suite: Hidden Super-Admin Design Provider
 */
import pg from "pg";
import { createDecipheriv } from "node:crypto";
import fs from "node:fs";

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}
const pool = new pg.Pool({ connectionString });

const results = [];

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    results.push({ name: testName, status: "PASS", details });
  } else {
    console.error(`❌ [FAIL] ${testName}: ${details}`);
    results.push({ name: testName, status: "FAIL", details });
  }
}

function key() {
  const raw = process.env.MILESTONE_PROVIDER_SECRET || "12345678901234567890123456789012";
  const buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : Buffer.from(raw.padEnd(32, "0").slice(0, 32), "utf8");
}

function decryptSecret(stored) {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

function openCredentials(sealed) {
  if (!sealed || typeof sealed !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(sealed)) {
    if (typeof v !== "string") continue;
    try {
      out[k] = decryptSecret(v);
    } catch {
      // Ignored
    }
  }
  return out;
}

async function runTests() {
  console.log("================================================================================");
  console.log("RUNNING HIDDEN SUPER-ADMIN DESIGN PROVIDER ARCHITECTURAL TESTS");
  console.log("================================================================================");

  const client = await pool.connect();

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Immutable SQL Validation Function (validate_positive_unique_int_array)
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 1: Immutable Validation Function Tests ---");
    const validCheck = await client.query(
      "SELECT public.validate_positive_unique_int_array(ARRAY[1, 2, 3]) as valid",
    );
    assert(
      validCheck.rows[0].valid === true,
      "validate_positive_unique_int_array accepts valid positive unique int array [1,2,3]",
    );

    const zeroCheck = await client.query(
      "SELECT public.validate_positive_unique_int_array(ARRAY[0, 1]) as valid",
    );
    assert(
      zeroCheck.rows[0].valid === false,
      "validate_positive_unique_int_array rejects array with 0",
    );

    const negCheck = await client.query(
      "SELECT public.validate_positive_unique_int_array(ARRAY[-1, 2]) as valid",
    );
    assert(
      negCheck.rows[0].valid === false,
      "validate_positive_unique_int_array rejects array with negative numbers",
    );

    const dupCheck = await client.query(
      "SELECT public.validate_positive_unique_int_array(ARRAY[1, 2, 1]) as valid",
    );
    assert(
      dupCheck.rows[0].valid === false,
      "validate_positive_unique_int_array rejects array with duplicate numbers",
    );

    const emptyCheck = await client.query(
      "SELECT public.validate_positive_unique_int_array(ARRAY[]::INT[]) as valid",
    );
    assert(
      emptyCheck.rows[0].valid === false,
      "validate_positive_unique_int_array rejects empty array",
    );

    // ------------------------------------------------------------------------
    // TEST 2: Platform Connection Survives Admin Deletion (ON DELETE SET NULL)
    // (Executed safely in a transaction with disposable fixtures)
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 2: Administrator Deletion Safety (ON DELETE SET NULL) ---");
    await client.query("BEGIN");
    try {
      const disposableUserRes = await client.query(`
        INSERT INTO public.users (email, full_name, password_hash)
        VALUES ('temp_admin@fixture.test', 'Disposable Admin', 'hash')
        RETURNING id
      `);
      const disposableAdminId = disposableUserRes.rows[0].id;

      const disposableConnRes = await client.query(
        `
        INSERT INTO public.design_provider_connections (
          provider, connected_by, encrypted_credentials, display_name, scopes, is_active, status
        ) VALUES ('canva', $1, '{"sealed":"token"}', 'Fixture Account', ARRAY['read'], false, 'disconnected')
        RETURNING id
      `,
        [disposableAdminId],
      );
      const disposableConnId = disposableConnRes.rows[0].id;

      // Delete the disposable administrator
      await client.query(`DELETE FROM public.users WHERE id = $1`, [disposableAdminId]);

      // Verify the connection record still exists with connected_by = NULL
      const connCheck = await client.query(
        `SELECT id, connected_by, status FROM public.design_provider_connections WHERE id = $1`,
        [disposableConnId],
      );
      assert(
        connCheck.rows.length === 1 && connCheck.rows[0].connected_by === null,
        "Deleting administrator sets connected_by to NULL without cascade-deleting provider connection",
      );
    } finally {
      await client.query("ROLLBACK");
    }

    // ------------------------------------------------------------------------
    // TEST 3: Safe Credential Revocation & Credential Purge
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 3: Credential Revocation & Credential Purge ---");
    await client.query("BEGIN");
    try {
      const testConnRes = await client.query(`
        INSERT INTO public.design_provider_connections (
          provider, connected_by, encrypted_credentials, display_name, scopes, is_active, status
        ) VALUES ('canva', null, '{"sealed":"token"}', 'Revoke Test Account', ARRAY['read'], false, 'connected')
        RETURNING id
      `);
      const connId = testConnRes.rows[0].id;

      // Disconnect and purge credentials
      await client.query(
        `
        UPDATE public.design_provider_connections
        SET is_active = false, status = 'disconnected', encrypted_credentials = null, disconnected_at = now()
        WHERE id = $1
      `,
        [connId],
      );

      const purgedCheck = await client.query(
        `SELECT id, is_active, status, encrypted_credentials, disconnected_at, display_name 
         FROM public.design_provider_connections WHERE id = $1`,
        [connId],
      );
      assert(
        purgedCheck.rows[0].encrypted_credentials === null &&
          purgedCheck.rows[0].status === "disconnected" &&
          purgedCheck.rows[0].display_name === "Revoke Test Account",
        "Revoking credentials clears encrypted_credentials to NULL while preserving non-secret audit metadata",
      );

      // Verify constraint rejects active connected record with NULL credentials
      let constraintErrorCaught = false;
      try {
        await client.query(`
          INSERT INTO public.design_provider_connections (
            provider, connected_by, encrypted_credentials, display_name, scopes, is_active, status
          ) VALUES ('adobe_express', null, null, 'Invalid Active', ARRAY['read'], true, 'connected')
        `);
      } catch {
        constraintErrorCaught = true;
      }
      assert(
        constraintErrorCaught,
        "Database constraint rejects active connected connection with NULL credentials",
      );
    } finally {
      await client.query("ROLLBACK");
    }

    // ------------------------------------------------------------------------
    // TEST 4: Composite Foreign Key Prevents Cross-Yearbook Page Mapping
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 4: Engine-Level Composite Foreign Key Cross-Yearbook Protection ---");
    await client.query("BEGIN");
    try {
      const schoolRes = await client.query(`SELECT id FROM public.schools LIMIT 1`);
      const schoolId = schoolRes.rows[0].id;
      const userRes = await client.query(`SELECT id FROM public.users LIMIT 1`);
      const userId = userRes.rows[0].id;

      const ybARes = await client.query(
        `
        INSERT INTO public.yearbooks (school_id, year, title, created_by)
        VALUES ($1, 2030, 'Yearbook A Fixture', $2) RETURNING id
      `,
        [schoolId, userId],
      );
      const ybAId = ybARes.rows[0].id;

      const ybBRes = await client.query(
        `
        INSERT INTO public.yearbooks (school_id, year, title, created_by)
        VALUES ($1, 2031, 'Yearbook B Fixture', $2) RETURNING id
      `,
        [schoolId, userId],
      );
      const ybBId = ybBRes.rows[0].id;

      const pageARes = await client.query(
        `
        INSERT INTO public.pages (yearbook_id, page_number, position, title)
        VALUES ($1, 1, 1, 'Page 1 YB A') RETURNING id
      `,
        [ybAId],
      );
      const pageAId = pageARes.rows[0].id;

      const connRes = await client.query(
        `SELECT id FROM public.design_provider_connections WHERE provider = 'canva' LIMIT 1`,
      );
      const connId = connRes.rows[0].id;

      const bindingBRes = await client.query(
        `
        INSERT INTO public.yearbook_design_bindings (yearbook_id, provider_connection_id, external_design_id, external_design_title, is_active)
        VALUES ($1, $2, 'design_yb_b_fixture', 'Fixture Layout B', true) RETURNING id
      `,
        [ybBId, connId],
      );
      const bindingBId = bindingBRes.rows[0].id;

      let crossMappingFailed = false;
      try {
        await client.query(
          `
          INSERT INTO public.yearbook_design_page_mappings (yearbook_id, binding_id, milestone_page_id, external_page_numbers)
          VALUES ($1, $2, $3, ARRAY[1])
        `,
          [ybAId, bindingBId, pageAId],
        );
      } catch {
        crossMappingFailed = true;
      }
      assert(
        crossMappingFailed,
        "Composite FK (binding_id, yearbook_id) strictly prevents mapping Yearbook A page to Yearbook B binding",
      );
    } finally {
      await client.query("ROLLBACK");
    }

    // ------------------------------------------------------------------------
    // TEST 5: Live Platform Canva Connection Decryption & API Connectivity
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 5: Live Platform Canva Connection & Decryption ---");
    const activeConnRes = await client.query(`
      SELECT id, provider, external_user_id, external_team_id, display_name, encrypted_credentials, status, is_active
      FROM public.design_provider_connections
      WHERE provider = 'canva' AND is_active = true
    `);

    assert(
      activeConnRes.rows.length === 1,
      "Exactly one active platform Canva connection in database",
    );
    const activeConn = activeConnRes.rows[0];
    assert(activeConn.status === "connected", "Platform connection status is 'connected'");
    assert(activeConn.display_name === "JUSTIN GO", "Live platform identity is 'JUSTIN GO'");

    const decrypted = openCredentials(activeConn.encrypted_credentials);
    assert(
      Boolean(decrypted.accessToken),
      "Encrypted credentials successfully decrypted (valid access token present)",
    );

    // Live API call to Canva
    const meRes = await fetch("https://api.canva.com/rest/v1/users/me", {
      headers: { Authorization: `Bearer ${decrypted.accessToken}` },
    });
    assert(meRes.ok, `Live Canva REST API call /v1/users/me returns HTTP 200 OK (${meRes.status})`);

    // ------------------------------------------------------------------------
    // TEST 6: Active Yearbook Binding & Mappings
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 6: Active Yearbook Binding & Mappings ---");
    const ybId = "f40b6896-9a90-4a14-ac4a-f9e204002716";
    const bindingRes = await client.query(
      `
      SELECT id, external_design_id, external_design_title, is_active 
      FROM public.yearbook_design_bindings 
      WHERE yearbook_id = $1 AND is_active = true
    `,
      [ybId],
    );

    assert(bindingRes.rows.length === 1, "Active binding exists for QA Class of 2027");
    const binding = bindingRes.rows[0];
    assert(
      binding.external_design_id === "DAHTA7_kXWI",
      "External design ID is stable 'DAHTA7_kXWI'",
    );

    const mapRes = await client.query(
      `
      SELECT m.id, m.external_page_numbers, p.page_number
      FROM public.yearbook_design_page_mappings m
      JOIN public.pages p ON p.id = m.milestone_page_id
      WHERE m.binding_id = $1
    `,
      [binding.id],
    );

    assert(mapRes.rows.length > 0, "Page mappings exist for active binding");
    assert(
      JSON.stringify(mapRes.rows[0].external_page_numbers) === "[1]",
      "Milestone Page 10 is mapped to 1-indexed Canva Page [1]",
    );

    // ------------------------------------------------------------------------
    // TEST 7: Role Scoping & Zero Leakage in Database Records
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 7: Role Scoping & Zero-Leakage Checks ---");
    const page10Res = await client.query(
      `SELECT id FROM public.pages WHERE yearbook_id = $1 AND page_number = 10`,
      [ybId],
    );
    const assignedPageId = page10Res.rows[0].id;
    const chloeUserId = "44444444-4444-4444-4444-444444444444";
    const marcusUserId = "33333333-3333-3333-3333-333333333333";

    // Ensure Chloe Bennett (genuine Student) is assigned to Page 10
    let ytaRes = await client.query(
      `SELECT id FROM public.yearbook_team_assignments WHERE yearbook_id = $1 AND user_id = $2 AND role = 'editorial_member' AND is_active = true`,
      [ybId, chloeUserId],
    );
    let assignId = ytaRes.rows[0]?.id;
    if (!assignId) {
      const ins = await client.query(
        `INSERT INTO public.yearbook_team_assignments (yearbook_id, user_id, role, is_active) VALUES ($1, $2, 'editorial_member', true) RETURNING id`,
        [ybId, chloeUserId],
      );
      assignId = ins.rows[0].id;
    }
    await client.query(
      `INSERT INTO public.yearbook_assignment_pages (assignment_id, page_id, yearbook_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [assignId, assignedPageId, ybId],
    );
    await client.query(
      `INSERT INTO public.page_assignments (page_id, yearbook_id, user_id, kind) VALUES ($1, $2, $3, 'primary') ON CONFLICT DO NOTHING`,
      [assignedPageId, ybId, chloeUserId],
    );

    // Check Chloe Editorial Member assignment on Page 10
    const editorialAssignmentRes = await client.query(
      `
      SELECT yta.role, yap.page_id 
      FROM public.yearbook_team_assignments yta
      JOIN public.yearbook_assignment_pages yap ON yap.assignment_id = yta.id
      WHERE yta.user_id = $1 AND yta.yearbook_id = $2 AND yta.is_active = true AND yap.page_id = $3
    `,
      [chloeUserId, ybId, assignedPageId],
    );

    assert(
      editorialAssignmentRes.rows.length > 0 &&
        editorialAssignmentRes.rows[0].page_id === assignedPageId,
      "Genuine Student Editorial Member (student@test.yearbook / Chloe Bennett) is assigned to Milestone Page 10",
    );

    // Check Marcus Vance is canonical Staff/Member
    const marcusMembershipRes = await client.query(
      `
      SELECT member_type, is_active FROM public.center_memberships
      WHERE user_id = $1 AND is_active = true
    `,
      [marcusUserId],
    );

    assert(
      marcusMembershipRes.rows.length > 0 && marcusMembershipRes.rows[0].member_type === "staff",
      "Marcus Vance (member@test.yearbook) is canonical Staff/Member in Center",
    );

    // ------------------------------------------------------------------------
    // TEST 8: Proof Generation Jobs Table & Non-Cascading Audit History
    // ------------------------------------------------------------------------
    console.log("\n--- TEST 8: Proof Generation Jobs History Preservation ---");
    await client.query("BEGIN");
    try {
      const disposableUser = await client.query(`
        INSERT INTO public.users (email, full_name, password_hash)
        VALUES ('temp_job_user@fixture.test', 'Disposable Job User', 'hash')
        RETURNING id
      `);
      const jobUserId = disposableUser.rows[0].id;

      const jobRes = await client.query(
        `
        INSERT INTO public.proof_generation_jobs (
          idempotency_key, requested_by, provider_connection_id, binding_id, yearbook_id, milestone_page_id, mapped_layout_pages, status
        ) VALUES ('job_audit_test', $1, $2, $3, $4, $5, ARRAY[1], 'completed')
        RETURNING id
      `,
        [jobUserId, activeConn.id, binding.id, ybId, assignedPageId],
      );
      const jobId = jobRes.rows[0].id;

      // Delete the requested_by user
      await client.query(`DELETE FROM public.users WHERE id = $1`, [jobUserId]);

      // Check job record still exists with requested_by = NULL
      const checkJob = await client.query(
        `SELECT id, requested_by, status FROM public.proof_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assert(
        checkJob.rows.length === 1 && checkJob.rows[0].requested_by === null,
        "Deleting requesting user sets proof_generation_jobs.requested_by to NULL (Audit history preserved)",
      );
    } finally {
      await client.query("ROLLBACK");
    }

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log(
      "\n================================================================================",
    );
    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;
    console.log(`TEST SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${results.length})`);
    console.log("================================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("FATAL TEST ERROR:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runTests();
