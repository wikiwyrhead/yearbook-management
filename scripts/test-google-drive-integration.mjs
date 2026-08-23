import pg from "pg";
import fs from "fs";
import { generateOAuthState, validateOAuthState } from "../src/lib/storage/oauth-state.server.ts";
import {
  encryptSecret,
  decryptSecret,
  sealCredentials,
  openCredentials,
} from "../src/lib/storage/credentials.server.ts";

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

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    failed++;
  }
}

async function runSuite() {
  console.log("\n=== Starting Google Drive Integration & Architecture Test Suite ===\n");
  const client = await pool.connect();

  try {
    // 1. Database Schema & Center Storage Isolation
    console.log("1. Center Storage Table Verification");
    const centerTableRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'center_storage_connections'
    `);
    const cols = centerTableRes.rows.map((r) => r.column_name);
    assert(cols.includes("center_id"), "center_storage_connections has center_id");
    assert(
      cols.includes("credentials"),
      "center_storage_connections has encrypted credentials column",
    );
    assert(cols.includes("account_email"), "center_storage_connections has account_email column");
    assert(cols.includes("scopes"), "center_storage_connections has scopes column");
    assert(cols.includes("root_folder_id"), "center_storage_connections has root_folder_id column");
    assert(cols.includes("status"), "center_storage_connections has status column");

    const ybConfigRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'yearbook_storage_config'
    `);
    const ybCols = ybConfigRes.rows.map((r) => r.column_name);
    assert(ybCols.includes("assets_folder_id"), "yearbook_storage_config has assets_folder_id");
    assert(
      ybCols.includes("portraits_folder_id"),
      "yearbook_storage_config has portraits_folder_id",
    );
    assert(ybCols.includes("proofs_folder_id"), "yearbook_storage_config has proofs_folder_id");
    assert(
      ybCols.includes("production_folder_id"),
      "yearbook_storage_config has production_folder_id",
    );

    // 2. OAuth State Generation & CSRF Validation with Center Scope
    console.log("\n2. OAuth State & Center Scoping Security");
    const stateToken = generateOAuthState({
      provider: "google_drive",
      scope: "center",
      userId: "22222222-2222-2222-2222-222222222222",
      centerId: "aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      yearbookId: "aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    assert(
      typeof stateToken === "string" && stateToken.includes("."),
      "Signed state token format valid",
    );

    const parsedState = validateOAuthState(stateToken);
    assert(parsedState.provider === "google_drive", "State provider matches google_drive");
    assert(parsedState.scope === "center", "State scope matches center");
    assert(
      parsedState.centerId === "aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "State centerId preserved",
    );
    assert(
      parsedState.yearbookId === "aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "State yearbookId preserved",
    );

    // Tampered state token rejection
    let tamperedRejected = false;
    try {
      validateOAuthState(stateToken + "tampered");
    } catch {
      tamperedRejected = true;
    }
    assert(tamperedRejected, "Tampered state token rejected by HMAC validation");

    // 3. AES-256-GCM Token Encryption & Hygeine
    console.log("\n3. AES-256-GCM Token Vault & Credential Hygeine");
    const sampleToken = "ya29.sample_oauth_access_token_123456";
    const sampleRefresh = "1//sample_refresh_token_abcdef";
    const sealed = sealCredentials({
      accessToken: sampleToken,
      refreshToken: sampleRefresh,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    assert(sealed.accessToken !== sampleToken, "Access token is encrypted at rest (not plaintext)");
    assert(
      sealed.refreshToken !== sampleRefresh,
      "Refresh token is encrypted at rest (not plaintext)",
    );

    const unsealed = openCredentials(sealed);
    assert(unsealed.accessToken === sampleToken, "Decryption roundtrip recovers access token");
    assert(unsealed.refreshToken === sampleRefresh, "Decryption roundtrip recovers refresh token");

    // 4. Center-Scoped Connection Insertion & Isolation
    console.log("\n4. Center Storage Isolation Query Verification");
    const schoolsRes = await client.query(`SELECT id FROM public.schools LIMIT 2`);
    if (schoolsRes.rows.length < 2)
      throw new Error("Need at least 2 schools in DB for isolation test");
    const testCenterA = schoolsRes.rows[0].id;
    const testCenterB = schoolsRes.rows[1].id;

    // Insert Center A connection
    await client.query(
      `
      INSERT INTO public.center_storage_connections (center_id, provider, credentials, account_email, status, root_folder_id)
      VALUES ($1, 'google_drive', $2, 'center-a@google.com', 'connected', 'folder_center_a_root')
      ON CONFLICT (center_id, provider) DO UPDATE 
      SET credentials = EXCLUDED.credentials, account_email = EXCLUDED.account_email, status = EXCLUDED.status, root_folder_id = EXCLUDED.root_folder_id
    `,
      [testCenterA, JSON.stringify(sealed)],
    );

    // Query Center A
    const resA = await client.query(
      `
      SELECT * FROM public.center_storage_connections WHERE center_id = $1 AND provider = 'google_drive'
    `,
      [testCenterA],
    );
    assert(resA.rows.length === 1, "Center A connection exists");
    assert(
      resA.rows[0].root_folder_id === "folder_center_a_root",
      "Center A root_folder_id stored",
    );

    // Query Center B (should be empty / isolated)
    const resB = await client.query(
      `
      SELECT * FROM public.center_storage_connections WHERE center_id = $1 AND provider = 'google_drive'
    `,
      [testCenterB],
    );
    assert(
      resB.rows.length === 0,
      "Center B has no access to Center A Google Drive connection (strict isolation)",
    );

    // 5. Cleanup test row
    await client.query(`DELETE FROM public.center_storage_connections WHERE center_id = $1`, [
      testCenterA,
    ]);
    console.log("  [CLEANUP] Center test record cleaned up.");

    console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===\n`);
  } catch (err) {
    console.error("Test Suite Error:", err);
    failed++;
  } finally {
    client.release();
    await pool.end();
  }

  if (failed > 0) process.exit(1);
}

runSuite();
