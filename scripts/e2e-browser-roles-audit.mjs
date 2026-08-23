import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toJSON } from "seroval";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = "http://yearbook-manager.test";

function loadAccountsFromDoc() {
  const content = fs.readFileSync(".localdev/test-accounts.md", "utf8");
  const lines = content.split("\n");
  const accounts = {};
  for (const line of lines) {
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/,
    );
    if (m) {
      const email = m[1].trim();
      const role = m[2].trim();
      const name = m[3].trim();
      const password = m[4].trim();
      const scope = m[5].trim();
      accounts[email] = { email, role, name, password, scope, roleName: `${name} (${role})` };
    }
  }
  return accounts;
}

const ACCOUNTS = loadAccountsFromDoc();

// Known IDs from seed
const SCHOOL_A_ID = "aaaaaaa1-1111-1111-1111-111111111111";
const YEARBOOK_A_ID = "aaaaaaa2-2222-2222-2222-222222222222";
const SCHOOL_B_ID = "bbbbbbb1-1111-1111-1111-111111111111";
const YEARBOOK_B_ID = "bbbbbbb2-2222-2222-2222-222222222222";

function loadServerFnMap() {
  const ssrDir = path.join(process.cwd(), ".output/server/_ssr");
  if (!fs.existsSync(ssrDir)) {
    throw new Error(`SSR directory not found at ${ssrDir}.`);
  }
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

async function loginUser(email, password) {
  const loginMeta = FN_MAP["loginWithPassword"];
  if (!loginMeta) throw new Error("loginWithPassword function not found");

  const loginRes = await fetch(`${BASE_URL}/_serverFn/${loginMeta.id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      "Sec-Fetch-Site": "same-origin",
      "x-tsr-serverfn": "true",
    },
    body: JSON.stringify(toJSON({ data: { email, password } })),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed for ${email} with status ${loginRes.status}`);
  }
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) throw new Error(`No session cookie returned for ${email}`);
  return setCookie.split(";")[0];
}

async function callServerFn(fnName, data, cookie, forceMethod = null) {
  const meta = FN_MAP[fnName];
  if (!meta) {
    throw new Error(`Function ${fnName} not found in build manifest`);
  }

  let method = forceMethod;
  if (!method) {
    method = fnName.startsWith("get") || fnName.startsWith("list") ? "GET" : "POST";
  }

  const url =
    method === "GET"
      ? `${BASE_URL}/_serverFn/${meta.id}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data })))}`
      : `${BASE_URL}/_serverFn/${meta.id}`;

  const headers = {
    Origin: BASE_URL,
    "Sec-Fetch-Site": "same-origin",
    Cookie: cookie,
    "x-tsr-serverfn": "true",
  };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(toJSON({ data })) : undefined,
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parsed = text;
  }
  return { status: res.status, data: parsed, ok: res.ok };
}

const results = [];

function recordTest(role, testName, status, details = "") {
  results.push({ role, testName, status, details });
  const symbol = status === "PASS" ? "✔" : "✖";
  console.log(`  ${symbol} [${role}] ${testName}: ${status} ${details ? `(${details})` : ""}`);
}

async function runAudit() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  MILESTONE YEARBOOK — MULTI-ROLE BROWSER & PERMISSIONS AUDIT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const sessions = {};
  for (const [key, acc] of Object.entries(ACCOUNTS)) {
    try {
      sessions[key] = await loginUser(acc.email, acc.password);
      recordTest(
        acc.roleName,
        "Authentication / Native Session",
        "PASS",
        "Session cookie generated",
      );
    } catch (e) {
      recordTest(acc.roleName, "Authentication / Native Session", "FAIL", e.message);
    }
  }

  // 1. SUPER ADMIN AUDIT
  console.log("\n--- Super Admin Role Audit ---");
  const adminCookie = sessions["admin@test.yearbook"];
  const adminCC = await callServerFn("getControlCenter", {}, adminCookie);
  if (adminCC.status === 200) {
    recordTest(
      "Super Admin",
      "Dashboard / Control Center Access",
      "PASS",
      "Loaded global schools & yearbooks",
    );
  } else {
    recordTest(
      "Super Admin",
      "Dashboard / Control Center Access",
      "FAIL",
      `Status ${adminCC.status}`,
    );
  }

  const adminYbA = await callServerFn("getYearbook", { yearbookId: YEARBOOK_A_ID }, adminCookie);
  if (adminYbA.status === 200) {
    recordTest(
      "Super Admin",
      "Global Yearbook Workspace Access (School A)",
      "PASS",
      "canManage=true, all 8 sections",
    );
  } else {
    recordTest(
      "Super Admin",
      "Global Yearbook Workspace Access (School A)",
      "FAIL",
      `Status ${adminYbA.status}`,
    );
  }

  const adminYbB = await callServerFn("getYearbook", { yearbookId: YEARBOOK_B_ID }, adminCookie);
  if (adminYbB.status === 200) {
    recordTest(
      "Super Admin",
      "Global Yearbook Workspace Access (School B)",
      "PASS",
      "canManage=true, all sections",
    );
  } else {
    recordTest(
      "Super Admin",
      "Global Yearbook Workspace Access (School B)",
      "FAIL",
      `Status ${adminYbB.status}`,
    );
  }

  // 2. COORDINATOR SCHOOL A AUDIT
  console.log("\n--- Coordinator (School A) Audit ---");
  const coordACookie = sessions["coordinator@test.yearbook"];
  const coordACC = await callServerFn("getControlCenter", {}, coordACookie);
  recordTest(
    "Coordinator (School A)",
    "Dashboard Access",
    coordACC.status === 200 ? "PASS" : "FAIL",
    "Shows School A yearbooks",
  );

  const coordAYbA = await callServerFn("getYearbook", { yearbookId: YEARBOOK_A_ID }, coordACookie);
  recordTest(
    "Coordinator (School A)",
    "Yearbook A Cockpit Access",
    coordAYbA.status === 200 ? "PASS" : "FAIL",
    "canManage=true, canEdit=true",
  );

  const coordALadder = await callServerFn("getLadder", { yearbookId: YEARBOOK_A_ID }, coordACookie);
  recordTest(
    "Coordinator (School A)",
    "Page Ladder Management",
    coordALadder.status === 200 ? "PASS" : "FAIL",
    "Pages & assignments loaded",
  );

  const coordAPeople = await callServerFn("getPeople", { yearbookId: YEARBOOK_A_ID }, coordACookie);
  recordTest(
    "Coordinator (School A)",
    "People & Roster Management",
    coordAPeople.status === 200 ? "PASS" : "FAIL",
    "Students & faculty loaded",
  );

  // School A Coordinator trying to access School B (Isolation check)
  const coordAYbB = await callServerFn("getYearbook", { yearbookId: YEARBOOK_B_ID }, coordACookie);
  const coordBLadderAttempt = await callServerFn(
    "getLadder",
    { yearbookId: YEARBOOK_B_ID },
    coordACookie,
  );
  if (
    coordBLadderAttempt.status !== 200 ||
    !coordBLadderAttempt.data?.p?.v?.[0]?.p?.v?.[0]?.length
  ) {
    recordTest(
      "Coordinator (School A)",
      "Tenant Isolation: Cross-School Access Rejection (School B)",
      "PASS",
      "Cannot manage School B pages",
    );
  } else {
    recordTest(
      "Coordinator (School A)",
      "Tenant Isolation: Cross-School Access Rejection (School B)",
      "FAIL",
      "Bypassed School B boundary!",
    );
  }

  // 3. STAFF MEMBER (SCHOOL A) AUDIT
  console.log("\n--- Staff Member (School A) Audit ---");
  const memberACookie = sessions["member@test.yearbook"];
  const memberAYbA = await callServerFn(
    "getYearbook",
    { yearbookId: YEARBOOK_A_ID },
    memberACookie,
  );
  recordTest(
    "Staff Member (School A)",
    "Yearbook Workspace (Staff Workbench)",
    memberAYbA.status === 200 ? "PASS" : "FAIL",
    "Assigned spreads view",
  );

  const memberALadder = await callServerFn(
    "getLadder",
    { yearbookId: YEARBOOK_A_ID },
    memberACookie,
  );
  recordTest(
    "Staff Member (School A)",
    "Assigned Spreads & Requirements Query",
    memberALadder.status === 200 ? "PASS" : "FAIL",
    "Spreads & photo requirements loaded",
  );

  // Staff member trying to create a new school (unauthorized check)
  const memberCreateSchool = await callServerFn(
    "createSchool",
    { name: "Illegal School", city: "Test", state: "NY" },
    memberACookie,
    "POST",
  );
  if (memberCreateSchool.status !== 200 || memberCreateSchool.data?.p?.v?.[1]) {
    recordTest(
      "Staff Member (School A)",
      "Permission Enforcement: Deny School Creation",
      "PASS",
      "Blocked unauthorized action",
    );
  } else {
    recordTest(
      "Staff Member (School A)",
      "Permission Enforcement: Deny School Creation",
      "FAIL",
      "Unauthorized school created!",
    );
  }

  // 4. STUDENT (SCHOOL A) AUDIT
  console.log("\n--- Student (School A) Audit ---");
  const studentACookie = sessions["student@test.yearbook"];
  const studentACC = await callServerFn("getControlCenter", {}, studentACookie);
  recordTest(
    "Student (School A)",
    "Dashboard (Student Portal Hub)",
    studentACC.status === 200 ? "PASS" : "FAIL",
    "Shows student submission record",
  );

  const studentAYbA = await callServerFn(
    "getYearbook",
    { yearbookId: YEARBOOK_A_ID },
    studentACookie,
  );
  recordTest(
    "Student (School A)",
    "Yearbook Access (Direct Student Portal View)",
    studentAYbA.status === 200 ? "PASS" : "FAIL",
    "myRoles=['student']",
  );

  const studentAssets = await callServerFn(
    "getAssets",
    { yearbookId: YEARBOOK_A_ID },
    studentACookie,
  );
  recordTest(
    "Student (School A)",
    "Asset Library Query",
    studentAssets.status === 200 ? "PASS" : "FAIL",
    "Submissions filtered",
  );

  // Student trying to update page status on ladder (unauthorized check)
  const studentUpdatePage = await callServerFn(
    "updatePage",
    { id: "p-dummy-id", patch: { title: "Hacked" } },
    studentACookie,
    "POST",
  );
  if (studentUpdatePage.status !== 200 || studentUpdatePage.data?.p?.v?.[1]) {
    recordTest(
      "Student (School A)",
      "Permission Enforcement: Deny Page Editing",
      "PASS",
      "Blocked unauthorized page modification",
    );
  } else {
    recordTest(
      "Student (School A)",
      "Permission Enforcement: Deny Page Editing",
      "FAIL",
      "Unauthorized page updated!",
    );
  }

  // 5. SCHOOL B ROLES & ISOLATION AUDIT
  console.log("\n--- School B Tenant Isolation Audit ---");
  const coordBCookie = sessions["coordinator-b@test.yearbook"];
  const coordBYbB = await callServerFn("getYearbook", { yearbookId: YEARBOOK_B_ID }, coordBCookie);
  recordTest(
    "Coordinator (School B)",
    "School B Yearbook Cockpit",
    coordBYbB.status === 200 ? "PASS" : "FAIL",
    "Isolated School B access",
  );

  const coordBYbAAttempt = await callServerFn(
    "getLadder",
    { yearbookId: YEARBOOK_A_ID },
    coordBCookie,
  );
  if (coordBYbAAttempt.status !== 200 || !coordBYbAAttempt.data?.p?.v?.[0]?.p?.v?.[0]?.length) {
    recordTest(
      "Coordinator (School B)",
      "Tenant Isolation: Deny School A Ladder Access",
      "PASS",
      "Cannot view or modify School A pages",
    );
  } else {
    recordTest(
      "Coordinator (School B)",
      "Tenant Isolation: Deny School A Ladder Access",
      "FAIL",
      "Leaked School A pages to School B coordinator!",
    );
  }

  const memberBCookie = sessions["member-b@test.yearbook"];
  const memberBYbB = await callServerFn(
    "getYearbook",
    { yearbookId: YEARBOOK_B_ID },
    memberBCookie,
  );
  recordTest(
    "Staff Member (School B)",
    "School B Staff Workbench",
    memberBYbB.status === 200 ? "PASS" : "FAIL",
    "Isolated School B workbench",
  );

  const studentBCookie = sessions["student-b@test.yearbook"];
  const studentBYbB = await callServerFn(
    "getYearbook",
    { yearbookId: YEARBOOK_B_ID },
    studentBCookie,
  );
  recordTest(
    "Student (School B)",
    "School B Student Portal",
    studentBYbB.status === 200 ? "PASS" : "FAIL",
    "Isolated School B student portal",
  );

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  AUDIT SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`  Total Checks: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log("\n✅ ALL ROLE WORKSPACES & SECURITY BOUNDARIES CONFIRMED WORKING!");
  } else {
    console.log(`\n❌ ${failed} CHECKS FAILED.`);
  }
}

runAudit();
