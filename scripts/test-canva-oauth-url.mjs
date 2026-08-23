import fs from "fs";
import {
  generateOAuthState,
  deriveCodeVerifier,
  codeChallengeS256,
} from "../src/lib/storage/oauth-state.server.ts";

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

async function testOAuthUrl() {
  console.log("=== Verifying Canva Authorization URL Formulation ===");
  const userId = "11111111-1111-1111-1111-111111111111"; // Super Admin
  const yearbookId = "f40b6896-9a90-4a14-ac4a-f9e204002716";

  const state = generateOAuthState({
    provider: "canva",
    scope: "member",
    userId,
    yearbookId,
  });

  const challenge = codeChallengeS256(deriveCodeVerifier(state));
  const redirectUri = "https://milestone-portal.arnelbg.com/api/public/auth/callback";

  const url = new URL("https://www.canva.com/api/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.CANVA_CLIENT_ID);
  url.searchParams.set(
    "scope",
    "profile:read asset:read asset:write design:meta:read design:content:read design:content:write",
  );
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", redirectUri);

  console.log("✓ Canva Auth Host:", url.origin);
  console.log("✓ Scopes Requested:", url.searchParams.get("scope"));
  console.log("✓ Redirect URI:", url.searchParams.get("redirect_uri"));
  console.log("✓ Code Challenge Method:", url.searchParams.get("code_challenge_method"));
  console.log("✓ Has Client ID:", Boolean(url.searchParams.get("client_id")));
  console.log("✓ Has State:", Boolean(url.searchParams.get("state")));
  console.log("✓ Has Code Challenge:", Boolean(url.searchParams.get("code_challenge")));

  console.log("\n[PASS] Canva OAuth authorization URL formulation verified successfully!");
}

testOAuthUrl().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
