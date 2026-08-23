import puppeteer from "puppeteer-core";
import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://yearbook-manager.test";
const accounts = JSON.parse(fs.readFileSync("./.localdev/test-accounts.json", "utf8"));
const TARGET_URL = `${BASE_URL}/yearbooks/f40b6896-9a90-4a14-ac4a-f9e204002716`;

async function traceYearbookError() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--host-rules=MAP yearbook-manager.test 127.0.0.1:8088, MAP yearbook-manager.test:80 127.0.0.1:8088",
    ],
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on("pageerror", (err) => {
    console.log("[PAGEERROR]:", err.message, err.stack);
    consoleErrors.push({ message: err.message, stack: err.stack });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("[CONSOLE_ERROR]:", msg.text());
      consoleErrors.push({ text: msg.text() });
    }
  });
  page.on("response", async (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      let body = "";
      try {
        body = await res.text();
      } catch {}
      console.log(`[HTTP ${res.status()}]:`, res.url(), body.slice(0, 500));
      networkErrors.push({ status: res.status(), url: res.url(), body });
    }
  });

  try {
    // 1. Super Admin Login
    console.log("--- 1. Login as Super Admin ---");
    const admin = accounts["admin@test.yearbook"];
    const cdp = await page.target().createCDPSession();
    await cdp.send("Network.clearBrowserCookies");
    await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());

    await page.waitForSelector("#email", { timeout: 8000 });
    await page.click("#email", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#email", admin.email, { delay: 10 });

    await page.click("#password", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#password", admin.password, { delay: 10 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }).catch(() => {}),
    ]);

    // 2. Navigate to target yearbook
    console.log(`\n--- 2. Navigating to ${TARGET_URL} ---`);
    await page.goto(TARGET_URL, { waitUntil: "networkidle0" });

    // 3. Test clicking Design tab
    console.log("\n--- 3. Clicking Design Tab ---");
    const tabs = await page.$$('button[role="tab"]');
    for (const t of tabs) {
      const text = await page.evaluate((el) => el.textContent, t);
      if (text && text.includes("Design")) {
        console.log("Clicking Design tab button...");
        await t.click();
        break;
      }
    }
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)));

    let bodyText = await page.evaluate(() => document.body.innerText);
    console.log("Design Tab Body Text:\n", bodyText.slice(0, 1000));

    // 4. Test clicking all other tabs
    const tabNames = [
      "Proofreading",
      "Assets",
      "People",
      "Production",
      "Storage",
      "Team",
      "Page ladder",
    ];
    for (const name of tabNames) {
      console.log(`\n--- Clicking ${name} Tab ---`);
      const allTabs = await page.$$('button[role="tab"]');
      for (const t of allTabs) {
        const text = await page.evaluate((el) => el.textContent, t);
        if (text && text.includes(name)) {
          await t.click();
          await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
          break;
        }
      }
      bodyText = await page.evaluate(() => document.body.innerText);
      const isError = bodyText.includes("Something went wrong") || bodyText.includes("didn't load");
      console.log(`Tab ${name} has error: ${isError}`);
    }
  } finally {
    await browser.close();
  }
}

traceYearbookError().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
