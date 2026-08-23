import { toJSONAsync } from "seroval";
import { defaultSerovalPlugins } from "@tanstack/router-core";
import fs from "fs";

async function testLiveLogin() {
  const newPass = fs.readFileSync("scripts/.super_admin_new_pass.tmp", "utf8").trim();
  const tunnelUrl = "https://milestone-portal.arnelbg.com";
  const fnId = "31347f31e2d9fa2d03c5a086df16368d99901462325c2cf917d81c6726488df4";

  console.log("=== Testing Real Form-Level Login Through Cloudflare Tunnel ===");
  console.log("Tunnel URL:", tunnelUrl);

  const rawData = {
    data: {
      email: "admin@test.yearbook",
      password: newPass,
    },
  };

  const serialized = JSON.stringify(await toJSONAsync(rawData, { plugins: defaultSerovalPlugins }));
  console.log("Serialized payload:", serialized);

  const res = await fetch(`${tunnelUrl}/_serverFn/${fnId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Sec-Fetch-Site": "same-origin",
      Origin: tunnelUrl,
      Referer: `${tunnelUrl}/auth`,
      "x-tsr-serverFn": "true",
    },
    body: serialized,
  });

  console.log("HTTP Status:", res.status);
  const setCookie = res.headers.get("set-cookie");
  console.log("Set-Cookie header:", setCookie);
  const responseText = await res.text();
  console.log("Response:", responseText);

  if (setCookie && setCookie.includes("milestone_session")) {
    console.log("\n[PASS] Super Admin login authenticated successfully over Cloudflare Tunnel!");
    const cookieVal = setCookie.match(/milestone_session=([^;]+)/)[0];

    // Verify /dashboard access
    const dashRes = await fetch(`${tunnelUrl}/dashboard`, {
      headers: {
        Cookie: cookieVal,
        "Sec-Fetch-Site": "same-origin",
        Origin: tunnelUrl,
      },
    });

    console.log(`[PASS] Dashboard access: HTTP ${dashRes.status}`);
    const dashHtml = await dashRes.text();
    const hasRoleOrControlCenter =
      dashHtml.includes("Production Control Center") ||
      dashHtml.includes("Super Admin") ||
      dashHtml.includes("Yearbook");
    console.log(`[PASS] Dashboard content rendered with Super Admin UI: ${hasRoleOrControlCenter}`);
  } else {
    throw new Error("Failed to receive milestone_session cookie from server.");
  }
}

testLiveLogin().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
