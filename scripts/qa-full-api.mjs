/**
 * Milestone Yearbook — Comprehensive LocalDev API QA Suite
 * Invokes TanStack Start server functions through HTTP RPC using Seroval serialization.
 * Target URL: http://yearbook-manager.test/ (Nginx -> Docker -> Node 22 / Nitro SSR)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { toJSON } from "seroval";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = "http://yearbook-manager.test";

const RESULTS = [];
let PASS = 0,
  FAIL = 0,
  WARN = 0;

// ─── Colors ──────────────────────────────────────────────────────────────────
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const B = (s) => `\x1b[34m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

function log(icon, label, msg = "") {
  console.log(`  ${icon} ${label}${msg ? DIM(" — " + msg) : ""}`);
}
function pass(label, detail = "") {
  PASS++;
  log(G("✔"), label, detail);
  RESULTS.push({ status: "PASS", label, detail });
}
function fail(label, detail = "") {
  FAIL++;
  log(R("✘"), label, detail);
  RESULTS.push({ status: "FAIL", label, detail });
}
function warn(label, detail = "") {
  WARN++;
  log(Y("⚠"), label, detail);
  RESULTS.push({ status: "WARN", label, detail });
}
function section(title) {
  console.log(`\n${B("━".repeat(65))}\n${B("  " + title)}\n${B("━".repeat(65))}`);
}

// ─── Discover Server Functions ───────────────────────────────────────────────
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

// ─── Seroval Decoder ─────────────────────────────────────────────────────────
function decodeSeroval(node) {
  if (!node || typeof node !== "object") return node;
  if ("f" in node && "t" in node && typeof node.f === "number") {
    return decodeSeroval(node.t);
  }
  switch (node.t) {
    case 1:
      return node.s; // string
    case 2: // constant
      if (node.s === 0) return null;
      if (node.s === 1) return false;
      if (node.s === 2) return true;
      if (node.s === 3) return undefined;
      return node.s;
    case 3:
      return typeof node.s === "number" ? node.s : Number(node.s); // number
    case 4:
      return BigInt(node.s);
    case 9:
      return (node.a || []).map((item) => decodeSeroval(item)); // array
    case 10: // object
    case 11: {
      // null-proto object
      const obj = {};
      const keys = node.p?.k || [];
      const vals = node.p?.v || [];
      for (let i = 0; i < keys.length; i++) {
        obj[keys[i]] = decodeSeroval(vals[i]);
      }
      return obj;
    }
    case 25: // error / custom plugin
      return { _error: true, message: decodeSeroval(node.s?.message) || "Error" };
    default:
      return node;
  }
}

// ─── RPC Caller with automatic GET/POST negotiation ──────────────────────────
async function callServerFn(fnName, inputData = null, sessionCookie = null, forceMethod = null) {
  const meta = FN_MAP[fnName];
  if (!meta) {
    throw new Error(`Server function "${fnName}" not found in build manifest.`);
  }

  // Determine likely HTTP method: GET if no data or starts with get/list, else POST
  let method = forceMethod;
  if (!method) {
    if (fnName.startsWith("get") || fnName.startsWith("list") || fnName === "browseProvider") {
      method = "GET";
    } else {
      method = "POST";
    }
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

  // If method mismatch (405), retry with opposite method
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
    raw: text,
  };
}

async function loginUser(email, password) {
  const r = await callServerFn("loginWithPassword", { email, password });
  if (!r.ok || !r.setCookie) {
    throw new Error(
      `Login failed for ${email} (status ${r.status}): ${JSON.stringify(r.error || r.result)}`,
    );
  }
  const match = r.setCookie.match(/milestone_session=([^;]+)/);
  return match ? match[1] : r.setCookie.split(";")[0];
}

// ─── MAIN QA SUITE ───────────────────────────────────────────────────────────
async function main() {
  console.log(B("\n╔═══════════════════════════════════════════════════════════════╗"));
  console.log(B("║     MILESTONE YEARBOOK — COMPREHENSIVE LOCALDEV API QA        ║"));
  console.log(B("╚═══════════════════════════════════════════════════════════════╝"));
  console.log(DIM(`  Canonical URL: ${BASE_URL}`));
  console.log(DIM(`  Functions:     ${Object.keys(FN_MAP).length} registered server actions`));
  console.log(DIM(`  Timestamp:     ${new Date().toISOString()}\n`));

  // ─── 0. Connectivity Check ────────────────────────────────────────────────
  section("0. Infrastructure & Connectivity");
  try {
    const res = await fetch(`${BASE_URL}/auth`);
    if (res.status < 500) {
      pass("App reachable through Nginx proxy", `HTTP ${res.status}`);
    } else {
      fail("App reachable through Nginx proxy", `HTTP ${res.status}`);
    }
  } catch (e) {
    fail("App reachable through Nginx proxy", e.message);
    process.exit(1);
  }

  // ─── 1. Authentication Pass ───────────────────────────────────────────────
  section("1. Authentication — All 5 LocalDev Roles");
  const sessions = {};
  const accounts = [
    {
      key: "admin",
      email: "admin@test.yearbook",
      pw: "Mb7!f00e9c4b39a68ebb$X9",
      label: "Super Admin",
    },
    {
      key: "coordinator",
      email: "coordinator@test.yearbook",
      pw: "Mb7!coord_2026_pass$X9",
      label: "School A Coordinator",
    },
    {
      key: "member",
      email: "member@test.yearbook",
      pw: "Mb7!member_2026_pass$X9",
      label: "School A Member",
    },
    {
      key: "student",
      email: "student@test.yearbook",
      pw: "Mb7!student_2026_pass$X9",
      label: "School A Student",
    },
    {
      key: "coordinator_b",
      email: "coordinator-b@test.yearbook",
      pw: "Mb7!coord_b_2026_pass$X9",
      label: "School B Coordinator",
    },
  ];

  for (const acc of accounts) {
    try {
      sessions[acc.key] = await loginUser(acc.email, acc.pw);
      pass(`Login: ${acc.email} (${acc.label})`);
    } catch (e) {
      fail(`Login: ${acc.email} (${acc.label})`, e.message);
    }
  }

  // Verify invalid credentials rejection
  try {
    await loginUser("admin@test.yearbook", "WrongPassword123!");
    fail("Invalid password rejected", "Should have failed");
  } catch {
    pass("Invalid password rejected (Authentication barrier verified)");
  }

  // Test getCurrentUser
  if (sessions.admin) {
    const cur = await callServerFn("getCurrentUser", null, sessions.admin);
    if (cur.ok && cur.result?.user?.email === "admin@test.yearbook") {
      pass("getCurrentUser (admin)", `User: ${cur.result.user.fullName} (${cur.result.user.id})`);
    } else {
      fail("getCurrentUser (admin)", JSON.stringify(cur.error || cur.result));
    }
  }

  // ─── 2. Control Center / Dashboard ────────────────────────────────────────
  section("2. Control Center & Dashboard");
  let dashboardData = null;
  if (sessions.admin) {
    const cc = await callServerFn("getControlCenter", null, sessions.admin);
    if (cc.ok && cc.result?.schools) {
      dashboardData = cc.result;
      pass(
        "getControlCenter (admin)",
        `${dashboardData.schools.length} schools, ${dashboardData.yearbooks.length} yearbooks, isSuperAdmin=${dashboardData.isSuperAdmin}`,
      );
    } else {
      fail("getControlCenter (admin)", JSON.stringify(cc.error || cc.result));
    }
  }

  if (sessions.coordinator) {
    const cc = await callServerFn("getControlCenter", null, sessions.coordinator);
    if (cc.ok && cc.result?.yearbooks) {
      pass(
        "getControlCenter (coordinator)",
        `${cc.result.yearbooks.length} yearbooks visible, isSuperAdmin=${cc.result.isSuperAdmin}`,
      );
    } else {
      fail("getControlCenter (coordinator)", JSON.stringify(cc.error || cc.result));
    }
  }

  // ─── 3. School & Yearbook Management ──────────────────────────────────────
  section("3. School & Yearbook Management");
  let demoSchool = null;
  let demoYearbook = null;

  if (dashboardData?.schools) {
    demoSchool =
      dashboardData.schools.find((s) => s.name.includes("Demo High")) || dashboardData.schools[0];
    demoYearbook =
      dashboardData.yearbooks.find((y) => y.schools?.name?.includes("Demo High")) ||
      dashboardData.yearbooks[0];
    pass("Resolved Demo High School", `School: ${demoSchool?.name} (${demoSchool?.id})`);
    pass(
      "Resolved Demo High Yearbook",
      `Yearbook: ${demoYearbook?.title || demoYearbook?.year} (${demoYearbook?.id})`,
    );
  }

  // Admin creates a school
  let createdSchoolId = null;
  if (sessions.admin) {
    const cs = await callServerFn(
      "createSchool",
      {
        name: `QA Test School ${Date.now()}`,
        short_name: "QA-SCH",
        contact_email: "qa.school@test.yearbook",
      },
      sessions.admin,
    );
    if (cs.ok && cs.result?.id) {
      createdSchoolId = cs.result.id;
      pass("createSchool (admin)", `Created ID: ${createdSchoolId}`);

      // Update school
      const us = await callServerFn(
        "updateSchool",
        {
          id: createdSchoolId,
          patch: { notes: "Verified by Automated QA Suite" },
        },
        sessions.admin,
      );
      if (us.ok) {
        pass("updateSchool (admin)", "Notes patched");
      } else {
        fail("updateSchool (admin)", JSON.stringify(us.error));
      }
    } else {
      fail("createSchool (admin)", JSON.stringify(cs.error || cs.result));
    }
  }

  // Admin creates a yearbook in the QA school
  let newYearbookId = null;
  if (sessions.admin && createdSchoolId) {
    const cy = await callServerFn(
      "createYearbook",
      {
        school_id: createdSchoolId,
        year: 2027,
        title: "QA Class of 2027",
        theme: "Testing & Quality Assurance",
      },
      sessions.admin,
    );
    if (cy.ok && cy.result?.id) {
      newYearbookId = cy.result.id;
      pass("createYearbook (admin)", `Yearbook ID: ${newYearbookId}`);
    } else {
      fail("createYearbook (admin)", JSON.stringify(cy.error || cy.result));
    }
  }

  // getYearbook on Demo High School
  const targetYearbookId = demoYearbook?.id || newYearbookId;
  if (sessions.admin && targetYearbookId) {
    const gy = await callServerFn("getYearbook", { yearbookId: targetYearbookId }, sessions.admin);
    if (gy.ok && gy.result?.yearbook) {
      const d = gy.result;
      pass(
        "getYearbook (admin)",
        `${d.sections?.length || 0} sections, ${d.members?.length || 0} members, canManage=${d.canManage}`,
      );
    } else {
      fail("getYearbook (admin)", JSON.stringify(gy.error || gy.result));
    }
  }

  if (sessions.coordinator && targetYearbookId) {
    const gy = await callServerFn(
      "getYearbook",
      { yearbookId: targetYearbookId },
      sessions.coordinator,
    );
    if (gy.ok && gy.result?.yearbook) {
      pass("getYearbook (coordinator)", `canManage=${gy.result.canManage}`);
    } else {
      fail("getYearbook (coordinator)", JSON.stringify(gy.error || gy.result));
    }
  }

  // ─── 4. Page Ladder Management ────────────────────────────────────────────
  section("4. Ladder & Page Management");
  if (sessions.admin && targetYearbookId) {
    const gl = await callServerFn("getLadder", { yearbookId: targetYearbookId }, sessions.admin);
    if (gl.ok && gl.result?.pages) {
      pass("getLadder (admin on Demo High)", `${gl.result.pages.length} pages loaded`);
    } else {
      fail("getLadder (admin)", JSON.stringify(gl.error || gl.result));
    }
  }

  let testPageId = null;
  if (sessions.admin && newYearbookId) {
    // createPages
    const cp = await callServerFn(
      "createPages",
      {
        yearbookId: newYearbookId,
        count: 4,
        title: "QA Initial Page",
      },
      sessions.admin,
    );
    if (cp.ok && cp.result?.created) {
      pass("createPages (4 pages in new yearbook)", `Created: ${cp.result.created}`);
    } else {
      fail("createPages", JSON.stringify(cp.error || cp.result));
    }

    // getLadder on new yearbook
    const gl = await callServerFn("getLadder", { yearbookId: newYearbookId }, sessions.admin);
    if (gl.ok && gl.result?.pages?.length > 0) {
      testPageId = gl.result.pages[0].id;
      pass("getLadder on new yearbook", `${gl.result.pages.length} pages verified`);

      // updatePage
      const up = await callServerFn(
        "updatePage",
        {
          id: testPageId,
          patch: { title: "QA Updated Title", design_status: "ready_for_design" },
        },
        sessions.admin,
      );
      if (up.ok) {
        pass("updatePage (admin)", "title and design_status updated");
      } else {
        fail("updatePage", JSON.stringify(up.error));
      }

      // reorderPages
      const pageIdsReversed = gl.result.pages.map((p) => p.id).reverse();
      const ro = await callServerFn(
        "reorderPages",
        { orderedIds: pageIdsReversed },
        sessions.admin,
      );
      if (ro.ok) {
        pass("reorderPages (admin)", "Reversed 4 pages");
      } else {
        fail("reorderPages", JSON.stringify(ro.error));
      }

      // renumberPages
      const rn = await callServerFn(
        "renumberPages",
        { yearbookId: newYearbookId, startAt: 10 },
        sessions.admin,
      );
      if (rn.ok) {
        pass("renumberPages (admin, startAt 10)", `Renumbered ${rn.result?.renumbered} pages`);
      } else {
        fail("renumberPages", JSON.stringify(rn.error));
      }
    }
  }

  // ─── 5. People & Portraits ────────────────────────────────────────────────
  section("5. People — Students, Faculty, Classes & CSV Import");
  if (sessions.admin && targetYearbookId) {
    const gp = await callServerFn("getPeople", { yearbookId: targetYearbookId }, sessions.admin);
    if (gp.ok && gp.result) {
      const d = gp.result;
      pass(
        "getPeople (admin)",
        `${d.students?.length || 0} students, ${d.faculty?.length || 0} faculty, ${d.classes?.length || 0} classes`,
      );
    } else {
      fail("getPeople (admin)", JSON.stringify(gp.error || gp.result));
    }
  }

  if (sessions.coordinator && targetYearbookId) {
    // savePerson (create student)
    const sp = await callServerFn(
      "savePerson",
      {
        table: "students",
        values: { first_name: "Alex", last_name: "QA-Student", grade: "11" },
        yearbookId: targetYearbookId,
      },
      sessions.coordinator,
    );
    if (sp.ok && sp.result?.id) {
      const createdStudentId = sp.result.id;
      pass("savePerson (student create)", `Student ID: ${createdStudentId}`);

      // deletePerson
      const dp = await callServerFn(
        "deletePerson",
        {
          table: "students",
          id: createdStudentId,
        },
        sessions.coordinator,
      );
      if (dp.ok) {
        pass("deletePerson (student delete)", "Cleaned up test student");
      } else {
        fail("deletePerson", JSON.stringify(dp.error));
      }
    } else {
      fail("savePerson", JSON.stringify(sp.error || sp.result));
    }
  }

  if (sessions.coordinator && newYearbookId) {
    const csvData =
      "first_name,last_name,grade,homeroom\nJordan,Miller,12,Room 101\nTaylor,Smith,12,Room 102";
    const ip = await callServerFn(
      "importPeople",
      {
        yearbookId: newYearbookId,
        kind: "students",
        csv: csvData,
      },
      sessions.coordinator,
    );
    if (ip.ok) {
      pass("importPeople (CSV bulk import)", `Inserted ${ip.result?.inserted || 0} students`);
    } else {
      fail("importPeople", JSON.stringify(ip.error || ip.result));
    }
  }

  // ─── 6. Team & Invitations ────────────────────────────────────────────────
  section("6. Team Management & Invitations");
  let newMemberId = null;
  if (sessions.admin && newYearbookId) {
    // addMember
    const am = await callServerFn(
      "addMember",
      {
        yearbookId: newYearbookId,
        email: "coordinator@test.yearbook",
        role: "coordinator",
      },
      sessions.admin,
    );
    if (am.ok && am.result?.id) {
      newMemberId = am.result.id;
      pass("addMember (coordinator)", `Member ID: ${newMemberId}`);
    } else {
      fail("addMember", JSON.stringify(am.error || am.result));
    }

    // inviteUser
    const iu = await callServerFn(
      "inviteUser",
      {
        yearbookId: newYearbookId,
        email: "new.staff@test.yearbook",
        role: "staff",
      },
      sessions.admin,
    );
    if (iu.ok && iu.result?.id) {
      pass("inviteUser (pending invitation created)", `Token: ${iu.result.token?.slice(0, 12)}...`);
    } else {
      fail("inviteUser", JSON.stringify(iu.error || iu.result));
    }

    // getInvitations
    const gi = await callServerFn("getInvitations", { yearbookId: newYearbookId }, sessions.admin);
    if (gi.ok && Array.isArray(gi.result)) {
      pass("getInvitations (admin)", `${gi.result.length} invitations listed`);
    } else {
      fail("getInvitations", JSON.stringify(gi.error || gi.result));
    }

    // removeMember
    if (newMemberId) {
      const rm = await callServerFn("removeMember", { id: newMemberId }, sessions.admin);
      if (rm.ok) {
        pass("removeMember (admin)", "Member removed");
      } else {
        fail("removeMember", JSON.stringify(rm.error));
      }
    }
  }

  // ─── 7. Asset Library ─────────────────────────────────────────────────────
  section("7. Asset Library & Audit Logs");
  if (sessions.admin && targetYearbookId) {
    const ga = await callServerFn(
      "getAssets",
      { yearbookId: targetYearbookId, filters: {} },
      sessions.admin,
    );
    if (ga.ok && Array.isArray(ga.result)) {
      pass("getAssets (admin)", `${ga.result.length} assets retrieved`);
    } else {
      fail("getAssets", JSON.stringify(ga.error || ga.result));
    }
  }

  let testAssetId = null;
  if (sessions.coordinator && targetYearbookId) {
    const ca = await callServerFn(
      "createAsset",
      {
        yearbookId: targetYearbookId,
        fileName: "homecoming_banner_2026.jpg",
        fileType: "image/jpeg",
        fileSize: 450210,
        storagePath: `yearbooks/${targetYearbookId}/assets/homecoming_banner.jpg`,
        assetType: "photo",
        category: "events",
      },
      sessions.coordinator,
    );
    if (ca.ok && ca.result?.id) {
      testAssetId = ca.result.id;
      pass("createAsset (coordinator)", `Asset ID: ${testAssetId}`);

      // updateAssetStatus -> under_review
      const uas1 = await callServerFn(
        "updateAssetStatus",
        {
          assetId: testAssetId,
          status: "under_review",
          notes: "Submitted for editorial review",
        },
        sessions.coordinator,
      );
      if (uas1.ok) {
        pass("updateAssetStatus -> under_review");
      } else {
        fail("updateAssetStatus (under_review)", JSON.stringify(uas1.error));
      }

      // Admin approves asset
      const uas2 = await callServerFn(
        "updateAssetStatus",
        {
          assetId: testAssetId,
          status: "approved",
        },
        sessions.admin,
      );
      if (uas2.ok) {
        pass("updateAssetStatus -> approved (admin)");
      } else {
        fail("updateAssetStatus (approved)", JSON.stringify(uas2.error));
      }

      // getAssetDetails
      const gad = await callServerFn("getAssetDetails", { assetId: testAssetId }, sessions.admin);
      if (gad.ok && gad.result?.asset) {
        pass(
          "getAssetDetails (with audit log history)",
          `${gad.result.auditLogs?.length || 0} audit log entries`,
        );
      } else {
        fail("getAssetDetails", JSON.stringify(gad.error || gad.result));
      }
    } else {
      fail("createAsset", JSON.stringify(ca.error || ca.result));
    }
  }

  // ─── 8. Proofing & Corrections ────────────────────────────────────────────
  section("8. Proofing, Corrections & Approvals");
  let testProofId = null;
  if (sessions.coordinator && targetYearbookId) {
    const gl = await callServerFn(
      "getLadder",
      { yearbookId: targetYearbookId },
      sessions.coordinator,
    );
    const pageIds = (gl.result?.pages || []).slice(0, 2).map((p) => p.id);

    const cp = await callServerFn(
      "createProof",
      {
        yearbookId: targetYearbookId,
        pageIds,
        storagePath: `yearbooks/${targetYearbookId}/proofs/demo_proof_v1.pdf`,
        notes: "Initial proof for review",
      },
      sessions.coordinator,
    );

    if (cp.ok && cp.result?.id) {
      testProofId = cp.result.id;
      pass("createProof (coordinator)", `Proof ID: ${testProofId}, version: ${cp.result.version}`);
    } else {
      fail("createProof", JSON.stringify(cp.error || cp.result));
    }
  }

  if (sessions.admin && targetYearbookId) {
    const gp = await callServerFn("getProofs", { yearbookId: targetYearbookId }, sessions.admin);
    if (gp.ok && Array.isArray(gp.result)) {
      pass("getProofs (admin)", `${gp.result.length} proofs retrieved`);
    } else {
      fail("getProofs", JSON.stringify(gp.error || gp.result));
    }
  }

  let testCorrectionId = null;
  if (sessions.coordinator && targetYearbookId && testProofId) {
    const gl = await callServerFn(
      "getLadder",
      { yearbookId: targetYearbookId },
      sessions.coordinator,
    );
    const targetPageId = gl.result?.pages?.[0]?.id;

    if (targetPageId) {
      const cc = await callServerFn(
        "createCorrection",
        {
          yearbookId: targetYearbookId,
          proofId: testProofId,
          pageId: targetPageId,
          annotationType: "point",
          coordinates: { x: 120, y: 340 },
          title: "Spelling error in principal message",
          description: 'Change "principial" to "principal"',
          category: "copy",
          priority: "high",
        },
        sessions.coordinator,
      );

      if (cc.ok && cc.result?.id) {
        testCorrectionId = cc.result.id;
        pass("createCorrection (coordinator)", `Correction ID: ${testCorrectionId}`);

        // Add comment
        const acc = await callServerFn(
          "addCorrectionComment",
          {
            correctionId: testCorrectionId,
            content: "I have updated the copy deck. Ready for re-export.",
          },
          sessions.admin,
        );
        if (acc.ok) {
          pass("addCorrectionComment (admin)", "Comment added");
        } else {
          fail("addCorrectionComment", JSON.stringify(acc.error));
        }

        // Update status to resolved
        const ucs = await callServerFn(
          "updateCorrectionStatus",
          {
            correctionId: testCorrectionId,
            status: "resolved",
            resolutionNotes: "Fixed and verified in draft",
          },
          sessions.coordinator,
        );
        if (ucs.ok) {
          pass("updateCorrectionStatus -> resolved");
        } else {
          fail("updateCorrectionStatus", JSON.stringify(ucs.error));
        }
      } else {
        fail("createCorrection", JSON.stringify(cc.error || cc.result));
      }
    }
  }

  if (sessions.admin && targetYearbookId) {
    const gc = await callServerFn(
      "getCorrections",
      { yearbookId: targetYearbookId },
      sessions.admin,
    );
    if (gc.ok && Array.isArray(gc.result)) {
      pass(
        "getCorrections (admin with profiles & comments)",
        `${gc.result.length} corrections loaded`,
      );
    } else {
      fail("getCorrections", JSON.stringify(gc.error || gc.result));
    }
  }

  // Page Approval & Yearbook Lock
  if (sessions.admin && targetYearbookId && testProofId) {
    const gl = await callServerFn("getLadder", { yearbookId: targetYearbookId }, sessions.admin);
    const targetPageId = gl.result?.pages?.[0]?.id;
    if (targetPageId) {
      const ap = await callServerFn(
        "approvePage",
        {
          pageId: targetPageId,
          proofId: testProofId,
          yearbookId: targetYearbookId,
        },
        sessions.admin,
      );
      if (ap.ok) {
        pass("approvePage (admin on Page 1)");
      } else {
        fail("approvePage", JSON.stringify(ap.error));
      }
    }

    // lockYearbook
    const ly = await callServerFn(
      "lockYearbook",
      {
        yearbookId: targetYearbookId,
        proofId: testProofId,
        notes: "Final Signoff for QA run",
      },
      sessions.admin,
    );
    if (ly.ok) {
      pass("lockYearbook (admin signoff)");

      // unlockYearbook
      const uy = await callServerFn(
        "unlockYearbook",
        {
          yearbookId: targetYearbookId,
          proofId: testProofId,
          reason: "Reopened for post-audit modifications",
        },
        sessions.admin,
      );
      if (uy.ok) {
        pass("unlockYearbook (admin)");
      } else {
        fail("unlockYearbook", JSON.stringify(uy.error));
      }
    } else {
      fail("lockYearbook", JSON.stringify(ly.error));
    }
  }

  // ─── 9. Production & Preflight ────────────────────────────────────────────
  section("9. Production Workflow & Preflight");
  if (sessions.admin && targetYearbookId) {
    const pd = await callServerFn(
      "getProductionDashboardData",
      { yearbookId: targetYearbookId },
      sessions.admin,
    );
    if (pd.ok && pd.result) {
      pass(
        "getProductionDashboardData (admin)",
        `${pd.result.snapshots?.length || 0} snapshots, ${pd.result.serviceBureaus?.length || 0} print bureaus`,
      );
    } else {
      fail("getProductionDashboardData", JSON.stringify(pd.error || pd.result));
    }

    const rr = await callServerFn(
      "getReadinessReport",
      { yearbookId: targetYearbookId },
      sessions.admin,
    );
    if (rr.ok && rr.result) {
      pass(
        "getReadinessReport",
        `ready=${rr.result.ready}, blockers=${rr.result.blockers?.length || 0}, warnings=${rr.result.warnings?.length || 0}`,
      );
    } else {
      fail("getReadinessReport", JSON.stringify(rr.error || rr.result));
    }
  }

  let snapshotId = null;
  if (sessions.admin && targetYearbookId) {
    const cps = await callServerFn(
      "createProductionSnapshot",
      { yearbookId: targetYearbookId },
      sessions.admin,
    );
    if (cps.ok && cps.result?.id) {
      snapshotId = cps.result.id;
      pass(
        "createProductionSnapshot (admin)",
        `Snapshot ID: ${snapshotId}, version: ${cps.result.version}`,
      );

      // runPreflight
      const rpf = await callServerFn(
        "runPreflight",
        {
          yearbookId: targetYearbookId,
          snapshotId,
        },
        sessions.admin,
      );
      if (rpf.ok && rpf.result?.id) {
        pass("runPreflight (admin)", `Preflight status: ${rpf.result.status}`);
      } else {
        fail("runPreflight", JSON.stringify(rpf.error || rpf.result));
      }

      // generateProductionPackage
      const gpp = await callServerFn(
        "generateProductionPackage",
        {
          yearbookId: targetYearbookId,
          snapshotId,
        },
        sessions.admin,
      );
      if (gpp.ok && gpp.result?.id) {
        pass(
          "generateProductionPackage (admin)",
          `Package ID: ${gpp.result.id}, path: ${gpp.result.storage_path}`,
        );
      } else {
        fail("generateProductionPackage", JSON.stringify(gpp.error || gpp.result));
      }
    } else {
      fail("createProductionSnapshot", JSON.stringify(cps.error || cps.result));
    }
  }

  // ─── 10. Storage Provider Config ──────────────────────────────────────────
  section("10. Storage Connections (Direct Local Provider)");
  if (sessions.admin) {
    const gos = await callServerFn("getOrganizationStorage", null, sessions.admin);
    if (gos.ok) {
      pass(
        "getOrganizationStorage (admin)",
        `${Array.isArray(gos.result) ? gos.result.length : 0} org connections`,
      );
    } else {
      fail("getOrganizationStorage", JSON.stringify(gos.error || gos.result));
    }
  }

  if (sessions.coordinator && targetYearbookId) {
    const gys = await callServerFn(
      "getYearbookStorage",
      { yearbookId: targetYearbookId },
      sessions.coordinator,
    );
    if (gys.ok) {
      pass("getYearbookStorage (coordinator)", `Mode: ${gys.result?.mode || "default"}`);
    } else {
      fail("getYearbookStorage", JSON.stringify(gys.error || gys.result));
    }
  }

  if (sessions.member) {
    const gms = await callServerFn("getMyStorageConnections", null, sessions.member);
    if (gms.ok) {
      pass(
        "getMyStorageConnections (member)",
        `${Array.isArray(gms.result) ? gms.result.length : 0} connections`,
      );
    } else {
      fail("getMyStorageConnections", JSON.stringify(gms.error || gms.result));
    }
  }

  // ─── 11. Design / Canva Settings ──────────────────────────────────────────
  section("11. Design & Canva Integrations");
  if (sessions.admin && targetYearbookId) {
    const gcc = await callServerFn(
      "getCanvaConfig",
      { yearbookId: targetYearbookId },
      sessions.admin,
    );
    if (gcc.ok) {
      pass("getCanvaConfig (admin)", gcc.result ? "Configured" : "Not configured (expected)");
    } else {
      fail("getCanvaConfig", JSON.stringify(gcc.error || gcc.result));
    }
  }

  if (sessions.coordinator && targetYearbookId) {
    const gcn = await callServerFn(
      "getCanvaConnection",
      { yearbookId: targetYearbookId },
      sessions.coordinator,
    );
    if (gcn.ok) {
      pass(
        "getCanvaConnection (coordinator)",
        gcn.result ? "Connected" : "Not connected (expected)",
      );
    } else {
      fail("getCanvaConnection", JSON.stringify(gcn.error || gcn.result));
    }
  }

  // ─── 12. Tenant Isolation & Security ──────────────────────────────────────
  section("12. Tenant Isolation & Security Boundaries");

  // Test unauthenticated access rejection
  const unauthFns = [
    "getControlCenter",
    "getLadder",
    "getAssets",
    "getProofs",
    "getProductionDashboardData",
  ];
  for (const fn of unauthFns) {
    try {
      const res = await callServerFn(fn, null, null);
      if (!res.ok || res.status === 401 || res.status === 403 || res.error) {
        pass(`Unauthenticated ${fn} rejected`);
      } else {
        fail(`Unauthenticated ${fn} ALLOWED! Security breach!`);
      }
    } catch {
      pass(`Unauthenticated ${fn} rejected (thrown error)`);
    }
  }

  // Cross-tenant permission checks
  if (sessions.coordinator_b && sessions.coordinator && dashboardData) {
    const ccB = await callServerFn("getControlCenter", null, sessions.coordinator_b);
    const schoolBYearbook = ccB.result?.yearbooks?.find((y) =>
      y.schools?.name?.includes("Isolation"),
    );

    if (schoolBYearbook && targetYearbookId) {
      // Coordinator of School A tries to access School B yearbook
      const gyB = await callServerFn(
        "getYearbook",
        { yearbookId: schoolBYearbook.id },
        sessions.coordinator,
      );
      if (gyB.ok && gyB.result?.canManage) {
        fail("Cross-school isolation breach: School A coordinator has canManage in School B!");
      } else {
        pass("Cross-school isolation: School A coordinator cannot manage School B");
      }

      // Coordinator of School B tries to access School A yearbook
      const gyA = await callServerFn(
        "getYearbook",
        { yearbookId: targetYearbookId },
        sessions.coordinator_b,
      );
      if (gyA.ok && gyA.result?.canManage) {
        fail("Cross-school isolation breach: School B coordinator has canManage in School A!");
      } else {
        pass("Cross-school isolation: School B coordinator cannot manage School A");
      }
    }
  }

  // ─── FINAL REPORT ─────────────────────────────────────────────────────────
  section("SUMMARY & QA VERDICT");
  const total = PASS + FAIL + WARN;
  console.log(`
  Total Test Assertions: ${total}
  ${G(`Passed:               ${PASS}`)}
  ${FAIL > 0 ? R(`Failed:               ${FAIL}`) : `Failed:               0`}
  ${WARN > 0 ? Y(`Warnings:             ${WARN}`) : `Warnings:             0`}
  `);

  if (FAIL > 0) {
    console.log(R("❌ FAILED ASSERTIONS:"));
    RESULTS.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(R(`   ✘ ${r.label}`) + (r.detail ? DIM(` (${r.detail})`) : ""));
    });
  }

  if (FAIL === 0) {
    console.log(G("✅ ALL FUNCTIONAL & SECURITY QA CHECKS PASSED PERFECTLY!\n"));
    process.exit(0);
  } else {
    console.log(R(`❌ ${FAIL} CHECK(S) FAILED. REVIEW ERRORS ABOVE.\n`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(R("\nFATAL ERROR IN TEST SUITE:"), err);
  process.exit(1);
});
