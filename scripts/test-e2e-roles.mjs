/**
 * End-to-End Multi-Role Verification for Hidden Super-Admin Design Provider & Role Isolation
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import { toJSON } from "seroval";

const BASE_URL = "http://localhost:8088";
const ybId = "f40b6896-9a90-4a14-ac4a-f9e204002716";

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}

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

function decodeSerovalAst(node) {
  if (node === null || node === undefined) return node;
  if (typeof node !== "object") return node;
  if (node.t === 1) return node.s; // string
  if (node.t === 0) return node.s; // number
  if (node.t === 2) {
    if (node.s === 0) return null;
    if (node.s === 1) return undefined;
    if (node.s === 2) return true;
    if (node.s === 3) return false;
    return node.s;
  }
  if (node.t === 3) return true;
  if (node.t === 4) return false;
  if (node.t === 5) return null;
  if (node.t === 10 || node.t === 11) {
    if (node.p?.k && node.p?.v) {
      const obj = {};
      for (let i = 0; i < node.p.k.length; i++) {
        obj[node.p.k[i]] = decodeSerovalAst(node.p.v[i]);
      }
      return obj;
    }
  }
  if (node.t === 9 || Array.isArray(node.a)) {
    return (node.a || []).map(decodeSerovalAst);
  }
  return node;
}

const users = {
  superAdmin: { email: "admin@test.yearbook", role: "super_admin" },
  coordinator: { email: "coordinator@test.yearbook", role: "coordinator" },
  advisor: { email: "teacher@test.yearbook", role: "advisor" },
  editorialMember: { email: "student@test.yearbook", role: "editorial_member" }, // Chloe Bennett (genuine student)
  staffMember: { email: "member@test.yearbook", role: "staff" }, // Marcus Vance (staff/member)
};

const results = [];
function assert(cond, name, details = "") {
  if (cond) {
    console.log(`✅ [PASS] ${name}`);
    results.push({ name, status: "PASS", details });
  } else {
    console.error(`❌ [FAIL] ${name}: ${details}`);
    results.push({ name, status: "FAIL", details });
  }
}

const createdSessions = [];

async function loginUser(email) {
  const pool = new pg.Pool({ connectionString });
  const userRes = await pool.query("SELECT id FROM public.users WHERE email = $1", [email]);
  const userId = userRes.rows[0]?.id;

  if (!userId) {
    await pool.end();
    throw new Error(`User ${email} not found.`);
  }

  const sessionToken = `test-session-${email.split("@")[0]}-${Date.now()}`;
  createdSessions.push(sessionToken);
  await pool.query(
    `INSERT INTO public.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day') ON CONFLICT (id) DO NOTHING`,
    [sessionToken, userId],
  );
  await pool.end();

  return { userId, sessionToken, cookie: `milestone_session=${sessionToken}` };
}

async function callFn(name, data, cookie) {
  const meta = FN_MAP[name];
  if (!meta) throw new Error(`Function ${name} not found in build manifest`);
  const url = `${BASE_URL}/_serverFn/${meta.id}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Origin: BASE_URL,
      "Sec-Fetch-Site": "same-origin",
      Cookie: cookie,
      "x-tsr-serverfn": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toJSON({ data })),
  });
  const text = await res.text();
  let decoded = null;
  let hasError = false;
  try {
    const rawJson = JSON.parse(text);
    decoded = decodeSerovalAst(rawJson);
    if (decoded?.error) hasError = true;
  } catch {
    decoded = text;
  }
  return { status: res.status, data: decoded, hasError, ok: res.ok && !hasError, rawText: text };
}

async function runE2E() {
  console.log("================================================================================");
  console.log("STARTING MULTI-ROLE E2E LIVE HTTP & API SECURITY TESTS");
  console.log("================================================================================");

  try {
    // 1. Super Admin Tests
    console.log("\n--- 1. Super Admin Verification ---");
    const adminAuth = await loginUser(users.superAdmin.email);
    const adminGetRes = await fetch(`${BASE_URL}/api/public/canva/return`, {
      headers: { Cookie: adminAuth.cookie },
      redirect: "manual",
    });
    assert(
      adminGetRes.status === 302 || adminGetRes.status === 200,
      "Super Admin can access Canva return route",
    );

    const adminOpenRes = await callFn(
      "adminOpenExternalDesignFlow",
      { yearbookId: ybId },
      adminAuth.cookie,
    );
    const editUrl = adminOpenRes.data?.result?.editUrl;
    assert(
      adminOpenRes.ok && editUrl && editUrl.includes("state="),
      "Super Admin receives valid Canva edit URL with signed correlation state",
    );

    // 2. Coordinator Tests
    console.log("\n--- 2. Coordinator Verification ---");
    const coordAuth = await loginUser(users.coordinator.email);

    // Coordinator denied Super Admin RPC
    const coordAdminAttempt = await callFn(
      "adminOpenExternalDesignFlow",
      { yearbookId: ybId },
      coordAuth.cookie,
    );
    assert(
      !coordAdminAttempt.ok || coordAdminAttempt.status === 403 || coordAdminAttempt.hasError,
      "Coordinator is denied access to Super Admin Canva RPCs",
    );

    // Coordinator can promote active Center Student (Chloe Bennett)
    const promoteChloeRes = await callFn(
      "coordinatorAssignStudentEditor",
      {
        yearbookId: ybId,
        studentUserId: "44444444-4444-4444-4444-444444444444",
      },
      coordAuth.cookie,
    );
    assert(
      promoteChloeRes.ok,
      "Coordinator can promote active Center Student (Chloe Bennett) to editorial_member",
    );

    // Coordinator CANNOT promote Staff/Member (Marcus Vance)
    const promoteMarcusRes = await callFn(
      "coordinatorAssignStudentEditor",
      {
        yearbookId: ybId,
        studentUserId: "33333333-3333-3333-3333-333333333333",
      },
      coordAuth.cookie,
    );
    assert(
      !promoteMarcusRes.ok || promoteMarcusRes.hasError,
      "Coordinator cannot promote Staff/Member (Marcus Vance) as Student Editor",
    );

    // Layout status RPC for Coordinator
    const coordLayoutRes = await callFn(
      "getYearbookLayout",
      { yearbookId: ybId },
      coordAuth.cookie,
    );
    const coordResult = coordLayoutRes.data?.result;
    assert(
      coordLayoutRes.ok && coordResult?.hasActiveLayout === true,
      "Coordinator receives layout status (hasActiveLayout = true)",
    );
    assert(
      coordResult?.assignedPages?.length === 4,
      `Coordinator receives all pages (${coordResult?.assignedPages?.length} pages)`,
    );

    // Zero Canva leakage check in coordinator payload
    const coordRawStr = JSON.stringify(coordLayoutRes.data).toLowerCase();
    assert(
      !coordRawStr.includes("canva") &&
        !coordRawStr.includes("dahta7_kxwi") &&
        !coordRawStr.includes("edit_url"),
      "Coordinator payload is completely sanitized (ZERO Canva names, IDs, or URLs)",
    );

    // 3. Faculty Advisor Tests
    console.log("\n--- 3. Faculty Advisor Verification ---");
    const advisorAuth = await loginUser(users.advisor.email);

    // Advisor can view layout pages
    const advisorLayoutRes = await callFn(
      "getYearbookLayout",
      { yearbookId: ybId },
      advisorAuth.cookie,
    );
    const advisorResult = advisorLayoutRes.data?.result;
    assert(
      advisorLayoutRes.ok && advisorResult?.assignedPages?.length === 4,
      "Advisor can view all layout pages in the workspace",
    );

    // Advisor is DENIED proof generation
    const advisorProofAttempt = await callFn(
      "requestLayoutProof",
      {
        yearbookId: ybId,
        pageId: "08566f26-c68b-4650-94f6-76969f1f583b",
      },
      advisorAuth.cookie,
    );
    assert(
      !advisorProofAttempt.ok || advisorProofAttempt.status === 403 || advisorProofAttempt.hasError,
      "Advisor is strictly denied proof generation (403)",
    );

    // Advisor is DENIED locking yearbook
    const advisorLockAttempt = await callFn(
      "lockYearbook",
      {
        yearbookId: ybId,
        proofId: "00000000-0000-0000-0000-000000000000",
        notes: "Advisor test lock",
      },
      advisorAuth.cookie,
    );
    assert(
      !advisorLockAttempt.ok || advisorLockAttempt.hasError,
      "Advisor is strictly denied locking the Yearbook",
    );

    // 4. Genuine Student Editorial Member Tests (Chloe Bennett)
    console.log("\n--- 4. Genuine Student Editorial Member Verification (Chloe Bennett) ---");
    const chloeAuth = await loginUser(users.editorialMember.email);

    const chloeLayoutRes = await callFn(
      "getYearbookLayout",
      { yearbookId: ybId },
      chloeAuth.cookie,
    );
    const chloeResult = chloeLayoutRes.data?.result;
    assert(
      chloeLayoutRes.ok &&
        chloeResult?.assignedPages?.length === 1 &&
        chloeResult?.assignedPages[0]?.pageNumber === 10,
      "Genuine Student Editorial Member receives ONLY assigned Page 10 in layout status",
    );

    // Chloe can generate proof on assigned Page 10
    const chloeProofRes = await callFn(
      "requestLayoutProof",
      {
        yearbookId: ybId,
        pageId: "08566f26-c68b-4650-94f6-76969f1f583b",
      },
      chloeAuth.cookie,
    );
    assert(
      chloeProofRes.ok && chloeProofRes.data?.result?.proofId,
      "Chloe can generate proof on assigned Page 10",
    );

    // Chloe is DENIED proof generation on unassigned Page 12
    const pool = new pg.Pool({ connectionString });
    const p12Res = await pool.query(
      "SELECT id FROM public.pages WHERE yearbook_id = $1 AND page_number = 12",
      [ybId],
    );
    await pool.end();
    const page12Id = p12Res.rows[0]?.id;

    if (page12Id) {
      const chloeUnassignedAttempt = await callFn(
        "requestLayoutProof",
        {
          yearbookId: ybId,
          pageId: page12Id,
        },
        chloeAuth.cookie,
      );
      assert(
        !chloeUnassignedAttempt.ok ||
          chloeUnassignedAttempt.status === 403 ||
          chloeUnassignedAttempt.hasError,
        "Chloe is denied proof generation on unassigned Page 12",
      );
    }

    // Chloe cannot lock the yearbook
    const chloeLockAttempt = await callFn(
      "lockYearbook",
      {
        yearbookId: ybId,
        proofId: "00000000-0000-0000-0000-000000000000",
        notes: "Chloe test lock",
      },
      chloeAuth.cookie,
    );
    assert(
      !chloeLockAttempt.ok || chloeLockAttempt.hasError,
      "Chloe cannot approve or lock the Yearbook",
    );

    // 5. Staff / Member Tests (Marcus Vance)
    console.log("\n--- 5. Staff / Member Verification (Marcus Vance) ---");
    const marcusAuth = await loginUser(users.staffMember.email);

    // Marcus receives Staff/Member roles
    const marcusYbRes = await callFn("getYearbook", { yearbookId: ybId }, marcusAuth.cookie);
    const marcusRoles = marcusYbRes.data?.result?.myRoles || [];
    assert(
      marcusRoles.includes("staff") &&
        !marcusRoles.includes("editorial_member") &&
        !marcusRoles.includes("student"),
      "Marcus Vance receives canonical Staff/Member roles in Yearbook workspace",
      `marcusRoles: ${JSON.stringify(marcusRoles)}, data: ${JSON.stringify(marcusYbRes.data)}`,
    );

    // ------------------------------------------------------------------------
    // SUMMARY
    // ------------------------------------------------------------------------
    console.log(
      "\n================================================================================",
    );
    const passed = results.filter((r) => r.status === "PASS").length;
    const failed = results.filter((r) => r.status === "FAIL").length;
    console.log(
      `MULTI-ROLE E2E SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${results.length})`,
    );
    console.log("================================================================================");

    if (failed > 0) process.exit(1);
  } finally {
    // Clean up created test sessions safely
    if (createdSessions.length > 0) {
      const pool = new pg.Pool({ connectionString });
      await pool.query("DELETE FROM public.sessions WHERE id = ANY($1)", [createdSessions]);
      await pool.end();
    }
  }
}

runE2E().catch((err) => {
  console.error("E2E FATAL ERROR:", err);
  process.exit(1);
});
