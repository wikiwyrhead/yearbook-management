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

async function main() {
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

  const email = "coordinator@test.yearbook";
  const token = await getSessionCookie(email, accounts[email].password);

  // 1. Capture 08: Assets Tab
  {
    console.log("\n---> Capturing 08_asset_tagging_and_filtering.png...");
    const page = await browser.newPage();
    await page.setCookie({
      name: "milestone_session",
      value: token,
      domain: "yearbook-manager.test",
      path: "/",
    });
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`a[href*="${YEARBOOK_A}"]`, { timeout: 10000 });
    await page.click(`a[href*="${YEARBOOK_A}"]`);
    await page.waitForSelector("button[role=tab]", { timeout: 10000 });

    // Click Assets tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("button[role=tab]"));
      const assetTab = tabs.find((t) => t.textContent.includes("Assets"));
      if (assetTab) {
        assetTab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        assetTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 2000));

    const buf = await page.screenshot({ captureBeyondViewport: false });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, "08_asset_tagging_and_filtering.png"), buf);
    console.log("✔ Saved 08_asset_tagging_and_filtering.png, size:", buf.length);
    await page.close();
  }

  // 2. Capture 09: Proofreading / Production Tab
  {
    console.log("\n---> Capturing 09_proofing_and_production.png...");
    const page = await browser.newPage();
    await page.setCookie({
      name: "milestone_session",
      value: token,
      domain: "yearbook-manager.test",
      path: "/",
    });
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`a[href*="${YEARBOOK_A}"]`, { timeout: 10000 });
    await page.click(`a[href*="${YEARBOOK_A}"]`);
    await page.waitForSelector("button[role=tab]", { timeout: 10000 });

    // Click Proofreading tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll("button[role=tab]"));
      const proofTab = tabs.find((t) => t.textContent.includes("Proofreading"));
      if (proofTab) {
        proofTab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        proofTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 2000));

    const buf = await page.screenshot({ captureBeyondViewport: false });
    fs.writeFileSync(path.join(SCREENSHOT_DIR, "09_proofing_and_production.png"), buf);
    console.log("✔ Saved 09_proofing_and_production.png, size:", buf.length);
    await page.close();
  }

  await browser.close();
  console.log("\nFinished capturing tabs 08 and 09.");
}

main().catch(console.error);
