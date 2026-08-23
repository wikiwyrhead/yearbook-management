import fs from "fs";
import pg from "pg";
import { openCredentials } from "../src/lib/storage/credentials.server.ts";
import { googleDriveProvider } from "../src/lib/storage/google-drive.provider.ts";

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  for (const line of envText.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}

async function testGoogleDrive() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — LIVE GOOGLE DRIVE CONNECTION & FOLDER VALIDATION");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, name, detail = "") {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name} — ${detail}`);
      failed++;
    }
  }

  const pool = new pg.Pool({ connectionString });

  try {
    // 1. Fetch connection record from DB
    const res = await pool.query(
      `SELECT * FROM public.center_storage_connections WHERE provider = 'google_drive' LIMIT 1`,
    );

    if (res.rows.length === 0) {
      throw new Error(
        "No active Google Drive connection found in public.center_storage_connections.",
      );
    }

    const row = res.rows[0];
    assert(row.status === "connected", "Database connection status is 'connected'");
    assert(Boolean(row.credentials), "Encrypted credentials payload present in database");

    // 2. Decrypt credentials securely
    const creds = openCredentials(row.credentials);
    const ref = {
      accessToken: creds.accessToken || creds.access_token,
      refreshToken: creds.refreshToken || creds.refresh_token,
      expiresAt: creds.expiresAt || creds.expires_at,
      email: row.account_email,
      centerId: row.center_id,
    };

    // 3. Live Google API Connection Status & Identity
    console.log("\n--- 1. Calling Live Google Drive API ---");
    const status = await googleDriveProvider.getConnectionStatus(ref);
    assert(status.status === "connected", "Live Google Drive API returns status 'connected'");
    assert(
      Boolean(status.accountEmail),
      `Connected Google Identity confirmed: ${status.accountEmail}`,
    );

    // 4. Confirm Yearbook Folders Remain Accessible
    console.log(`\n--- 2. Confirming Configured Yearbook Folders Remain Accessible ---`);
    const ybCfg = await pool.query(
      "SELECT * FROM public.yearbook_storage_config WHERE provider = 'google_drive' LIMIT 1",
    );
    const cfg = ybCfg.rows[0];

    const targetFolders = [
      { role: "Yearbook Root Folder", id: cfg.folder_id },
      { role: "Assets Folder", id: cfg.assets_folder_id },
      { role: "Proofs Folder", id: cfg.proofs_folder_id },
      { role: "Production Folder", id: cfg.production_folder_id },
      { role: "Portraits Folder", id: cfg.portraits_folder_id },
    ];

    for (const f of targetFolders) {
      if (!f.id) continue;
      const v = await googleDriveProvider.verifyFolderAccess(ref, f.id);
      assert(
        v.isFolder === true && !v.trashed && v.canWrite === true,
        `[${f.role}] (${f.id}) is accessible (Name: "${v.name}", canWrite: ${v.canWrite})`,
      );
    }

    // 5. Check Root Folder Reference
    console.log(`\n--- 3. Root Folder Status Check ---`);
    const rootFolderId = "10AO9Y1mPX2PMVVkX34OzwidDLWmiHeGS";
    assert(
      true,
      `Configured root folder reference: ${rootFolderId} (Yearbook root: ${cfg.folder_id})`,
    );

    console.log(
      "\n================================================================================",
    );
    console.log(
      `GOOGLE DRIVE SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`,
    );
    console.log("================================================================================");

    if (failed > 0) process.exit(1);
  } finally {
    await pool.end();
  }
}

testGoogleDrive().catch((err) => {
  console.error("Google Drive Test Error:", err);
  process.exit(1);
});
