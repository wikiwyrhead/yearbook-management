import puppeteer from "puppeteer-core";
import fs from "fs";

const BASE_URL = "https://milestone-portal.arnelbg.com";

function getCredentials(email) {
  const file = fs.readFileSync(".localdev/test-accounts.md", "utf8");
  for (const line of file.split("\n")) {
    if (line.includes(`\`${email}\``)) {
      const parts = line.split("|").map((s) => s.trim());
      const password = parts[4].replace(/`/g, "");
      return { email, password };
    }
  }
  throw new Error(`Credentials for ${email} not found in .localdev/test-accounts.md`);
}

async function runFormAuthTests() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — REAL FORM-BASED LOGIN & SESSION SECURITY VALIDATION");
  console.log("================================================================================");

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

  try {
    // --- TEST 1: Super Admin Form Login ---
    console.log("\n--- TEST 1: Super Admin Form Login (admin@test.yearbook) ---");
    const adminCreds = getCredentials("admin@test.yearbook");
    const page = await browser.newPage();

    await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle2" });

    // Type into email and password inputs
    await page.waitForSelector('input[type="email"], input[name="email"]');
    await page.type('input[type="email"], input[name="email"]', adminCreds.email);
    await page.type('input[type="password"], input[name="password"]', adminCreds.password);

    // Submit form
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    await new Promise((r) => setTimeout(r, 2000));
    const currentUrl = page.url();
    const cookies = await page.cookies();
    const sessionCookie = cookies.find((c) => c.name === "milestone_session");

    assert(
      sessionCookie !== undefined,
      "Super Admin receives milestone_session cookie upon form login",
    );
    assert(sessionCookie?.secure === true, "Session cookie has Secure flag enabled");
    assert(sessionCookie?.httpOnly === true, "Session cookie has HttpOnly flag enabled");
    assert(
      sessionCookie?.sameSite === "Lax" || sessionCookie?.sameSite === "None",
      `Session cookie has valid SameSite policy (${sessionCookie?.sameSite})`,
    );
    assert(
      currentUrl.includes("/dashboard") ||
        currentUrl.includes("/yearbooks") ||
        currentUrl.includes("/control"),
      "Super Admin redirected to dashboard/authenticated route upon login",
      `Current URL: ${currentUrl}`,
    );

    // Test Logout
    console.log("\n--- TEST 1B: Super Admin Logout ---");
    const logoutBtn = await page.$("header button");
    if (logoutBtn) {
      await logoutBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
    }
    const afterLogoutCookies = await page.cookies();
    const afterLogoutSession = afterLogoutCookies.find((c) => c.name === "milestone_session");
    assert(
      !afterLogoutSession || afterLogoutSession.value === "",
      "Logout clears/invalidates authenticated session cookie",
    );
    await page.close();

    // --- TEST 2: Coordinator Form Login ---
    console.log("\n--- TEST 2: Coordinator Form Login (coordinator@test.yearbook) ---");
    const coordCreds = getCredentials("coordinator@test.yearbook");
    const coordPage = await browser.newPage();

    await coordPage.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle2" });
    await coordPage.waitForSelector('input[type="email"], input[name="email"]');
    await coordPage.type('input[type="email"], input[name="email"]', coordCreds.email);
    await coordPage.type('input[type="password"], input[name="password"]', coordCreds.password);

    await Promise.all([
      coordPage.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      coordPage.click('button[type="submit"]'),
    ]);

    await new Promise((r) => setTimeout(r, 2000));
    const coordCookies = await coordPage.cookies();
    const coordSessionCookie = coordCookies.find((c) => c.name === "milestone_session");
    const coordUrl = coordPage.url();

    assert(
      coordSessionCookie !== undefined,
      "Coordinator receives milestone_session cookie upon form login",
    );
    assert(coordSessionCookie?.secure === true, "Coordinator session cookie has Secure flag");
    assert(coordSessionCookie?.httpOnly === true, "Coordinator session cookie has HttpOnly flag");
    assert(
      coordUrl.includes("/dashboard") || coordUrl.includes("/yearbooks"),
      "Coordinator redirected to dashboard/workspace",
      `Current URL: ${coordUrl}`,
    );
    await coordPage.close();

    // --- TEST 3: Invalid Password Rejection ---
    console.log("\n--- TEST 3: Invalid Password Rejection ---");
    const failPage = await browser.newPage();
    // Clear cookies to ensure we are not already logged in
    const client = await failPage.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");

    await failPage.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle2" });
    await failPage.waitForSelector('input[type="email"], input[name="email"]');
    await failPage.type('input[type="email"], input[name="email"]', "admin@test.yearbook");
    await failPage.type('input[type="password"], input[name="password"]', "WrongPassword123!");

    await failPage.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 2000));

    const failContent = await failPage.content();
    const failCookies = await failPage.cookies();
    const failSessionCookie = failCookies.find(
      (c) => c.name === "milestone_session" && c.value.length > 0,
    );

    assert(failSessionCookie === undefined, "No valid session cookie issued on invalid password");
    assert(failPage.url().includes("/auth"), "User remains on /auth page after invalid login");
    assert(
      failContent.includes("Invalid") ||
        failContent.includes("error") ||
        failContent.includes("failed") ||
        failPage.url().includes("/auth"),
      "Form handles invalid password correctly",
    );
    await failPage.close();
  } finally {
    await browser.close();
  }

  console.log("\n================================================================================");
  console.log(
    `REAL FORM AUTHENTICATION SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`,
  );
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runFormAuthTests().catch((err) => {
  console.error("Form Auth Test Error:", err);
  process.exit(1);
});
