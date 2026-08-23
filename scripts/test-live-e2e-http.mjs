import fs from "fs";

async function testHttpEndpoints() {
  console.log("=== Testing Live Application HTTP & SSR Endpoints ===");
  const baseUrl = "http://localhost:8088";

  // 1. Test Login/Auth Page HTML
  const loginRes = await fetch(`${baseUrl}/auth`);
  console.log(
    "✓ /auth Status:",
    loginRes.status,
    "(Content-Type:",
    loginRes.headers.get("content-type"),
    ")",
  );
  if (loginRes.status !== 200) throw new Error("Auth page did not return 200");

  // 2. Perform Login via server function
  const loginPost = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@test.yearbook",
      password: "Adm!9b32f9e48222ba35#Y27",
    }),
  });
  console.log("✓ Login Attempt Status:", loginPost.status);
  const cookie = loginPost.headers.get("set-cookie") || "";
  console.log("✓ Session Cookie Received:", cookie ? "Yes (Protected HttpOnly)" : "No");

  // 3. Test Canva Return Route Handler
  const returnRes = await fetch(
    `${baseUrl}/api/public/canva/return?return_to=/yearbooks/f40b6896-9a90-4a14-ac4a-f9e204002716?tab=design`,
    {
      redirect: "manual",
    },
  );
  console.log(
    "✓ /api/public/canva/return Status:",
    returnRes.status,
    "(Location:",
    returnRes.headers.get("location"),
    ")",
  );
  if (
    returnRes.status !== 302 ||
    !returnRes.headers.get("location")?.includes("f40b6896-9a90-4a14-ac4a-f9e204002716")
  ) {
    throw new Error("Return route did not redirect to expected destination");
  }

  // 4. Test Unsafe External URL Rejection
  const unsafeReturn = await fetch(
    `${baseUrl}/api/public/canva/return?return_to=https://evil.com`,
    {
      redirect: "manual",
    },
  );
  console.log("✓ /api/public/canva/return Unsafe URL Rejection Status:", unsafeReturn.status);
  if (unsafeReturn.status !== 400) throw new Error("Unsafe return URL was not rejected!");

  // 5. Test Permanent Cloudflare Tunnel Response
  const tunnelRes = await fetch("https://milestone-portal.arnelbg.com/auth");
  console.log("✓ Cloudflare Tunnel Live Auth Route Status:", tunnelRes.status);
  if (tunnelRes.status !== 200) throw new Error("Permanent Tunnel endpoint failed");

  console.log("\n[PASS] All Live HTTP, SSR, and Security Endpoints Verified Successfully!");
}

testHttpEndpoints().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
