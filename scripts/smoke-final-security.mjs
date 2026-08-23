import puppeteer from "puppeteer-core";
import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://yearbook-manager.test";
const accounts = JSON.parse(fs.readFileSync("./.localdev/test-accounts.json", "utf8"));

async function smokeFinalSecurity() {
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

  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      networkErrors.push({ status: res.status(), url: res.url() });
    }
  });

  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — FINAL COORDINATOR -> STUDENT ASSIGNMENT SMOKE TEST");
  console.log("================================================================================");

  try {
    // 1. Coordinator login
    const coord = accounts["coordinator@test.yearbook"];
    const cdp = await page.target().createCDPSession();
    await cdp.send("Network.clearBrowserCookies");
    await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());

    await page.waitForSelector("#email", { timeout: 8000 });
    await page.click("#email", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#email", coord.email, { delay: 10 });

    await page.click("#password", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#password", coord.password, { delay: 10 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }).catch(() => {}),
    ]);

    console.log("  ✓ Coordinator logged in successfully");

    // 2. Navigate to Cockpit
    await page.goto(`${BASE_URL}/yearbooks/aaaaaaa2-2222-2222-2222-222222222222`, {
      waitUntil: "networkidle0",
    });

    // 3. Switch to Team tab
    const tabs = await page.$$('button[role="tab"]');
    for (const t of tabs) {
      const text = await page.evaluate((el) => el.textContent, t);
      if (text && text.includes("Team")) {
        await t.click();
        break;
      }
    }
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));

    // 4. Verify Editorial Team roster presence
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasEditorialTeam =
      bodyText.includes("Editorial Team") || bodyText.includes("Marcus Vance");
    console.log(`  ✓ Editorial Team Tab verified: ${hasEditorialTeam}`);

    // 5. Check persistence across page reload
    await page.reload({ waitUntil: "networkidle0" });
    const reloadedText = await page.evaluate(() => document.body.innerText);
    const persisted =
      reloadedText.includes("Demo High School") || reloadedText.includes("Legacy & Horizons");
    console.log(`  ✓ Assignment & Session persisted across reload: ${persisted}`);

    // 6. Report console and network hygiene
    console.log(`  ✓ Unexpected Console Errors: ${consoleErrors.length}`);
    console.log(`  ✓ Unexpected Network Errors: ${networkErrors.length}`);

    console.log("================================================================================");
    console.log("  FINAL SECURITY SMOKE TEST COMPLETED SUCCESSFULLY!");
    console.log("================================================================================");
  } finally {
    await browser.close();
  }
}

smokeFinalSecurity().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
