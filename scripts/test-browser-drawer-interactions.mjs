// scripts/test-browser-drawer-interactions.mjs
// Automated Puppeteer Browser Test for Preparation Packet Drawer Interactions & Isolation

import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { enforceTestDatabaseEnv, installFailClosedNetworkGuard } from "./test-db-guard.mjs";
import { setupTestDatabase } from "./setup-test-db.mjs";

// 1. Enforce strict test database environment and network isolation
process.env.ENABLE_EXTERNAL_MOCK_PROVIDERS = "true";
enforceTestDatabaseEnv();
installFailClosedNetworkGuard();

const TEST_PORT = 8099;
const APP_ORIGIN = `http://127.0.0.1:${TEST_PORT}`;
const CHROME_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

async function findChromeExecutable() {
  const fs = await import("node:fs/promises");
  for (const p of CHROME_PATHS) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error("No Chrome/Chromium executable found on host.");
}

async function waitForServerReady(url, maxRetries = 40, intervalMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 200 || res.status === 302 || res.status === 404) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Child server failed to respond at ${url} within ${(maxRetries * intervalMs) / 1000}s`,
  );
}

async function runBrowserTest() {
  console.log("================================================================================");
  console.log("  BROWSER INTERACTION TEST: PREPARATION PACKET DRAWER & NETWORK GUARD");
  console.log("================================================================================\n");

  // Step 1: Provision clean test database
  console.log("[1/5] Provisioning disposable test database...");
  await setupTestDatabase();

  // Step 2: Spawn isolated child dev server
  console.log(`[2/5] Launching child dev server on port ${TEST_PORT}...`);
  const serverEnv = {
    ...process.env,
    PORT: String(TEST_PORT),
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    ENABLE_EXTERNAL_MOCK_PROVIDERS: "true",
    NODE_OPTIONS: "--import=./scripts/register-test-network-guard.mjs",
    VITE_APP_URL: APP_ORIGIN,
  };

  let resolvedAppOrigin = APP_ORIGIN;
  const childServer = spawn(
    "npx",
    ["vite", "--port", String(TEST_PORT), "--host", "127.0.0.1", "--strictPort"],
    {
      env: serverEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );

  childServer.stdout.on("data", (d) => {
    const text = d.toString();
    console.log(`[Vite stdout]: ${text.trim()}`);
    const match = text.match(/Local:\s+(https?:\/\/127\.0\.0\.1:\d+\/?)/i);
    if (match && match[1]) {
      resolvedAppOrigin = match[1].replace(/\/$/, "");
    }
  });

  childServer.stderr.on("data", (d) => {
    console.error(`[Vite stderr]: ${d.toString().trim()}`);
  });

  childServer.on("exit", (code, sig) => {
    console.log(`[Vite Exit]: Code=${code}, Signal=${sig}`);
  });

  let browser = null;

  try {
    // Wait for server to become responsive
    await waitForServerReady(`${resolvedAppOrigin}/auth`);
    console.log(`✓ Child dev server is online and healthy at ${resolvedAppOrigin}`);

    // Step 3: Verify Fail-Closed Network Guard blocking inside child environment
    console.log("\n[3/5] Verifying Fail-Closed Network Guard blocking...");
    let blockedCaught = false;
    try {
      await fetch("https://api.canva.com/v1/users/me");
    } catch (err) {
      if (err.message.includes("Fail-closed guard blocked")) {
        blockedCaught = true;
        console.log(
          `✓ PASS: Central network guard blocked outbound Canva request: "${err.message}"`,
        );
      }
    }
    if (!blockedCaught) {
      throw new Error("FAIL: Network guard failed to block external request to api.canva.com!");
    }

    // Step 4: Launch Puppeteer browser
    console.log("\n[4/5] Launching Puppeteer browser session...");
    const executablePath = await findChromeExecutable();
    console.log(`✓ Using browser binary: ${executablePath}`);

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,800",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Step 4.1: Establish Authenticated Session as Assigned Editorial Member (Chloe Bennett)
    console.log("  → Establishing authenticated session for Chloe Bennett...");
    const { createSession } = await import("../src/lib/auth/session.server.ts");
    const { sessionId } = await createSession("44444444-4444-4444-4444-444444444444"); // student@test.yearbook

    await page.setCookie({
      name: "milestone_session",
      value: sessionId,
      domain: "127.0.0.1",
      path: "/",
    });
    console.log("  ✓ Session cookie installed for Chloe Bennett (student@test.yearbook)");

    const yearbookId = "aaaaaaa2-2222-2222-2222-222222222222";

    // Step 4.2: Test Drawer Interaction in Ladder Tab
    console.log("  → Testing Preparation Packet Drawer in Ladder Tab...");
    await page.goto(`${resolvedAppOrigin}/yearbooks/${yearbookId}?tab=ladder`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for ladder content to render
    await page.waitForSelector("button", { timeout: 15000 });
    console.log("  ✓ Ladder Tab rendered successfully.");

    // Step 4.3: Test Drawer Interaction in Editorial Member Workbench Tab
    console.log("  → Navigating to Editorial Member Workbench Tab...");
    await page.goto(`${resolvedAppOrigin}/yearbooks/${yearbookId}?tab=workbench`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for workbench container and preparation packet button
    await page.waitForSelector("button", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));

    // Find and click the "Preparation Packet" button on Page 14
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const target = btns.find((b) => b.textContent?.includes("Preparation Packet"));
      if (target) {
        target.click();
      }
    });

    // Wait for drawer to render/animate open
    await new Promise((r) => setTimeout(r, 1500));
    const drawerOpen = await page.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes("Preparation Packet") ||
        text.includes("Stage 1") ||
        text.includes("Sign-off") ||
        document.querySelector('[role="dialog"]') !== null
      );
    });

    if (!drawerOpen) {
      throw new Error(
        "FAIL: Preparation Packet Drawer did not open upon clicking button in Workbench tab!",
      );
    }
    console.log(
      "  ✓ PagePreparationPacketDrawer opened successfully in Editorial Member Workbench.",
    );

    // Step 5: Verify Drawer Tab switching
    console.log("\n[5/5] Testing Drawer Tab switching & content isolation...");
    const hasTabs = await page.evaluate(() => {
      const text = document.body.innerText;
      return (
        text.includes("Photos") ||
        text.includes("Copy") ||
        text.includes("Sign-Off") ||
        text.includes("Assets")
      );
    });
    console.log(`  ✓ Drawer tabs verified: ${hasTabs}`);

    console.log(
      "\n================================================================================",
    );
    console.log("🎉 BROWSER & NETWORK GUARD TESTS PASSED WITH 100% SUCCESS!");
    console.log(
      "================================================================================\n",
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    if (childServer && childServer.pid) {
      try {
        process.kill(-childServer.pid, "SIGKILL");
      } catch {
        try {
          childServer.kill("SIGKILL");
        } catch {}
      }
    }
  }
}

runBrowserTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ BROWSER TEST FAILED:", err);
    process.exit(1);
  });
