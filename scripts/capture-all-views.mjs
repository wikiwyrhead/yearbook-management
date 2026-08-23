import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { toJSON } from "seroval";

const BASE_URL = "http://yearbook-manager.test";
const SCREENSHOT_DIR = path.join(
  "/home/wiki/.gemini/antigravity-ide/brain/76520fdd-0441-4e53-b933-d29b3f97dbd8/screenshots",
);
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const accounts = JSON.parse(fs.readFileSync(".localdev/test-accounts.json", "utf8"));
const YEARBOOK_A = "aaaaaaa2-2222-2222-2222-222222222222";

function getMetaId(name) {
  const ssrDir = ".output/server/_ssr";
  const files = fs.readdirSync(ssrDir);
  for (const file of files) {
    if (!file.endsWith(".mjs")) continue;
    const c = fs.readFileSync(`${ssrDir}/${file}`, "utf8");
    const match = c.match(new RegExp(`id:\\s*"([a-f0-9]{64})",\\s*name:\\s*"${name}"`));
    if (match) return match[1];
  }
  throw new Error(`Could not find meta id for ${name}`);
}

async function getSessionCookie(email, password) {
  const metaId = getMetaId("loginWithPassword");
  const res = await fetch(`${BASE_URL}/_serverFn/${metaId}`, {
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
  throw new Error(`Login failed for ${email}`);
}

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

async function run() {
  console.log("Starting Chrome capture suite...");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: "new",
    protocolTimeout: 60000,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
    ],
  });

  for (const v of views) {
    console.log(`\n---> Capturing [${v.desc}] (${v.filename})...`);
    const page = await browser.newPage();
    try {
      const token = await getSessionCookie(v.email, accounts[v.email].password);
      await page.setCookie({
        name: "milestone_session",
        value: token,
        domain: "yearbook-manager.test",
        path: "/",
        httpOnly: true,
      });

      console.log(`  Navigating to ${v.url}...`);
      await page.goto(v.url, { waitUntil: "domcontentloaded", timeout: 20000 });
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
        await new Promise((r) => setTimeout(r, 2000));
      }

      const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } });
      const dest = path.join(SCREENSHOT_DIR, v.filename);
      fs.writeFileSync(dest, buf);
      console.log(`  ✔ Saved ${v.filename} (${buf.length} bytes)`);
    } catch (e) {
      console.error(`  ✘ Failed ${v.filename}:`, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log("\nAll views processed.");
}

run().catch(console.error);
