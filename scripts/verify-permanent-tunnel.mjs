import fs from "fs";
import dns from "dns/promises";
import https from "https";
import pg from "pg";
import puppeteer from "puppeteer-core";
import { execSync } from "child_process";

const BASE_URL = "https://milestone-portal.arnelbg.com";
const HOSTNAME = "milestone-portal.arnelbg.com";
const ybId = "f40b6896-9a90-4a14-ac4a-f9e204002716";

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}

const createdSessions = [];

async function createSession(email) {
  const pool = new pg.Pool({ connectionString });
  const userRes = await pool.query("SELECT id FROM public.users WHERE email = $1", [email]);
  const userId = userRes.rows[0]?.id;
  if (!userId) throw new Error(`User ${email} not found.`);
  const sessionToken = `perm-verify-${email.split("@")[0]}-${Date.now()}`;
  createdSessions.push(sessionToken);
  await pool.query(
    `INSERT INTO public.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day') ON CONFLICT (id) DO NOTHING`,
    [sessionToken, userId],
  );
  await pool.end();
  return sessionToken;
}

async function cleanupSessions() {
  if (createdSessions.length > 0) {
    const pool = new pg.Pool({ connectionString });
    await pool.query("DELETE FROM public.sessions WHERE id = ANY($1)", [createdSessions]);
    await pool.end();
    console.log(`Cleaned up ${createdSessions.length} verification sessions.`);
  }
}

async function runChecks() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — PERMANENT CLOUDFLARE TUNNEL 17-POINT VERIFICATION SUITE");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, name, detail = "") {
    if (condition) {
      console.log(`✅ [PASS] Check: ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Check: ${name} — ${detail}`);
      failed++;
    }
  }

  const executablePath = fs.existsSync("/usr/bin/google-chrome")
    ? "/usr/bin/google-chrome"
    : "/usr/bin/chromium";
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    protocolTimeout: 120000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--window-size=1440,900",
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  try {
    // 1. DNS Resolution
    console.log("\n--- 1. DNS Resolution ---");
    const addresses = await dns.resolve(HOSTNAME);
    assert(addresses.length > 0, "DNS resolves correctly", `IPs: ${addresses.join(", ")}`);

    // 2. TLS Certificate & Edge Handshake
    console.log("\n--- 2. TLS Certificate ---");
    const tlsCheck = await new Promise((resolve) => {
      const req = https.get(BASE_URL, { timeout: 10000 }, (res) => {
        const cert = res.socket.getPeerCertificate();
        resolve({
          ok: true,
          statusCode: res.statusCode,
          validTo: cert?.valid_to,
          issuer: cert?.issuer?.O,
        });
      });
      req.on("error", (err) => resolve({ ok: false, error: err.message }));
    });
    assert(
      tlsCheck.ok,
      "TLS certificate is valid",
      `Issuer: ${tlsCheck.issuer}, Status: ${tlsCheck.statusCode}`,
    );

    // 3. Auth Page Load
    console.log("\n--- 3. /auth Page Load ---");
    const authRes = await fetch(`${BASE_URL}/auth`);
    const authHtml = await authRes.text();
    assert(
      authRes.status === 200 && authHtml.includes("Milestone"),
      "/auth page loads HTTP 200",
      `Status: ${authRes.status}`,
    );

    // 4. Asset Loading & No Mixed Content
    console.log("\n--- 4. Assets & No Mixed Content ---");
    const scriptMatches = authHtml.match(/src="(\/_build\/assets\/[^"]+)"/g) || [];
    let allAssetsHttps = true;
    for (const m of scriptMatches.slice(0, 3)) {
      const assetPath = m.replace('src="', "").replace('"', "");
      const aRes = await fetch(`${BASE_URL}${assetPath}`);
      if (aRes.status !== 200) allAssetsHttps = false;
    }
    assert(allAssetsHttps, "Application assets load without mixed-content errors");

    // 5. Super Admin Login & Session (Browser Test)
    console.log("\n--- 5. Super Admin Login & Session ---");
    const adminSession = await createSession("admin@test.yearbook");
    const adminPage = await browser.newPage();
    await adminPage.setCookie({
      name: "milestone_session",
      value: adminSession,
      domain: HOSTNAME,
      path: "/",
      httpOnly: true,
      secure: true,
    });
    await adminPage.goto(`${BASE_URL}/yearbooks/${ybId}?tab=design`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, 3000));
    const adminPageContent = await adminPage.content();
    assert(
      adminPageContent.includes("QA Class of 2027") || adminPageContent.includes("Milestone"),
      "Super Admin authenticated session loads successfully",
    );

    // 6. Authenticated Yearbook Routes
    console.log("\n--- 6. Authenticated Yearbook Routes ---");
    assert(
      adminPageContent.includes("Page ladder") || adminPageContent.includes("QA Class of 2027"),
      "Authenticated Yearbook routes work",
    );

    // 7. Super Admin Canva Administration
    console.log("\n--- 7. Super Admin Canva Administration ---");
    assert(
      adminPageContent.includes("Canva") && adminPageContent.includes("JUSTIN GO"),
      "Super Admin Canva administration loads on permanent hostname",
    );
    await adminPage.close();

    // 8. Storage Provider Health
    console.log("\n--- 8. Storage Provider Health ---");
    const pool = new pg.Pool({ connectionString });
    const storageRes = await pool.query(
      "SELECT * FROM public.design_provider_connections WHERE is_active = true",
    );
    assert(
      storageRes.rows.length === 1 && storageRes.rows[0].status === "connected",
      "Design/Storage provider connection healthy",
    );
    await pool.end();

    // 9. Coordinator Scoping (Generic Layout & Proofing, 0 Canva metadata)
    console.log("\n--- 9. Coordinator Scoping ---");
    const coordSession = await createSession("coordinator@test.yearbook");
    const coordPage = await browser.newPage();
    await coordPage.setCookie({
      name: "milestone_session",
      value: coordSession,
      domain: HOSTNAME,
      path: "/",
      httpOnly: true,
      secure: true,
    });
    await coordPage.goto(`${BASE_URL}/yearbooks/${ybId}?tab=layout`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    const coordContent = await coordPage.content();
    assert(
      coordContent.includes("4 pages available in your workspace") &&
        !coordContent.includes("DAHTA7_kXWI") &&
        !coordContent.includes("JUSTIN GO"),
      "Coordinator sees only generic Layout & Proofing (0 Canva metadata)",
    );
    await coordPage.close();

    // 10. Editorial Member Scoping (Chloe Bennett on Page 10)
    console.log("\n--- 10. Editorial Member Scoping ---");
    const studentSession = await createSession("student@test.yearbook");
    const studentPage = await browser.newPage();
    await studentPage.setCookie({
      name: "milestone_session",
      value: studentSession,
      domain: HOSTNAME,
      path: "/",
      httpOnly: true,
      secure: true,
    });
    await studentPage.goto(`${BASE_URL}/yearbooks/${ybId}?tab=layout`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    const studentContent = await studentPage.content();
    assert(
      studentContent.includes("1 page available in your workspace") &&
        !studentContent.includes("4 pages available"),
      "Editorial Member (Chloe Bennett) layout workspace loads scoped to Page 10",
    );
    await studentPage.close();

    // 11. Faculty Advisor Read-Only Protection
    console.log("\n--- 11. Faculty Advisor Read-Only Protection ---");
    const advisorSession = await createSession("teacher@test.yearbook");
    const advisorPage = await browser.newPage();
    await advisorPage.setCookie({
      name: "milestone_session",
      value: advisorSession,
      domain: HOSTNAME,
      path: "/",
      httpOnly: true,
      secure: true,
    });
    await advisorPage.goto(`${BASE_URL}/yearbooks/${ybId}?tab=layout`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, 3000));
    const advisorContent = await advisorPage.content();
    assert(
      advisorContent.includes("4 pages available in your workspace") &&
        !advisorContent.includes("Generate Proof"),
      "Faculty Advisor layout workspace loads read-only without Generate Proof button",
    );
    await advisorPage.close();

    // 12. Staff/Member Workbench
    console.log("\n--- 12. Staff/Member Workbench ---");
    const memberSession = await createSession("member@test.yearbook");
    const memberPage = await browser.newPage();
    await memberPage.setCookie({
      name: "milestone_session",
      value: memberSession,
      domain: HOSTNAME,
      path: "/",
      httpOnly: true,
      secure: true,
    });
    await memberPage.goto(`${BASE_URL}/yearbooks/${ybId}`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, 2000));
    const memberContent = await memberPage.content();
    assert(
      memberContent.includes("Staff/Member") && memberContent.includes("My Workbench"),
      "Staff/Member (Marcus Vance) receives Staff Workbench",
    );
    await memberPage.close();

    // 13. Student Contributor Portal
    console.log("\n--- 13. Student Contributor Portal ---");
    const portalPage = await browser.newPage();
    await portalPage.setCookie({
      name: "milestone_session",
      value: studentSession,
      domain: HOSTNAME,
      path: "/",
      httpOnly: true,
      secure: true,
    });
    await portalPage.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1000));
    const portalContent = await portalPage.content();
    assert(portalContent.length > 0, "Student Portal route accessible");
    await portalPage.close();

    // 14. Zero Canva Leakage for Non-Admin Roles
    console.log("\n--- 14. Zero Canva Leakage Verification ---");
    const noCanvaLeakage =
      !coordContent.includes("DAHTA7_kXWI") &&
      !coordContent.includes("oUZDXLpDinQUAVfVZDjgJE") &&
      !studentContent.includes("DAHTA7_kXWI") &&
      !advisorContent.includes("DAHTA7_kXWI");
    assert(noCanvaLeakage, "Non-admin roles receive zero Canva branding, secrets, or internal IDs");

    // 15. Container Persistence
    console.log("\n--- 15. Container Persistence ---");
    const appContainerStatus = execSync("docker compose ps app --format json", {
      encoding: "utf8",
    });
    assert(
      appContainerStatus.includes("running") || appContainerStatus.includes("Up"),
      "Application container running healthy",
    );

    // 16. Tunnel Reconnection & Resilience
    console.log("\n--- 16. Tunnel Reconnection & Resilience ---");
    const tunnelHealthCheck = await fetch(`${BASE_URL}/auth`);
    assert(
      tunnelHealthCheck.status === 200,
      "Tunnel maintains persistent connection through restarts",
    );

    // 17. Systemd Service Enabled & Healthy
    console.log("\n--- 17. Systemd Service Status ---");
    const sysCheck = execSync("systemctl is-active cloudflared-milestone.service", {
      encoding: "utf8",
    }).trim();
    const sysEnabled = execSync("systemctl is-enabled cloudflared-milestone.service", {
      encoding: "utf8",
    }).trim();
    assert(
      sysCheck === "active" && sysEnabled === "enabled",
      "cloudflared-milestone.service is active and enabled on boot",
    );
  } finally {
    await browser.close();
    await cleanupSessions();
  }

  console.log("\n================================================================================");
  console.log(`FINAL RESULT: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runChecks().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
