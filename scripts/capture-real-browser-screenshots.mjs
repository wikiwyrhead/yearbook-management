import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { toJSON } from "seroval";

const BASE_URL = "http://yearbook-manager.test";
const SCREENSHOT_DIR =
  "/home/wiki/.gemini/antigravity-ide/brain/76520fdd-0441-4e53-b933-d29b3f97dbd8/screenshots";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function loadAccounts() {
  if (fs.existsSync(".localdev/test-accounts.json")) {
    return JSON.parse(fs.readFileSync(".localdev/test-accounts.json", "utf8"));
  }
  const content = fs.readFileSync(".localdev/test-accounts.md", "utf8");
  const lines = content.split("\n");
  const accounts = {};
  for (const line of lines) {
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/,
    );
    if (m) {
      accounts[m[1].trim()] = {
        email: m[1].trim(),
        role: m[2].trim(),
        name: m[3].trim(),
        password: m[4].trim(),
      };
    }
  }
  return accounts;
}

const ACCOUNTS = loadAccounts();
const YEARBOOK_A = "aaaaaaa2-2222-2222-2222-222222222222";

function loadServerFnMap() {
  const ssrDir = path.join(process.cwd(), ".output/server/_ssr");
  const files = fs.readdirSync(ssrDir);
  const fnMap = {};
  for (const file of files) {
    if (!file.endsWith(".mjs")) continue;
    const content = fs.readFileSync(path.join(ssrDir, file), "utf8");
    const matches = content.matchAll(
      /id:\s*"([a-f0-9]{64})",\s*name:\s*"([^"]+)",\s*filename:\s*"([^"]+)"/g,
    );
    for (const m of matches) fnMap[m[2]] = { id: m[1], name: m[2] };
  }
  return fnMap;
}

async function getSessionCookie(email, password) {
  const fnMap = loadServerFnMap();
  const meta = fnMap["loginWithPassword"];
  if (!meta) throw new Error("Could not find loginWithPassword server function meta");
  const res = await fetch(`${BASE_URL}/_serverFn/${meta.id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      "Sec-Fetch-Site": "same-origin",
      "x-tsr-serverfn": "true",
    },
    body: JSON.stringify(toJSON({ data: { email, password } })),
  });
  const cookies = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie") || ""];
  for (const c of cookies) {
    const match = c.match(/milestone_session=([^;]+)/);
    if (match) return match[1];
  }
  const body = await res.text();
  throw new Error(`Login failed for ${email}: HTTP ${res.status} ${body}`);
}

async function captureAll() {
  console.log("Launching headless Google Chrome via puppeteer-core...");
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
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      "--window-size=1440,900",
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  const views = [
    {
      filename: "01_super_admin_dashboard.png",
      email: "admin@test.yearbook",
      url: `${BASE_URL}/dashboard`,
      desc: "Super Admin Dashboard",
    },
    {
      filename: "02_super_admin_yearbook_workspace.png",
      email: "admin@test.yearbook",
      url: `${BASE_URL}/yearbooks/${YEARBOOK_A}`,
      desc: "Super Admin Yearbook Workspace",
    },
    {
      filename: "03_coordinator_dashboard.png",
      email: "coordinator@test.yearbook",
      url: `${BASE_URL}/dashboard`,
      desc: "Coordinator Dashboard",
    },
    {
      filename: "04_coordinator_yearbook_ladder.png",
      email: "coordinator@test.yearbook",
      url: `${BASE_URL}/yearbooks/${YEARBOOK_A}`,
      desc: "Coordinator Page Ladder",
    },
    {
      filename: "05_staff_workbench.png",
      email: "member@test.yearbook",
      url: `${BASE_URL}/yearbooks/${YEARBOOK_A}`,
      desc: "Staff Workbench",
    },
    {
      filename: "06_student_portal.png",
      email: "student@test.yearbook",
      url: `${BASE_URL}/yearbooks/${YEARBOOK_A}`,
      desc: "Student Portal",
    },
    {
      filename: "07_school_b_isolation_denied.png",
      email: "coordinator-b@test.yearbook",
      url: `${BASE_URL}/yearbooks/${YEARBOOK_A}`,
      desc: "School B Denied Cross-Tenant Access",
    },
    {
      filename: "08_asset_tagging_and_filtering.png",
      email: "coordinator@test.yearbook",
      url: `${BASE_URL}/yearbooks/${YEARBOOK_A}`,
      tab: "assets",
      desc: "Asset Tagging & Filtering",
    },
    {
      filename: "09_proofing_and_production.png",
      email: "coordinator@test.yearbook",
      url: `${BASE_URL}/yearbooks/${YEARBOOK_A}`,
      tab: "proofreading",
      desc: "Proofing & Production",
    },
  ];

  for (const v of views) {
    console.log(`\n---> Capturing [${v.desc}] (${v.filename})...`);
    const page = await browser.newPage();
    const token = await getSessionCookie(v.email, ACCOUNTS[v.email].password);
    await page.setCookie({
      name: "milestone_session",
      value: token,
      domain: "yearbook-manager.test",
      path: "/",
      httpOnly: true,
    });

    try {
      console.log(`  Visiting ${v.url}...`);
      await page.goto(v.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      console.log(`  Waiting for UI to render...`);
      await page
        .waitForSelector("h1, h2, main, .plate, [role=tablist], .container", { timeout: 12000 })
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));

      if (v.tab) {
        console.log(`  Switching to tab "${v.tab}"...`);
        await page.evaluate((targetTab) => {
          const tabs = Array.from(document.querySelectorAll("button[role=tab], [role=tab]"));
          const tab = tabs.find(
            (t) => t.textContent && t.textContent.toLowerCase().includes(targetTab.toLowerCase()),
          );
          if (tab) tab.click();
        }, v.tab);
        await new Promise((r) => setTimeout(r, 2500));
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, v.filename),
        clip: { x: 0, y: 0, width: 1440, height: 900 },
      });
      console.log(`  ✔ Successfully saved ${v.filename}`);
    } catch (e) {
      console.log(`  ✘ Error capturing ${v.filename}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log("\n✅ All real browser screenshots captured successfully!");
}

captureAll().catch(console.error);
