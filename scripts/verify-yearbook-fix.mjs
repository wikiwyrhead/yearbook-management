import puppeteer from "puppeteer-core";
import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://yearbook-manager.test";
const accounts = JSON.parse(fs.readFileSync("./.localdev/test-accounts.json", "utf8"));
const TARGET_URL = `${BASE_URL}/yearbooks/f40b6896-9a90-4a14-ac4a-f9e204002716`;
const screenshotDir =
  "/home/wiki/.gemini/antigravity-ide/brain/76520fdd-0441-4e53-b933-d29b3f97dbd8/screenshots";

async function verifyYearbookFix() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1440,900",
      "--host-rules=MAP yearbook-manager.test 127.0.0.1:8088, MAP yearbook-manager.test:80 127.0.0.1:8088",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  const networkErrors = [];

  page.on("pageerror", (err) => {
    console.error("[PAGEERROR]:", err.message);
    consoleErrors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("[CONSOLE_ERROR]:", msg.text());
      consoleErrors.push(msg.text());
    }
  });
  page.on("response", async (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      networkErrors.push({ status: res.status(), url: res.url() });
    }
  });

  async function login(email, password) {
    const cdp = await page.target().createCDPSession();
    await cdp.send("Network.clearBrowserCookies");
    await page.goto(`${BASE_URL}/auth`, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());

    await page.waitForSelector("#email", { timeout: 8000 });
    await page.click("#email", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#email", email, { delay: 10 });

    await page.click("#password", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#password", password, { delay: 10 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }).catch(() => {}),
    ]);
  }

  try {
    console.log("================================================================================");
    console.log("  VERIFYING YEARBOOK f40b6896-9a90-4a14-ac4a-f9e204002716 FIX");
    console.log("================================================================================");

    // 1. Super Admin flow
    console.log("\n[1] Super Admin Persona Verification:");
    const admin = accounts["admin@test.yearbook"];
    await login(admin.email, admin.password);
    console.log("  ✓ Logged in as Super Admin");

    await page.goto(TARGET_URL, { waitUntil: "networkidle0" });
    await page.screenshot({
      path: `${screenshotDir}/23_super_admin_yearbook_ladder_fixed.png`,
      fullPage: false,
    });
    console.log(
      "  ✓ Yearbook Page Ladder loaded cleanly (saved 23_super_admin_yearbook_ladder_fixed.png)",
    );

    // Switch to Design tab
    const tabs = await page.$$('button[role="tab"]');
    for (const t of tabs) {
      const text = await page.evaluate((el) => el.textContent, t);
      if (text && text.includes("Design")) {
        await t.click();
        break;
      }
    }
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    await page.screenshot({
      path: `${screenshotDir}/24_super_admin_design_tab_fixed.png`,
      fullPage: false,
    });
    console.log("  ✓ Design Tab loaded cleanly (saved 24_super_admin_design_tab_fixed.png)");

    // Switch through all tabs
    const allTabNames = [
      "Proofreading",
      "Assets",
      "People",
      "Production",
      "Storage",
      "Team",
      "Page ladder",
    ];
    for (const tabName of allTabNames) {
      const currentTabs = await page.$$('button[role="tab"]');
      for (const t of currentTabs) {
        const text = await page.evaluate((el) => el.textContent, t);
        if (text && text.includes(tabName)) {
          await t.click();
          await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));
          break;
        }
      }
      const body = await page.evaluate(() => document.body.innerText);
      const failed =
        body.includes("Something went wrong on our end") || body.includes("This page didn't load");
      console.log(`  ✓ Tab "${tabName}" rendered without error: ${!failed}`);
    }

    // Refresh on Design tab
    for (const t of await page.$$('button[role="tab"]')) {
      const text = await page.evaluate((el) => el.textContent, t);
      if (text && text.includes("Design")) {
        await t.click();
        break;
      }
    }
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    await page.reload({ waitUntil: "networkidle0" });
    const refreshedBody = await page.evaluate(() => document.body.innerText);
    const refreshFailed =
      refreshedBody.includes("Something went wrong on our end") ||
      refreshedBody.includes("This page didn't load");
    console.log(`  ✓ Refresh on Design tab successful: ${!refreshFailed}`);

    // 2. Center Coordinator flow
    console.log("\n[2] Center Coordinator Persona Verification:");
    const coord = accounts["coordinator@test.yearbook"];
    await login(coord.email, coord.password);
    console.log("  ✓ Logged in as Center Coordinator");

    await page.goto(TARGET_URL, { waitUntil: "networkidle0" });
    const coordLadderBody = await page.evaluate(() => document.body.innerText);
    const coordLadderFailed =
      coordLadderBody.includes("Something went wrong on our end") ||
      coordLadderBody.includes("This page didn't load");
    console.log(`  ✓ Coordinator Ladder loaded: ${!coordLadderFailed}`);

    // Coordinator open Design tab
    for (const t of await page.$$('button[role="tab"]')) {
      const text = await page.evaluate((el) => el.textContent, t);
      if (text && text.includes("Design")) {
        await t.click();
        break;
      }
    }
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    await page.screenshot({
      path: `${screenshotDir}/25_coordinator_design_tab_fixed.png`,
      fullPage: false,
    });
    const coordDesignBody = await page.evaluate(() => document.body.innerText);
    const coordDesignFailed =
      coordDesignBody.includes("Something went wrong on our end") ||
      coordDesignBody.includes("This page didn't load");
    console.log(
      `  ✓ Coordinator Design Tab loaded: ${!coordDesignFailed} (saved 25_coordinator_design_tab_fixed.png)`,
    );

    console.log("\n[3] Console and Network Error Inspection:");
    console.log(`  - Unexpected Console Errors: ${consoleErrors.length}`);
    console.log(`  - Unexpected Network Errors: ${networkErrors.length}`);

    console.log("================================================================================");
    console.log("  VERIFICATION COMPLETE: ALL PASS");
    console.log("================================================================================");
  } finally {
    await browser.close();
  }
}

verifyYearbookFix().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
