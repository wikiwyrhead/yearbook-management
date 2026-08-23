import fs from "fs";
import {
  generateOAuthState,
  validateOAuthState,
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

async function testPkceAndState() {
  console.log("=== Testing Canva OAuth PKCE S256 & Cryptographic State Security ===");

  const userId = "11111111-1111-1111-1111-111111111111";
  const yearbookId = "f40b6896-9a90-4a14-ac4a-f9e204002716";

  // 1. Generate State
  const stateToken = generateOAuthState({
    provider: "canva",
    scope: "member",
    userId,
    yearbookId,
  });

  console.log("✓ State token generated (HMAC-SHA256 signed)");
  if (stateToken.includes("CANVA_") || stateToken.includes("SECRET")) {
    throw new Error("State token exposed sensitive secret strings!");
  }

  // 2. Validate Untampered State
  const validated = validateOAuthState(stateToken);
  console.log("✓ State validated:", {
    provider: validated.provider,
    scope: validated.scope,
    userId: validated.userId,
  });
  if (
    validated.userId !== userId ||
    validated.provider !== "canva" ||
    validated.yearbookId !== yearbookId
  ) {
    throw new Error("Validated state properties did not match original values!");
  }

  // 3. Tamper Detection Test
  const tampered = stateToken.slice(0, -4) + "XXXX";
  let tamperCaught = false;
  try {
    validateOAuthState(tampered);
  } catch (err) {
    tamperCaught = true;
    console.log("✓ Tampered state correctly rejected (CSRF detected)");
  }
  if (!tamperCaught) throw new Error("Tampered state was not rejected!");

  // 4. Derive PKCE Code Verifier & Challenge
  const verifier = deriveCodeVerifier(stateToken);
  const challenge = codeChallengeS256(verifier);
  console.log("✓ Derived PKCE Code Verifier length:", verifier.length);
  console.log("✓ Derived PKCE Code Challenge S256 length:", challenge.length);

  if (!verifier || !challenge || verifier === challenge) {
    throw new Error("PKCE generation failed!");
  }

  // 5. Code verifier determinism from server-side state
  const recomputedVerifier = deriveCodeVerifier(stateToken);
  if (recomputedVerifier !== verifier) {
    throw new Error("PKCE verifier derivation is non-deterministic!");
  }
  console.log(
    "✓ PKCE code verifier is strictly reproducible on server callback without client exposure.",
  );

  console.log("\n[PASS] Canva PKCE & OAuth state test passed 100%!");
}

testPkceAndState().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
