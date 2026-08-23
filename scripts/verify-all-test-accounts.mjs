import puppeteer from "puppeteer-core";
import fs from "fs";
import pg from "pg";

const BASE_URL = "https://milestone-portal.arnelbg.com";

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
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}

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

const ACCOUNTS = [
  "admin@test.yearbook",
  "coordinator@test.yearbook",
  "teacher@test.yearbook",
  "member@test.yearbook",
  "student@test.yearbook",
  "coordinator-b@test.yearbook",
  "member-b@test.yearbook",
  "student-b@test.yearbook",
];

async function verifyAllAccounts() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — ALL 8 TEST ACCOUNTS REAL FORM AUTH & ROLE AUDIT");
  console.log("================================================================================");

  const pool = new pg.Pool({ connectionString });
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

  const results = [];

  try {
    for (const email of ACCOUNTS) {
      console.log(`\nTesting Account: [${email}]...`);
      const creds = getCredentials(email);
      const page = await browser.newPage();
      const client = await page.target().createCDPSession();
      await client.send("Network.clearBrowserCookies");

      // 1. Authoritative DB Metadata lookup
      const userRes = await pool.query(
        `SELECT id, email, full_name FROM public.users WHERE email = $1`,
        [email],
      );
      const user = userRes.rows[0];

      let platformRole = user?.id === "11111111-1111-1111-1111-111111111111" ? "super_admin" : "member";
      let centerMembershipType = "None (Global)";
      let activeYearlyAssignment = "None";
      let centerName = "None";

      if (user) {
        // Query center memberships
        const memRes = await pool.query(
          `SELECT cm.member_type, cm.is_active, s.name as center_name 
           FROM public.center_memberships cm
           JOIN public.schools s ON s.id = cm.center_id
           WHERE cm.user_id = $1 AND cm.is_active = true`,
          [user.id],
        );
        if (memRes.rows.length > 0) {
          centerMembershipType = memRes.rows.map((r) => r.member_type).join(", ");
          centerName = memRes.rows[0].center_name;
        }

        // Query appointments
        const apptRes = await pool.query(
          `SELECT role, is_active FROM public.center_role_appointments WHERE user_id = $1 AND is_active = true`,
          [user.id],
        );
        if (apptRes.rows.length > 0) {
          platformRole = apptRes.rows[0].role;
        }

        // Query yearbook assignments
        const teamRes = await pool.query(
          `SELECT yta.role, yta.is_active, p.page_number, y.title as yb_title
           FROM public.yearbook_team_assignments yta
           JOIN public.yearbooks y ON y.id = yta.yearbook_id
           LEFT JOIN public.yearbook_assignment_pages yap ON yap.assignment_id = yta.id
           LEFT JOIN public.pages p ON p.id = yap.page_id
           WHERE yta.user_id = $1 AND yta.is_active = true`,
          [user.id],
        );
        if (teamRes.rows.length > 0) {
          activeYearlyAssignment = teamRes.rows
            .map((r) => `${r.role}${r.page_number ? ` (Page ${r.page_number})` : ""}`)
            .join(", ");
        }
      }

      // 2. Real Form Login
      let formLoginPassed = false;
      let landingUrl = "";
      let logoutPassed = false;

      await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle2" });
      await page.waitForSelector('input[type="email"], input[name="email"]');
      await page.type('input[type="email"], input[name="email"]', creds.email);
      await page.type('input[type="password"], input[name="password"]', creds.password);

      await page.click('button[type="submit"]');
      await page.waitForFunction(() => !window.location.pathname.includes('/auth') || document.body.innerText.includes('Dashboard') || document.body.innerText.includes('Milestone'), { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));

      landingUrl = page.url();
      const cookies = await page.cookies();
      const sessionCookie = cookies.find((c) => c.name === "milestone_session");

      if (sessionCookie && (landingUrl.includes("/dashboard") || landingUrl.includes("/yearbooks") || landingUrl.includes("/schools") || landingUrl.includes("/control"))) {
        formLoginPassed = true;
      }

      // 3. Test Logout
      const logoutBtn = await page.$("header button");
      if (logoutBtn) {
        await logoutBtn.click();
        await new Promise((r) => setTimeout(r, 1500));
      }
      const postLogoutCookies = await page.cookies();
      const postSession = postLogoutCookies.find(
        (c) => c.name === "milestone_session" && c.value.length > 0,
      );
      if (!postSession || postSession.value === "") {
        logoutPassed = true;
      }

      await page.close();

      results.push({
        email,
        formLoginPassed,
        platformRole,
        centerMembershipType,
        activeYearlyAssignment,
        landingWorkspace: landingUrl.replace(BASE_URL, "") || "/auth",
        logoutPassed,
      });

      console.log(
        `  -> Form Login: ${formLoginPassed ? "✅ PASS" : "❌ FAIL"} | Platform Role: ${platformRole} | Center Type: ${centerMembershipType} | Assignment: ${activeYearlyAssignment} | Landing: ${landingUrl.replace(BASE_URL, "")} | Logout: ${logoutPassed ? "✅ PASS" : "❌ FAIL"}`,
      );
    }
  } finally {
    await browser.close();
    await pool.end();
  }

  console.log("\n================================================================================");
  console.log("  SUMMARY TABLE OF ALL 8 TEST ACCOUNTS");
  console.log("================================================================================");
  console.table(results);
}

verifyAllAccounts().catch((err) => {
  console.error("Account verification error:", err);
  process.exit(1);
});
