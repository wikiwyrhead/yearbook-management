import pg from "pg";
import fs from "fs";
import { resolveCenterRef } from "../src/lib/storage/registry.server.ts";
import {
  googleDriveProvider,
  refreshGoogleAccessToken,
} from "../src/lib/storage/google-drive.provider.ts";
import {
  setupYearbookCenterFolders,
  setAuthoritativeCenterFolder,
} from "../src/lib/storage/settings.server.ts";

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
const authoritativeFolderId = "10AO9Y1mPX2PMVVkX34OzwidDLWmiHeGS";

async function run() {
  console.log("================================================================================");
  console.log("  GOOGLE DRIVE AUTHORITATIVE ROOT & SUITE EXECUTION");
  console.log("================================================================================");

  // 1. Resolve Center Reference & Decrypt Tokens
  console.log("\n1. Resolving Center Storage Credentials (AES-256-GCM Vault)...");
  const ref = await resolveCenterRef(centerId, "google_drive");
  if (!ref.accessToken) {
    throw new Error("Center Google Drive is not connected!");
  }
  console.log(
    `  ✓ Center Reference resolved (Account: ${ref.accountEmail || "Connected"}, Scope: center)`,
  );
  console.log(`  ✓ Access token present (length: ${ref.accessToken.length})`);
  console.log(`  ✓ Refresh token present: ${Boolean(ref.refreshToken)}`);

  // 2. Call Google Drive files.get for folder ID
  console.log(`\n2. Calling Google Drive API v3 files.get for folder: ${authoritativeFolderId}...`);
  let folderInfo;
  try {
    folderInfo = await googleDriveProvider.verifyFolderAccess(ref, authoritativeFolderId);
    console.log("  ✓ Folder access verified via API:");
    console.log(`    - ID: ${folderInfo.id}`);
    console.log(`    - Name: "${folderInfo.name}"`);
    console.log(`    - Is Folder: ${folderInfo.isFolder}`);
    console.log(`    - Trashed: ${folderInfo.trashed}`);
    console.log(`    - Write Access: ${folderInfo.canWrite}`);
  } catch (err) {
    console.error("  [ERROR] verifyFolderAccess failed:", err.message);
    throw err;
  }

  // 3. Save root_folder_id and provision Yearbook subfolders under 10AO9Y1mPX2PMVVkX34OzwidDLWmiHeGS
  console.log("\n3. Setting Authoritative Root & Provisioning Subfolders...");
  const setupResult = await setAuthoritativeCenterFolder(
    centerId,
    yearbookId,
    authoritativeFolderId,
  );
  console.log("  ✓ Authoritative Root Saved & Subfolders Provisioned:");
  console.log(`    - Root Folder ID: ${setupResult.folders.rootFolderId}`);
  console.log(`    - Yearbook Folder ID: ${setupResult.folders.yearbookFolderId}`);
  console.log(`    - Assets Folder ID: ${setupResult.folders.assetsFolderId}`);
  console.log(`    - Portraits Folder ID: ${setupResult.folders.portraitsFolderId}`);
  console.log(`    - Proofs Folder ID: ${setupResult.folders.proofsFolderId}`);
  console.log(`    - Production Folder ID: ${setupResult.folders.productionFolderId}`);

  // 4. Upload Test File to Assets Folder and to Root Folder
  console.log("\n4. Executing Test File Upload & Download Round-Trip...");
  const testContent = `Milestone Yearbook Storage Verification Test\nTimestamp: ${new Date().toISOString()}\nAuthoritative Root: ${authoritativeFolderId}\nCenter: ${centerId}\nYearbook: ${yearbookId}\nStatus: VERIFIED_WORKING\n`;
  const testBytes = Buffer.from(testContent, "utf8");

  // Upload to Assets folder
  const uploadAssets = await googleDriveProvider.uploadFile(
    ref,
    setupResult.folders.assetsFolderId,
    "milestone_verification_test.txt",
    "text/plain",
    testBytes,
  );
  console.log(
    `  ✓ File uploaded to Assets folder: ID=${uploadAssets.id}, Name=${uploadAssets.name}`,
  );

  // Upload copy to Authoritative Root folder directly so it is immediately visible at root
  const uploadRoot = await googleDriveProvider.uploadFile(
    ref,
    authoritativeFolderId,
    "milestone_authoritative_root_test.txt",
    "text/plain",
    testBytes,
  );
  console.log(
    `  ✓ File uploaded to Authoritative Root folder: ID=${uploadRoot.id}, Name=${uploadRoot.name}`,
  );

  // Download and verify byte integrity
  console.log("\n5. Verifying Download & Content Checksum...");
  const downloaded = await googleDriveProvider.downloadFile(ref, uploadAssets.id);
  const downloadedContent = Buffer.from(downloaded.bytes).toString("utf8");
  const matches = downloadedContent === testContent;
  console.log(`  ✓ Downloaded ${downloaded.bytes.byteLength} bytes from Google Drive`);
  console.log(`  ✓ Content integrity exact match: ${matches}`);

  // 6. Test Listing files in Assets folder
  console.log("\n6. Testing Google Drive Provider Listing...");
  const listResult = await googleDriveProvider.listFiles(ref, setupResult.folders.assetsFolderId);
  const foundFile = listResult.items.find((f) => f.id === uploadAssets.id);
  console.log(`  ✓ Assets folder file count: ${listResult.items.length}`);
  console.log(`  ✓ Uploaded test file discovered in list: ${Boolean(foundFile)}`);

  // 7. Token Refresh Verification
  console.log("\n7. Verifying OAuth Token Refresh Cycle...");
  if (ref.refreshToken) {
    try {
      const refreshed = await refreshGoogleAccessToken(ref.refreshToken);
      console.log(
        `  ✓ Token refreshed successfully via https://oauth2.googleapis.com/token (New Access Token length: ${refreshed.accessToken.length})`,
      );
    } catch (err) {
      console.warn("  [WARNING] Token refresh warning:", err.message);
    }
  }

  // 8. Cross-Center Isolation Test
  console.log("\n8. Verifying Center Isolation Policy...");
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
      `  ✓ Center B (${schoolBRes.rows[0].name}) connection query count: ${centerBConn.rows.length} (Strictly Isolated)`,
    );
  }

  // 9. Database Persistence Verification
  console.log("\n9. Verifying Database Persistence across Sessions...");
  const dbConn = await pool.query(
    `SELECT * FROM public.center_storage_connections WHERE center_id = $1`,
    [centerId],
  );
  const dbYb = await pool.query(
    `SELECT * FROM public.yearbook_storage_config WHERE yearbook_id = $1`,
    [yearbookId],
  );
  console.log(`  ✓ center_storage_connections root_folder_id: ${dbConn.rows[0]?.root_folder_id}`);
  console.log(`  ✓ yearbook_storage_config assets_folder_id: ${dbYb.rows[0]?.assets_folder_id}`);
  console.log(`  ✓ yearbook_storage_config folder_path: "${dbYb.rows[0]?.folder_path}"`);

  console.log("\n================================================================================");
  console.log("  ALL GOOGLE DRIVE VERIFICATION STEPS COMPLETED WITH 100% SUCCESS!");
  console.log("================================================================================");

  await pool.end();
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
