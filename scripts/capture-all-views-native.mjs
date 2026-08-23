import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import { toJSON } from "seroval";

const BASE_URL = "http://yearbook-manager.test";
const SCREENSHOT_DIR =
  "/home/wiki/.gemini/antigravity-ide/brain/76520fdd-0441-4e53-b933-d29b3f97dbd8/screenshots";
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

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: "new",
    protocolTimeout: 30000,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
    ],
  });

  const tests = [
    {
      name: "02_super_admin_yearbook_workspace.png",
      email: "admin@test.yearbook",
      desc: "Super Admin Yearbook Workspace",
      action: async (page) => {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(`a[href*="${YEARBOOK_A}"]`, { timeout: 10000 });
        await page.click(`a[href*="${YEARBOOK_A}"]`);
        await page.waitForSelector("button[role=tab]", { timeout: 10000 });
        await new Promise((r) => setTimeout(r, 1500));
      },
    },
    {
      name: "04_coordinator_yearbook_ladder.png",
      email: "coordinator@test.yearbook",
      desc: "Coordinator Page Ladder",
      action: async (page) => {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(`a[href*="${YEARBOOK_A}"]`, { timeout: 10000 });
        await page.click(`a[href*="${YEARBOOK_A}"]`);
        await page.waitForSelector("button[role=tab]", { timeout: 10000 });
        await new Promise((r) => setTimeout(r, 1500));
      },
    },
    {
      name: "07_school_b_isolation_denied.png",
      email: "coordinator-b@test.yearbook",
      desc: "School B Denied Cross-Tenant Access",
      action: async (page) => {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
        await new Promise((r) => setTimeout(r, 1000));
        await page.evaluate((id) => {
          window.location.href = `/yearbooks/${id}`;
        }, YEARBOOK_A);
        await page.waitForSelector("h1", { timeout: 10000 });
        await new Promise((r) => setTimeout(r, 1000));
      },
    },
    {
      name: "08_asset_tagging_and_filtering.png",
      email: "coordinator@test.yearbook",
      desc: "Asset Tagging & Filtering",
      action: async (page) => {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(`a[href*="${YEARBOOK_A}"]`, { timeout: 10000 });
        await page.click(`a[href*="${YEARBOOK_A}"]`);
        await page.waitForSelector("button[role=tab]", { timeout: 10000 });
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button[role=tab]")).find((b) =>
            b.textContent?.toLowerCase().includes("assets"),
          );
          if (btn) btn.click();
        });
        await new Promise((r) => setTimeout(r, 2000));
      },
    },
    {
      name: "09_proofing_and_production.png",
      email: "coordinator@test.yearbook",
      desc: "Proofing & Production",
      action: async (page) => {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(`a[href*="${YEARBOOK_A}"]`, { timeout: 10000 });
        await page.click(`a[href*="${YEARBOOK_A}"]`);
        await page.waitForSelector("button[role=tab]", { timeout: 10000 });
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button[role=tab]")).find((b) =>
            b.textContent?.toLowerCase().includes("proofreading"),
          );
          if (btn) btn.click();
        });
        await new Promise((r) => setTimeout(r, 2000));
      },
    },
  ];

  for (const t of tests) {
    console.log(`\n---> Capturing [${t.desc}] (${t.name})...`);
    const page = await browser.newPage();
    try {
      const token = await getSessionCookie(t.email, accounts[t.email].password);
      await page.setCookie({
        name: "milestone_session",
        value: token,
        domain: "yearbook-manager.test",
        path: "/",
        httpOnly: true,
      });

      await t.action(page);
      const buf = await page.screenshot({ captureBeyondViewport: false });
      const dest = path.join(SCREENSHOT_DIR, t.name);
      fs.writeFileSync(dest, buf);
      console.log(`  ✔ Saved ${t.name} (${buf.length} bytes)`);
    } catch (err) {
      console.error(`  ✘ Error capturing ${t.name}:`, err.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log("\nFinished native browser captures.");
}

capture().catch(console.error);
