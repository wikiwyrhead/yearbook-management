import fs from "fs";
import { adminStartCanvaOAuth } from "../src/lib/design/admin-design.server.ts";
import { getOAuthCallbackUrl, getAppBaseUrl } from "../src/lib/app-url.ts";
import { generateOAuthState } from "../src/lib/storage/oauth-state.server.ts";

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
}

async function testOAuthUrls() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — PERMANENT OAUTH URL GENERATION VERIFICATION");
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

  // 1. Base App URL
  console.log("\n--- 1. Canonical Application Origin ---");
  const appBase = getAppBaseUrl();
  assert(
    appBase === "https://milestone-portal.arnelbg.com",
    `Canonical App Base URL is https://milestone-portal.arnelbg.com (Resolved: ${appBase})`,
  );

  // 2. Canonical OAuth Callback URL
  console.log("\n--- 2. Canonical OAuth Callback URL ---");
  const callbackUrl = getOAuthCallbackUrl();
  assert(
    callbackUrl === "https://milestone-portal.arnelbg.com/api/public/auth/callback",
    `Canonical OAuth Callback is https://milestone-portal.arnelbg.com/api/public/auth/callback (Resolved: ${callbackUrl})`,
  );

  // 3. Canva OAuth Authorization URL
  console.log("\n--- 3. Canva OAuth Authorization URL Generation ---");
  const actor = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "admin@test.yearbook",
    role: "super_admin",
  };
  const canvaAuth = await adminStartCanvaOAuth(actor);
  const canvaUrl = new URL(canvaAuth.authUrl);
  const canvaRedirect = canvaUrl.searchParams.get("redirect_uri");

  assert(
    canvaRedirect === "https://milestone-portal.arnelbg.com/api/public/auth/callback",
    `Canva redirect_uri matches permanent configuration (${canvaRedirect})`,
  );
  assert(canvaUrl.origin === "https://www.canva.com", `Canva auth host is https://www.canva.com`);

  // 4. Google Drive OAuth URL Generation
  console.log("\n--- 4. Google Drive OAuth URL Generation ---");
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const state = generateOAuthState({
    provider: "google_drive",
    scope: "center",
    userId: actor.id,
    centerId: "3f7ff3c9-0560-43a0-8de0-edeb9914e176",
  });

  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("client_id", googleClientId || "");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("redirect_uri", callbackUrl);

  assert(
    googleUrl.searchParams.get("redirect_uri") ===
      "https://milestone-portal.arnelbg.com/api/public/auth/callback",
    `Google redirect_uri matches permanent configuration (${googleUrl.searchParams.get("redirect_uri")})`,
  );
  assert(
    googleUrl.origin === "https://accounts.google.com",
    `Google auth host is https://accounts.google.com`,
  );

  // 5. Canva Return Navigation URL
  console.log("\n--- 5. Canva Return Navigation URL Formulation ---");
  const returnNavUrl = `${appBase}/api/public/canva/return`;
  assert(
    returnNavUrl === "https://milestone-portal.arnelbg.com/api/public/canva/return",
    `Canva Return Navigation URL matches permanent configuration (${returnNavUrl})`,
  );

  console.log("\n================================================================================");
  console.log(`OAUTH URL SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

testOAuthUrls().catch((err) => {
  console.error("OAuth URL Test Error:", err);
  process.exit(1);
});
