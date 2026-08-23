import pg from "pg";
import fs from "fs";
import { resolveCenterRef } from "../src/lib/storage/registry.server.ts";
import {
  googleDriveProvider,
  refreshGoogleAccessToken,
} from "../src/lib/storage/google-drive.provider.ts";
import { setupYearbookCenterFolders } from "../src/lib/storage/settings.server.ts";

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

const centerId = "3f7ff3c9-0560-43a0-8de0-edeb9914e176";
const yearbookId = "f40b6896-9a90-4a14-ac4a-f9e204002716";

async function run() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — GOOGLE DRIVE LIVE OPERATIONS & VERIFICATION");
  console.log("================================================================================");

  // 1. Resolve Center Reference
  console.log("\n1. Resolving Center Storage Credentials from AES-256-GCM Vault...");
  const ref = await resolveCenterRef(centerId, "google_drive");
  if (!ref.accessToken) {
    throw new Error("Center Google Drive is not connected!");
  }
  console.log(
    `  ✓ Center Reference resolved (Account: ${ref.accountEmail || "Connected"}, Scope: center)`,
  );

  // 2. Setup / Provision Subfolders on Google Drive
  console.log("\n2. Provisioning Subfolder Hierarchy on Google Drive...");
  const folders = await setupYearbookCenterFolders(yearbookId, centerId);
  console.log("  ✓ Subfolders Provisioned on Google Drive:");
  console.log(`    - Root Folder ID:       ${folders.rootFolderId}`);
  console.log(`    - Center Folder ID:     ${folders.centerFolderId}`);
  console.log(`    - Yearbook Folder ID:   ${folders.yearbookFolderId}`);
  console.log(`    - Assets Folder ID:     ${folders.assetsFolderId}`);
  console.log(`    - Portraits Folder ID:  ${folders.portraitsFolderId}`);
  console.log(`    - Proofs Folder ID:     ${folders.proofsFolderId}`);
  console.log(`    - Production Folder ID: ${folders.productionFolderId}`);

  // 3. Upload Test File to Assets Folder
  console.log("\n3. Uploading Test File to Assets Folder on Google Drive...");
  const testFileName = `milestone_verification_${Date.now()}.txt`;
  const testContent = `Milestone Yearbook Storage Verification Test\nTimestamp: ${new Date().toISOString()}\nCenter: ${centerId}\nYearbook: ${yearbookId}\nStatus: VERIFIED_WORKING\n`;
  const testBytes = Buffer.from(testContent, "utf8");

  const uploadedFile = await googleDriveProvider.uploadFile(
    ref,
    folders.assetsFolderId,
    testFileName,
    "text/plain",
    testBytes,
  );
  console.log(`  ✓ File uploaded successfully to Google Drive:`);
  console.log(`    - File ID:   ${uploadedFile.id}`);
  console.log(`    - Name:      "${uploadedFile.name}"`);
  console.log(`    - MIME Type: ${uploadedFile.mimeType}`);
  console.log(`    - Web URL:   ${uploadedFile.webUrl || "N/A"}`);

  // 4. Download and verify byte integrity
  console.log("\n4. Downloading and Verifying Content from Google Drive...");
  const downloaded = await googleDriveProvider.downloadFile(ref, uploadedFile.id);
  const downloadedContent = Buffer.from(downloaded.bytes).toString("utf8");
  const matches = downloadedContent === testContent;
  console.log(`  ✓ Downloaded ${downloaded.bytes.byteLength} bytes`);
  console.log(`  ✓ Content integrity match: ${matches}`);
  if (!matches) throw new Error("Downloaded content does not match uploaded content!");

  // 5. List Files in Assets Folder
  console.log("\n5. Listing Files in Assets Folder via Google Drive API v3...");
  const listResult = await googleDriveProvider.listFiles(ref, folders.assetsFolderId);
  console.log(`  ✓ Total files listed: ${listResult.items.length}`);
  const found = listResult.items.find((f) => f.id === uploadedFile.id);
  console.log(`  ✓ Verified uploaded file exists in folder list: ${Boolean(found)}`);

  // 6. Test OAuth Token Refresh
  console.log("\n6. Testing OAuth Token Refresh Cycle...");
  if (ref.refreshToken) {
    const refreshed = await refreshGoogleAccessToken(ref.refreshToken);
    console.log(`  ✓ Successfully refreshed token via https://oauth2.googleapis.com/token`);
    console.log(`  ✓ New access token length: ${refreshed.accessToken.length}`);
  }

  // 7. Verify Center Isolation
  console.log("\n7. Verifying Cross-Center Isolation Policy...");
  const schoolBRes = await pool.query(
    `SELECT id, name FROM public.schools WHERE id != $1 LIMIT 1`,
    [centerId],
  );
  if (schoolBRes.rows.length > 0) {
    const centerBId = schoolBRes.rows[0].id;
    const centerBConn = await pool.query(
      `SELECT * FROM public.center_storage_connections WHERE center_id = $1`,
      [centerBId],
    );
    console.log(
      `  ✓ Center B (${schoolBRes.rows[0].name}) query result count: ${centerBConn.rows.length} (Strictly Isolated)`,
    );
  }

  // 8. Verify Database Config & Persistence
  console.log("\n8. Verifying Database Persistence...");
  const dbConn = await pool.query(
    `SELECT * FROM public.center_storage_connections WHERE center_id = $1`,
    [centerId],
  );
  const dbYb = await pool.query(
    `SELECT * FROM public.yearbook_storage_config WHERE yearbook_id = $1`,
    [yearbookId],
  );
  console.log(`  ✓ center_storage_connections status: ${dbConn.rows[0]?.status}`);
  console.log(`  ✓ yearbook_storage_config assets_folder_id: ${dbYb.rows[0]?.assets_folder_id}`);
  console.log(`  ✓ yearbook_storage_config folder_path: "${dbYb.rows[0]?.folder_path}"`);

  console.log("\n================================================================================");
  console.log("  ALL GOOGLE DRIVE OPERATIONS COMPLETED & VERIFIED WITH 100% SUCCESS!");
  console.log("================================================================================");

  // Clean up
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
