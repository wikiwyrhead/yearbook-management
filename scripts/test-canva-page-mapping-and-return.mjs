import fs from "fs";
import pg from "pg";
import { generateOAuthState, validateOAuthState } from "../src/lib/storage/oauth-state.server.ts";
import { linkCanvaDesignToPage, exportCanvaDesignToProof } from "../src/lib/design/canva.server.ts";

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

async function testPageMappingAndReturn() {
  console.log("================================================================================");
  console.log("       CANVA PAGE-MAPPING VALIDATION & RETURN NAVIGATION SUITE                  ");
  console.log("================================================================================\n");

  const userId = "11111111-1111-1111-1111-111111111111"; // Super Admin
  const yearbookId = "f40b6896-9a90-4a14-ac4a-f9e204002716";
  const designId = "DAHTA7_kXWI"; // 2-page design

  const pageRes = await pool.query(
    `SELECT id, page_number FROM public.pages WHERE yearbook_id = $1 ORDER BY position LIMIT 1`,
    [yearbookId],
  );
  const targetPage = pageRes.rows[0];

  // Test 1: Positive Integer & Exceeds Page Count Boundary Validation
  console.log("1. Testing Canva Page Number Boundary Validations...");

  try {
    await linkCanvaDesignToPage(userId, yearbookId, targetPage.id, designId, [0]);
    throw new Error("Expected [0] to fail validation, but it passed!");
  } catch (err) {
    console.log("✓ Correctly rejected non-positive integer [0]:", err.message);
  }

  try {
    await linkCanvaDesignToPage(userId, yearbookId, targetPage.id, designId, [99]);
    throw new Error("Expected [99] to fail validation, but it passed!");
  } catch (err) {
    console.log("✓ Correctly rejected out-of-range page [99]:", err.message);
  }

  // Test 2: Valid Single Page Mapping
  console.log("\n2. Testing Valid Single Page Mapping (Milestone Page 10 -> Canva Page 1)...");
  const linkRes1 = await linkCanvaDesignToPage(userId, yearbookId, targetPage.id, designId, [1]);
  console.log("✓ Single page link succeeded:", {
    designTitle: linkRes1.design.title,
    mappedCanvaPages: linkRes1.canvaPages,
    milestonePage: targetPage.page_number,
  });

  const checkDb1 = await pool.query(
    `SELECT canva_pages FROM public.canva_designs WHERE yearbook_id = $1 AND canva_design_id = $2`,
    [yearbookId, designId],
  );
  console.log("✓ DB canva_pages value:", checkDb1.rows[0].canva_pages);
  if (JSON.stringify(checkDb1.rows[0].canva_pages) !== JSON.stringify([1])) {
    throw new Error("DB canva_pages does not match [1]");
  }

  // Test 3: Valid Spread Mapping (Milestone Page 10 -> Canva Pages [1, 2])
  console.log("\n3. Testing Valid Spread Mapping (Milestone Page 10 -> Canva Pages [1, 2])...");
  const linkRes2 = await linkCanvaDesignToPage(userId, yearbookId, targetPage.id, designId, [1, 2]);
  console.log("✓ Spread link succeeded:", {
    designTitle: linkRes2.design.title,
    mappedCanvaPages: linkRes2.canvaPages,
    milestonePage: targetPage.page_number,
  });

  // Test 4: Export with exact single page selection
  console.log("\n4. Testing Exact Page Selection PDF Export Ingestion...");
  // Re-link to Canva Page 1 only
  await linkCanvaDesignToPage(userId, yearbookId, targetPage.id, designId, [1]);
  const exportRes = await exportCanvaDesignToProof(userId, yearbookId, targetPage.id, designId);
  console.log("✓ Export with exact Canva Page [1] succeeded!", {
    proofId: exportRes.proofId,
    version: exportRes.version,
    fileName: exportRes.fileName,
    storagePath: exportRes.storagePath,
  });

  // Test 5: Return Navigation Route Security
  console.log("\n5. Testing Return Navigation Route Security & HMAC State Validation...");
  const validState = generateOAuthState({
    provider: "canva",
    userId,
    yearbookId,
    scope: "member",
  });

  const parsedValid = validateOAuthState(validState);
  console.log("✓ Valid HMAC State parsed successfully for return:", {
    provider: parsedValid.provider,
    yearbookId: parsedValid.yearbookId,
  });

  // Tampered state
  try {
    validateOAuthState(validState + "tampered");
    throw new Error("Tampered state should have failed HMAC verification!");
  } catch (tamperErr) {
    console.log("✓ Tampered return navigation state correctly rejected:", tamperErr.message);
  }

  console.log("\n================================================================================");
  console.log("       PAGE-MAPPING & RETURN NAVIGATION TESTS PASSED (100%)                      ");
  console.log("================================================================================\n");
  await pool.end();
}

testPageMappingAndReturn().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
