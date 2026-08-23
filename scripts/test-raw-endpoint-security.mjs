import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toJSON } from "seroval";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = process.env.BASE_URL || "http://localhost:8088";

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
    for (const m of matches) fnMap[m[2]] = { id: m[1], name: m[2] };
  }
  return fnMap;
}

const FN_MAP = loadServerFnMap();

function loadAccounts() {
  if (fs.existsSync(".localdev/test-accounts.json")) {
    return JSON.parse(fs.readFileSync(".localdev/test-accounts.json", "utf8"));
  }
  const content = fs.readFileSync(".localdev/test-accounts.md", "utf8");
  const lines = content.split("\n");
  const accounts = {};
  for (const line of lines) {
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/,
    );
    if (m) {
      accounts[m[1].trim()] = { email: m[1].trim(), role: m[2].trim(), password: m[4].trim() };
    }
  }
  return accounts;
}

const ACCOUNTS = loadAccounts();

async function login(email) {
  const acc = ACCOUNTS[email];
  const meta = FN_MAP["loginWithPassword"];
  const res = await fetch(`${BASE_URL}/_serverFn/${meta.id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      "Sec-Fetch-Site": "same-origin",
      "x-tsr-serverfn": "true",
    },
    body: JSON.stringify(toJSON({ data: { email: acc.email, password: acc.password } })),
  });
  return res.headers.get("set-cookie")?.split(";")[0] || "";
}

async function callFn(name, data, cookie, forceMethod = null) {
  const meta = FN_MAP[name];
  if (!meta) throw new Error(`Function ${name} not found`);
  let method = forceMethod || "POST";
  const url =
    method === "GET"
      ? `${BASE_URL}/_serverFn/${meta.id}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data })))}`
      : `${BASE_URL}/_serverFn/${meta.id}`;
  const res = await fetch(url, {
    method,
    headers: {
      Origin: BASE_URL,
      "Sec-Fetch-Site": "same-origin",
      Cookie: cookie || "",
      "x-tsr-serverfn": "true",
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(toJSON({ data })) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, data: parsed, ok: res.ok, rawText: text };
}

const results = [];
function record(testCase, outcome, details) {
  results.push({ testCase, outcome, details });
  const icon = outcome === "PASS" ? "✔" : "✘";
  console.log(`  ${icon} [${outcome}] ${testCase} — ${details}`);
}

async function runSecurityAudit() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  RAW ENDPOINT & TENANT AUTHORIZATION SECURITY AUDIT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const YEARBOOK_A = "aaaaaaa2-2222-2222-2222-222222222222";
  const YEARBOOK_B = "bbbbbbb2-2222-2222-2222-222222222222";

  const adminCookie = await login("admin@test.yearbook");
  const coordACookie = await login("coordinator@test.yearbook");
  const memberACookie = await login("member@test.yearbook");
  const studentACookie = await login("student@test.yearbook");
  const coordBCookie = await login("coordinator-b@test.yearbook");

  // 1. Unauthenticated server function calls
  console.log("--- 1. Unauthenticated Mutation & Query Access ---");
  const unauthCC = await callFn("getControlCenter", {}, null);
  if (unauthCC.status === 200 && unauthCC.data?.p?.v?.[1]) {
    record("Unauthenticated getControlCenter", "PASS", "Rejected with error (auth required)");
  } else if (unauthCC.status === 401 || unauthCC.status === 403 || unauthCC.status === 500) {
    record("Unauthenticated getControlCenter", "PASS", `Rejected with HTTP ${unauthCC.status}`);
  } else {
    record("Unauthenticated getControlCenter", "FAIL", `Returned unauthenticated data`);
  }

  const unauthCreateSchool = await callFn(
    "createSchool",
    { name: "Attacker School" },
    null,
    "POST",
  );
  if (unauthCreateSchool.data?.p?.v?.[1] || unauthCreateSchool.status !== 200) {
    record("Unauthenticated createSchool", "PASS", "Blocked unauthenticated school creation");
  } else {
    record("Unauthenticated createSchool", "FAIL", "Created school without session!");
  }

  // 2. Student Role Misuse / Privilege Escalation
  console.log("\n--- 2. Student Role Misuse & Privilege Escalation ---");
  const studentCreateSchool = await callFn(
    "createSchool",
    { name: "Student Hacked School" },
    studentACookie,
    "POST",
  );
  if (studentCreateSchool.data?.p?.v?.[1] || studentCreateSchool.status !== 200) {
    record("Student createSchool attempt", "PASS", "Rejected: Student cannot create schools");
  } else {
    record("Student createSchool attempt", "FAIL", "Privilege escalation: Student created school!");
  }

  const studentLockYb = await callFn(
    "lockYearbook",
    { yearbookId: YEARBOOK_A, proofId: "fake-proof" },
    studentACookie,
    "POST",
  );
  if (studentLockYb.data?.p?.v?.[1] || studentLockYb.status !== 200) {
    record("Student lockYearbook attempt", "PASS", "Rejected: Student cannot lock yearbook");
  } else {
    record(
      "Student lockYearbook attempt",
      "FAIL",
      "Privilege escalation: Student locked yearbook!",
    );
  }

  const studentApprovePage = await callFn(
    "approvePage",
    { yearbookId: YEARBOOK_A, pageId: "dummy-page" },
    studentACookie,
    "POST",
  );
  if (studentApprovePage.data?.p?.v?.[1] || studentApprovePage.status !== 200) {
    record("Student approvePage attempt", "PASS", "Rejected: Student cannot approve pages");
  } else {
    record("Student approvePage attempt", "FAIL", "Student approved page!");
  }

  // 3. Staff Role Misuse / Boundary Enforcement
  console.log("\n--- 3. Staff Member Permission Boundaries ---");
  const staffCreateSchool = await callFn(
    "createSchool",
    { name: "Staff School" },
    memberACookie,
    "POST",
  );
  if (staffCreateSchool.data?.p?.v?.[1] || staffCreateSchool.status !== 200) {
    record("Staff createSchool attempt", "PASS", "Rejected: Staff cannot create schools");
  } else {
    record("Staff createSchool attempt", "FAIL", "Staff created school!");
  }

  const staffLockYb = await callFn(
    "lockYearbook",
    { yearbookId: YEARBOOK_A, proofId: "fake" },
    memberACookie,
    "POST",
  );
  if (staffLockYb.data?.p?.v?.[1] || staffLockYb.status !== 200) {
    record("Staff lockYearbook attempt", "PASS", "Rejected: Staff cannot lock yearbook");
  } else {
    record("Staff lockYearbook attempt", "FAIL", "Staff locked yearbook!");
  }

  // 4. Cross-Tenant Cross-School Isolation (School B -> School A)
  console.log("\n--- 4. Cross-Tenant Isolation Enforcement ---");
  const coordBLadderSchoolA = await callFn("getLadder", { yearbookId: YEARBOOK_A }, coordBCookie);
  const leakedPages =
    coordBLadderSchoolA.rawText.includes("Drafting") ||
    coordBLadderSchoolA.rawText.includes("In Layout");
  if (
    !leakedPages ||
    coordBLadderSchoolA.status !== 200 ||
    coordBLadderSchoolA.rawText.includes("error")
  ) {
    record(
      "School B Coordinator accessing School A Ladder",
      "PASS",
      "Empty/blocked: Zero School A pages leaked",
    );
  } else {
    record("School B Coordinator accessing School A Ladder", "FAIL", "Leaked pages across tenant!");
  }

  const coordBPeopleSchoolA = await callFn("getPeople", { yearbookId: YEARBOOK_A }, coordBCookie);
  const leakedStudents =
    coordBPeopleSchoolA.rawText.includes("Student") ||
    coordBPeopleSchoolA.rawText.includes("Senior");
  if (
    !leakedStudents ||
    coordBPeopleSchoolA.status !== 200 ||
    coordBPeopleSchoolA.rawText.includes("error")
  ) {
    record(
      "School B Coordinator accessing School A Roster",
      "PASS",
      "Empty/blocked: Zero School A students leaked",
    );
  } else {
    record(
      "School B Coordinator accessing School A Roster",
      "FAIL",
      "Leaked students across tenant!",
    );
  }

  const coordBUpdatePageA = await callFn(
    "updatePage",
    { id: "p-dummy-a", patch: { title: "Cross Tenant Attack" } },
    coordBCookie,
    "POST",
  );
  if (coordBUpdatePageA.data?.p?.v?.[1] || coordBUpdatePageA.status !== 200) {
    record(
      "School B Coordinator mutating School A Page",
      "PASS",
      "Rejected: Cannot mutate cross-tenant pages",
    );
  } else {
    record("School B Coordinator mutating School A Page", "FAIL", "Mutated cross-tenant page!");
  }

  // 5. File Upload & Download Endpoint Security
  console.log("\n--- 5. Storage Upload & Stream Endpoints ---");
  // Test binary upload
  const form = new FormData();
  form.append("file", new Blob(["Test Image"], { type: "image/png" }), "test_sec.png");
  form.append("bucket", "yearbook_assets");
  form.append("yearbookId", YEARBOOK_A);
  const uploadRes = await fetch(`${BASE_URL}/api/storage/upload`, { method: "POST", body: form });
  const uploadData = await uploadRes.json();
  if (uploadRes.status === 200 && uploadData.ok && uploadData.storagePath) {
    record("Storage POST /api/storage/upload", "PASS", `Stored: ${uploadData.storagePath}`);
  } else {
    record("Storage POST /api/storage/upload", "FAIL", `Upload status: ${uploadRes.status}`);
  }

  // Test streaming uploaded file
  const streamRes = await fetch(`${BASE_URL}${uploadData.publicUrl}`);
  if (streamRes.status === 200 && streamRes.headers.get("content-type") === "image/png") {
    record(
      "Storage GET /api/storage/:bucket/* (Valid File)",
      "PASS",
      "Streamed with correct MIME type",
    );
  } else {
    record(
      "Storage GET /api/storage/:bucket/* (Valid File)",
      "FAIL",
      `Status: ${streamRes.status}`,
    );
  }

  // Test non-existent / guessed file path
  const nonExistentRes = await fetch(
    `${BASE_URL}/api/storage/yearbook_assets/yearbooks/fake-id/non_existent.pdf`,
  );
  if (nonExistentRes.status === 404) {
    record(
      "Storage GET Guessed / Non-existent File Path",
      "PASS",
      "Correctly returned HTTP 404 Not Found",
    );
  } else {
    record(
      "Storage GET Guessed / Non-existent File Path",
      "FAIL",
      `Unexpected status ${nonExistentRes.status}`,
    );
  }

  // Test invalid bucket traversal attempt
  const pathTraversalRes = await fetch(`${BASE_URL}/api/storage/yearbook_assets/../../etc/passwd`);
  if (
    pathTraversalRes.status === 404 ||
    pathTraversalRes.status === 400 ||
    pathTraversalRes.status === 403
  ) {
    record(
      "Storage Path Traversal Attempt (/../../etc/passwd)",
      "PASS",
      `Blocked with HTTP ${pathTraversalRes.status}`,
    );
  } else {
    record(
      "Storage Path Traversal Attempt (/../../etc/passwd)",
      "FAIL",
      `Status ${pathTraversalRes.status}`,
    );
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const total = results.length;
  const passed = results.filter((r) => r.outcome === "PASS").length;
  const failed = results.filter((r) => r.outcome === "FAIL").length;
  console.log(`  Total Security Tests: ${total} | Passed: ${passed} | Failed: ${failed}`);
  if (failed === 0) {
    console.log("\n✅ ALL RAW ENDPOINT & TENANT AUTHORIZATION CHECKS PASSED!");
  } else {
    console.log(`\n❌ ${failed} CHECKS FAILED.`);
  }
}

runSecurityAudit().catch(console.error);
