import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import pg from "pg";

const BASE_URL = "https://milestone-portal.arnelbg.com";
const HOSTNAME = "milestone-portal.arnelbg.com";
const SCREENSHOT_DIR =
  "/home/wiki/.gemini/antigravity-ide/brain/76520fdd-0441-4e53-b933-d29b3f97dbd8/screenshots";
const ybId = "f40b6896-9a90-4a14-ac4a-f9e204002716";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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
  const sessionToken = `screenshot-session-${email.split("@")[0]}-${Date.now()}`;
  createdSessions.push(sessionToken);
  await pool.query(
    `INSERT INTO public.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day') ON CONFLICT (id) DO NOTHING`,
    [sessionToken, userId],
  );
  await pool.end();
  return sessionToken;
}

async function captureViews() {
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

  const views = [
    {
      filename: "26_super_admin_canva_design_tab.png",
      email: "admin@test.yearbook",
      url: `${BASE_URL}/yearbooks/${ybId}?tab=design`,
      title: "Super Admin — Canva Integration & Design Management",
    },
    {
      filename: "27_coordinator_generic_layout_workspace.png",
      email: "coordinator@test.yearbook",
      url: `${BASE_URL}/yearbooks/${ybId}?tab=layout`,
      title: "Coordinator — Generic Layout & Proofing Workspace (0 Canva branding)",
    },
    {
      filename: "28_editorial_member_assigned_layout_workspace.png",
      email: "student@test.yearbook", // Chloe Bennett (promoted Student Editorial Member)
      url: `${BASE_URL}/yearbooks/${ybId}?tab=layout`,
      title: "Editorial Member (Chloe Bennett) — Assigned Page 10 Layout Workspace",
    },
    {
      filename: "05_staff_workbench.png",
      email: "member@test.yearbook", // Marcus Vance (canonical Staff/Member)
      url: `${BASE_URL}/yearbooks/${ybId}`,
      title: "Staff/Member (Marcus Vance) — Staff Workbench",
    },
    {
      filename: "20_coordinator_advisor_readonly_protection.png",
      email: "teacher@test.yearbook", // Dr. Arthur Harrison (Faculty Advisor)
      url: `${BASE_URL}/yearbooks/${ybId}?tab=layout`,
      title: "Faculty Advisor (Dr. Arthur Harrison) — Read-Only Proofs",
    },
  ];

  try {
    for (const v of views) {
      console.log(`\nCapturing [${v.title}] as ${v.email}...`);
      const sessionToken = await createSession(v.email);
      const page = await browser.newPage();

      await page.setCookie({
        name: "milestone_session",
        value: sessionToken,
        domain: HOSTNAME,
        path: "/",
        httpOnly: true,
        secure: true,
      });

      await page.goto(v.url, { waitUntil: "networkidle2", timeout: 45000 });
      await new Promise((r) => setTimeout(r, 2000)); // allow client hydration & renders

      const outPath = path.join(SCREENSHOT_DIR, v.filename);
      await page.screenshot({ path: outPath, fullPage: false });
      console.log(`Saved screenshot: ${outPath}`);
      await page.close();
    }
  } finally {
    await browser.close();
    if (createdSessions.length > 0) {
      const pool = new pg.Pool({ connectionString });
      await pool.query("DELETE FROM public.sessions WHERE id = ANY($1)", [createdSessions]);
      await pool.end();
      console.log(`Cleaned up ${createdSessions.length} temporary screenshot sessions.`);
    }
  }

  console.log("\nAll screenshots captured successfully!");
}

captureViews().catch((err) => {
  console.error("Capture error:", err);
  process.exit(1);
});
