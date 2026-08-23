import fs from "fs";
import {
  generateCorrelationState,
  generateOAuthState,
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

async function testReturnNavigation() {
  console.log("================================================================================");
  console.log("       CANVA RETURN NAVIGATION LIVE ROUND-TRIP & SECURITY VALIDATION            ");
  console.log("================================================================================\n");

  const baseUrl = "http://localhost:8088";
  const userId = "11111111-1111-1111-1111-111111111111"; // Super Admin
  const yearbookId = "f40b6896-9a90-4a14-ac4a-f9e204002716";
  const designId = "DAHTA7_kXWI";

  // 1. Generate fresh Canva Edit URL with signed correlation state
  console.log("1. Generating fresh Canva Edit URL with signed correlation state...");
  const correlationState = generateCorrelationState({ userId, yearbookId, designId });
  const rawCanvaEditUrl = `https://www.canva.com/design/${designId}/edit`;
  const canvaUrlWithState = `${rawCanvaEditUrl}?state=${encodeURIComponent(correlationState)}`;
  console.log("✓ Canva Target Edit URL:", rawCanvaEditUrl);
  console.log("✓ Signed Correlation State Parameter attached successfully!");

  // 2. Perform Real Return Navigation Request
  console.log("\n2. Executing Canva Return Action (/api/public/canva/return)...");
  const returnRes = await fetch(
    `${baseUrl}/api/public/canva/return?state=${encodeURIComponent(correlationState)}&design_id=${designId}`,
    {
      redirect: "manual",
    },
  );

  console.log("✓ Return Action HTTP Status:", returnRes.status);
  const locationHeader = returnRes.headers.get("location");
  console.log("✓ Redirect Location Header:", locationHeader);

  if (returnRes.status !== 302) {
    throw new Error(
      `Expected HTTP 302 redirect, got ${returnRes.status}: ${await returnRes.text()}`,
    );
  }

  const expectedPath = `/yearbooks/${yearbookId}?tab=design&linked_design=${designId}`;
  if (locationHeader !== expectedPath) {
    throw new Error(`Location header mismatch. Expected: ${expectedPath}, got: ${locationHeader}`);
  }
  console.log("✓ Real Return Navigation Successfully Redirects to:", expectedPath);

  // 3. Test Replay / Reused State Protection
  console.log("\n3. Testing Single-Use Replay Protection...");
  const replayRes = await fetch(
    `${baseUrl}/api/public/canva/return?state=${encodeURIComponent(correlationState)}&design_id=${designId}`,
    {
      redirect: "manual",
    },
  );
  console.log("✓ Replayed State HTTP Status:", replayRes.status);
  const replayText = await replayRes.text();
  console.log("✓ Replay Error Response:", replayText);
  if (replayRes.status !== 400 || !replayText.includes("already been consumed")) {
    throw new Error("Replayed state was not rejected with 400!");
  }

  // 4. Test Tampered Correlation State
  console.log("\n4. Testing Tampered State Rejection...");
  const tamperedState = correlationState + "tampered";
  const tamperedRes = await fetch(
    `${baseUrl}/api/public/canva/return?state=${encodeURIComponent(tamperedState)}`,
    {
      redirect: "manual",
    },
  );
  console.log("✓ Tampered State HTTP Status:", tamperedRes.status);
  if (tamperedRes.status !== 400) {
    throw new Error("Tampered state was not rejected with 400!");
  }

  // 5. Test Malformed Correlation State
  console.log("\n5. Testing Malformed State Rejection...");
  const malformedRes = await fetch(`${baseUrl}/api/public/canva/return?state=not-a-valid-jwt`, {
    redirect: "manual",
  });
  console.log("✓ Malformed State HTTP Status:", malformedRes.status);
  if (malformedRes.status !== 400) {
    throw new Error("Malformed state was not rejected with 400!");
  }

  // 6. Test Expired Correlation State
  console.log("\n6. Testing Expired State Rejection...");
  // Create state with timestamp 30 minutes in the past
  const pastState = generateOAuthState({
    provider: "canva",
    scope: "member",
    userId,
    yearbookId,
  });
  // Manually forge past timestamp payload with valid HMAC to test expiry logic
  const [p] = pastState.split(".");
  const decoded = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  decoded.timestamp = Date.now() - 30 * 60 * 1000; // 30 mins ago
  const forgedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  const crypto = await import("node:crypto");
  const forgedSig = crypto
    .createHmac("sha256", process.env.MILESTONE_PROVIDER_SECRET)
    .update(forgedPayload)
    .digest("base64url");
  const expiredState = `${forgedPayload}.${forgedSig}`;

  const expiredRes = await fetch(
    `${baseUrl}/api/public/canva/return?state=${encodeURIComponent(expiredState)}`,
    {
      redirect: "manual",
    },
  );
  console.log("✓ Expired State HTTP Status:", expiredRes.status);
  const expiredText = await expiredRes.text();
  console.log("✓ Expired Error Response:", expiredText);
  if (expiredRes.status !== 400 || !expiredText.includes("expired")) {
    throw new Error("Expired state was not rejected with 400!");
  }

  // 7. Test Arbitrary External URL Injection Prevention
  console.log("\n7. Testing External URL Injection Prevention...");
  const evilRes = await fetch(
    `${baseUrl}/api/public/canva/return?return_to=https://evil-hacker.com`,
    {
      redirect: "manual",
    },
  );
  console.log("✓ Evil Return URL HTTP Status:", evilRes.status);
  if (evilRes.status !== 400) {
    throw new Error("External return URL injection was not rejected!");
  }

  console.log("\n================================================================================");
  console.log("       CANVA RETURN NAVIGATION VALIDATION PASSED 100%!                          ");
  console.log("================================================================================\n");
}

testReturnNavigation().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
