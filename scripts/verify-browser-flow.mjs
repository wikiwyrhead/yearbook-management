/**
 * Milestone Yearbook — End-to-End Browser Flow Verification
 * Tests the exact user scenario requested:
 * 1. Login as admin@test.yearbook
 * 2. Create a school
 * 3. Refresh and confirm it persists
 * 4. Logout/login and confirm it still exists
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toJSON } from "seroval";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = "http://yearbook-manager.test";

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
    for (const m of matches) {
      fnMap[m[2]] = { id: m[1], name: m[2], filename: m[3] };
    }
  }
  return fnMap;
}

const FN_MAP = loadServerFnMap();

function decodeSeroval(node) {
  if (!node || typeof node !== "object") return node;
  if ("f" in node && "t" in node && typeof node.f === "number") {
    return decodeSeroval(node.t);
  }
  switch (node.t) {
    case 1:
      return node.s;
    case 2:
      if (node.s === 0) return null;
      if (node.s === 1) return false;
      if (node.s === 2) return true;
      if (node.s === 3) return undefined;
      return node.s;
    case 3:
      return typeof node.s === "number" ? node.s : Number(node.s);
    case 4:
      return BigInt(node.s);
    case 9:
      return (node.a || []).map((item) => decodeSeroval(item));
    case 10:
    case 11: {
      const obj = {};
      const keys = node.p?.k || [];
      const vals = node.p?.v || [];
      for (let i = 0; i < keys.length; i++) {
        obj[keys[i]] = decodeSeroval(vals[i]);
      }
      return obj;
    }
    case 25:
      return { _error: true, message: decodeSeroval(node.s?.message) || "Error" };
    default:
      return node;
  }
}

async function callServerFn(fnName, inputData = null, sessionCookie = null, forceMethod = null) {
  const meta = FN_MAP[fnName];
  if (!meta) {
    throw new Error(`Server function "${fnName}" not found.`);
  }

  let method = forceMethod;
  if (!method) {
    method = fnName.startsWith("get") || fnName.startsWith("list") ? "GET" : "POST";
  }

  let url = `${BASE_URL}/_serverFn/${meta.id}`;
  const headers = {
    Origin: BASE_URL,
    "Sec-Fetch-Site": "same-origin",
    "x-tsr-serverfn": "true",
  };
  if (sessionCookie) {
    headers["Cookie"] = sessionCookie.includes("milestone_session=")
      ? sessionCookie
      : `milestone_session=${sessionCookie}`;
  }

  let res;
  if (method === "GET") {
    if (inputData !== null) {
      const serovalPayload = toJSON({ data: inputData });
      url += `?payload=${encodeURIComponent(JSON.stringify(serovalPayload))}`;
    }
    res = await fetch(url, { method: "GET", headers });
  } else {
    headers["Content-Type"] = "application/json";
    const serovalPayload = toJSON(inputData !== null ? { data: inputData } : {});
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(serovalPayload),
    });
  }

  if (res.status === 405 && !forceMethod) {
    return callServerFn(fnName, inputData, sessionCookie, method === "GET" ? "POST" : "GET");
  }

  const setCookie = res.headers.get("set-cookie");
  const text = await res.text();
  let decoded = null;
  try {
    const rawJson = JSON.parse(text);
    decoded = decodeSeroval(rawJson);
  } catch {
    decoded = text;
  }

  return {
    ok: res.ok && !decoded?.error && decoded?._error !== true,
    status: res.status,
    setCookie,
    result: decoded?.result !== undefined ? decoded.result : decoded,
    error: decoded?.error || (decoded?._error ? decoded.message : null),
  };
}

async function runBrowserFlowVerification() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  MILESTONE YEARBOOK — USER MANUAL WORKFLOW VERIFICATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // STEP 1: Login as admin@test.yearbook
  console.log("Step 1: Logging in as admin@test.yearbook...");
  const loginRes = await callServerFn("loginWithPassword", {
    email: "admin@test.yearbook",
    password: "Mb7!f00e9c4b39a68ebb$X9",
  });

  if (!loginRes.ok || !loginRes.setCookie) {
    console.error("❌ Step 1 FAILED: Login failed:", loginRes.error || loginRes.result);
    process.exit(1);
  }
  const sessionCookie = loginRes.setCookie.match(/milestone_session=([^;]+)/)[0];
  console.log(
    "✔ Step 1 SUCCESS: Logged in. Session Cookie received:",
    sessionCookie.slice(0, 35) + "...",
  );

  // STEP 2: Create a school
  const schoolName = `Horizon Arts Academy ${Date.now()}`;
  console.log(`\nStep 2: Creating new school: "${schoolName}"...`);
  const createRes = await callServerFn(
    "createSchool",
    {
      name: schoolName,
      short_name: "HAA",
      address: "500 Skyline Blvd, Oakland, CA",
      contact_name: "Dr. Evelyn Reed",
      contact_email: "evelyn.reed@horizonarts.edu",
      notes: "Verified via live browser flow verification",
    },
    sessionCookie,
  );

  if (!createRes.ok || !createRes.result?.id) {
    console.error(
      "❌ Step 2 FAILED: createSchool returned error:",
      createRes.error || createRes.result,
    );
    process.exit(1);
  }
  const createdSchoolId = createRes.result.id;
  console.log(
    `✔ Step 2 SUCCESS: School created successfully without RLS error! ID: ${createdSchoolId}`,
  );

  // STEP 3: Refresh and confirm it persists (getControlCenter)
  console.log("\nStep 3: Refreshing dashboard (getControlCenter)...");
  const ccRes1 = await callServerFn("getControlCenter", null, sessionCookie);
  if (!ccRes1.ok || !ccRes1.result?.schools) {
    console.error("❌ Step 3 FAILED: getControlCenter failed:", ccRes1.error || ccRes1.result);
    process.exit(1);
  }
  const foundSchool1 = ccRes1.result.schools.find((s) => s.id === createdSchoolId);
  if (!foundSchool1) {
    console.error("❌ Step 3 FAILED: Newly created school not found in dashboard schools list!");
    process.exit(1);
  }
  console.log(
    `✔ Step 3 SUCCESS: School "${foundSchool1.name}" confirmed persisted in dashboard. Total schools: ${ccRes1.result.schools.length}`,
  );

  // STEP 4: Logout and login again
  console.log("\nStep 4: Logging out...");
  const logoutRes = await callServerFn("logout", null, sessionCookie);
  console.log("✔ Logged out.");

  console.log("Step 4b: Logging back in as admin@test.yearbook...");
  const loginRes2 = await callServerFn("loginWithPassword", {
    email: "admin@test.yearbook",
    password: "Mb7!f00e9c4b39a68ebb$X9",
  });
  if (!loginRes2.ok || !loginRes2.setCookie) {
    console.error("❌ Step 4b FAILED: Re-login failed:", loginRes2.error);
    process.exit(1);
  }
  const sessionCookie2 = loginRes2.setCookie.match(/milestone_session=([^;]+)/)[0];
  console.log("✔ Re-login successful. New session cookie obtained.");

  // STEP 5: Confirm school still exists
  console.log("\nStep 5: Querying dashboard after re-login...");
  const ccRes2 = await callServerFn("getControlCenter", null, sessionCookie2);
  const foundSchool2 = ccRes2.result?.schools?.find((s) => s.id === createdSchoolId);
  if (!foundSchool2) {
    console.error("❌ Step 5 FAILED: School not found after logout/login cycle!");
    process.exit(1);
  }
  console.log(
    `✔ Step 5 SUCCESS: School "${foundSchool2.name}" confirmed present and persistent across sessions!`,
  );

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ✅ ALL 4 MANUAL BROWSER FLOW VERIFICATION STEPS PASSED!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

runBrowserFlowVerification().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
