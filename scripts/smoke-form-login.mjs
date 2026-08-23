import puppeteer from "puppeteer-core";
import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://yearbook-manager.test";
const accounts = JSON.parse(fs.readFileSync("./.localdev/test-accounts.json", "utf8"));

async function smokeTestLogins() {
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

  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — FORM AUTHENTICATION SMOKE TEST");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  for (const [email, account] of Object.entries(accounts)) {
    const page = await browser.newPage();
    try {
      const cdp = await page.target().createCDPSession();
      await cdp.send("Network.clearBrowserCookies");
      await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle0" });
      await page.evaluate(() => localStorage.clear());

      await page.waitForSelector("#email", { timeout: 8000 });
      await page.click("#email", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("#email", account.email, { delay: 10 });

      await page.click("#password", { clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type("#password", account.password, { delay: 10 });

      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }).catch(() => {}),
      ]);

      const cookies = await page.cookies();
      const hasSession = cookies.some((c) => c.name === "milestone_session" && c.value);

      if (hasSession) {
        console.log(`  ✓ [SUCCESS] ${email} (${account.role})`);
        passed++;
      } else {
        console.log(`  ✗ [FAILED]  ${email} (${account.role}) - Session not established`);
        failed++;
      }
    } catch (err) {
      console.log(`  ✗ [ERROR]   ${email} (${account.role}) - ${err.message}`);
      failed++;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log("================================================================================");
  console.log(`  RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

smokeTestLogins().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
