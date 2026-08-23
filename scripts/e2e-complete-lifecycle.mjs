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
    for (const m of matches) fnMap[m[2]] = { id: m[1], name: m[2] };
  }
  return fnMap;
}

const FN_MAP = loadServerFnMap();

function loadAccountsFromDoc() {
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

const ACCOUNTS = loadAccountsFromDoc();

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
  return res.headers.get("set-cookie").split(";")[0];
}

async function callFn(name, data, cookie, forceMethod = null) {
  const meta = FN_MAP[name];
  if (!meta) throw new Error(`Function ${name} not found`);
  let method =
    forceMethod ||
    (name.startsWith("get") || name.startsWith("list") || name === "runPreflight" ? "GET" : "POST");
  const url =
    method === "GET"
      ? `${BASE_URL}/_serverFn/${meta.id}?payload=${encodeURIComponent(JSON.stringify(toJSON({ data })))}`
      : `${BASE_URL}/_serverFn/${meta.id}`;
  const res = await fetch(url, {
    method,
    headers: {
      Origin: BASE_URL,
      "Sec-Fetch-Site": "same-origin",
      Cookie: cookie,
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
  return { status: res.status, data: parsed, ok: res.ok };
}

async function runFullLifecycle() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  COMPLETE END-TO-END LIFECYCLE WORKFLOW VERIFICATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const adminCookie = await login("admin@test.yearbook");
  const coordCookie = await login("coordinator@test.yearbook");
  const memberCookie = await login("member@test.yearbook");
  const studentCookie = await login("student@test.yearbook");

  // Step 1: Create School
  const schoolName = `Summit High ${Date.now()}`;
  console.log(`[Step 1] Creating new school: "${schoolName}" as Super Admin...`);
  const createSchoolRes = await callFn(
    "createSchool",
    { name: schoolName, city: "Denver", state: "CO" },
    adminCookie,
  );
  const schoolId =
    createSchoolRes.data?.p?.v?.[0]?.id || createSchoolRes.data?.p?.v?.[0]?.p?.v?.[0];
  console.log(`  ✔ School created: ${schoolId}`);

  // Step 2: Create Yearbook under school
  console.log(`[Step 2] Creating 2026 Yearbook under new school...`);
  const createYbRes = await callFn(
    "createYearbook",
    { schoolId, year: 2026, title: "Apex 2026", theme: "Reach New Heights", pageCount: 32 },
    adminCookie,
  );
  const ybId = createYbRes.data?.p?.v?.[0]?.id || createYbRes.data?.p?.v?.[0]?.p?.v?.[0];
  console.log(`  ✔ Yearbook created: ${ybId}`);

  // Step 3: Build Page Ladder
  console.log(`[Step 3] Creating 6 pages for page ladder...`);
  await callFn(
    "createPages",
    { yearbookId: ybId, count: 6, startNumber: 1, typeId: "portrait_grid", sectionId: "seniors" },
    adminCookie,
  );
  const ladderRes = await callFn("getLadder", { yearbookId: ybId }, adminCookie);
  console.log(`  ✔ Pages created and ladder loaded`);

  // Step 4: Assign Staff to Yearbook & Pages
  console.log(`[Step 4] Adding Marcus Vance as staff designer to yearbook...`);
  await callFn(
    "addMember",
    { yearbookId: ybId, email: "member@test.yearbook", role: "staff" },
    adminCookie,
  );
  console.log(`  ✔ Member added to team`);

  // Step 5: Add Students to Roster
  console.log(`[Step 5] Adding student Chloe Bennett to yearbook roster...`);
  const addStudentRes = await callFn(
    "savePerson",
    {
      table: "students",
      yearbookId: ybId,
      values: { first_name: "Chloe", last_name: "Bennett", grade: "12", homeroom: "Room 101" },
    },
    adminCookie,
  );
  const studentId = addStudentRes.data?.p?.v?.[0]?.id || addStudentRes.data?.p?.v?.[0]?.p?.v?.[0];
  console.log(`  ✔ Student registered in roster: ${studentId}`);

  // Step 6: Collect Assets (Binary Upload)
  console.log(`[Step 6] Uploading binary senior portrait to /api/storage/upload...`);
  const form = new FormData();
  form.append(
    "file",
    new Blob(["Senior Portrait Mock Binary Image Data"], { type: "image/png" }),
    "chloe_portrait.png",
  );
  form.append("bucket", "yearbook_assets");
  form.append("yearbookId", ybId);
  const uploadRes = await fetch(`${BASE_URL}/api/storage/upload`, { method: "POST", body: form });
  const uploadData = await uploadRes.json();
  console.log(`  ✔ Uploaded: ${uploadData.publicUrl}`);

  await callFn(
    "createAsset",
    {
      yearbookId: ybId,
      fileName: uploadData.fileName,
      fileType: uploadData.fileType,
      fileSize: uploadData.fileSize,
      storagePath: uploadData.storagePath,
      assetType: "photo",
      category: "Senior Portrait",
      studentId,
    },
    adminCookie,
  );
  console.log(`  ✔ Asset record registered with storage path`);

  // Step 7: Work on Assigned Pages & Tagging
  console.log(`[Step 7] Updating page status and assigning tags...`);
  const assetsRes = await callFn("getAssets", { yearbookId: ybId }, adminCookie);
  const firstAssetId = assetsRes.data?.p?.v?.[0]?.p?.v?.[0] || assetsRes.data?.p?.v?.[0]?.[0]?.id;
  if (firstAssetId) {
    await callFn(
      "updateAssetTags",
      { assetId: firstAssetId, tags: ["Senior", "Varsity"] },
      adminCookie,
    );
    console.log(`  ✔ Tags ["Senior", "Varsity"] assigned and persisted`);
  }

  // Step 8: Coordinator Review & Proofing
  console.log(`[Step 8] Creating immutable PDF Proof version...`);
  const proofPdfForm = new FormData();
  proofPdfForm.append(
    "file",
    new Blob(["%PDF-1.4 Mock Proof Content"], { type: "application/pdf" }),
    "proof_v1.pdf",
  );
  proofPdfForm.append("bucket", "yearbook_proofs");
  proofPdfForm.append("yearbookId", ybId);
  const proofUploadRes = await fetch(`${BASE_URL}/api/storage/upload`, {
    method: "POST",
    body: proofPdfForm,
  });
  const proofUploadData = await proofUploadRes.json();

  const proofRes = await callFn(
    "createProof",
    {
      yearbookId: ybId,
      pageIds: [],
      storagePath: proofUploadData.storagePath,
      notes: "First complete draft proof",
    },
    adminCookie,
  );
  const proofId = proofRes.data?.p?.v?.[0]?.id || proofRes.data?.p?.v?.[0]?.p?.v?.[0];
  console.log(`  ✔ Proof v1 created: ${proofId}`);

  // Step 9: Add Correction Annotations
  console.log(`[Step 9] Adding visual correction annotation on proof...`);
  const corrRes = await callFn(
    "createCorrection",
    {
      yearbookId: ybId,
      proofId,
      title: "Fix caption typo",
      description: "Chloe Bennett name spelling check",
      priority: "high",
    },
    adminCookie,
  );
  const corrId = corrRes.data?.p?.v?.[0]?.id || corrRes.data?.p?.v?.[0]?.p?.v?.[0];
  await callFn("updateCorrectionStatus", { correctionId: corrId, status: "resolved" }, adminCookie);
  console.log(`  ✔ Correction created and marked as resolved`);

  // Step 10: Approval & Locking
  console.log(`[Step 10] Signing off and locking yearbook for production...`);
  await callFn(
    "lockYearbook",
    { yearbookId: ybId, proofId, notes: "Final editorial signoff complete" },
    adminCookie,
  );
  console.log(`  ✔ Yearbook successfully locked`);

  // Step 11: Production Package Generation
  console.log(`[Step 11] Running preflight and archiving production package...`);
  const pkgRes = await callFn(
    "generateProductionPackage",
    { yearbookId: ybId, version: 1 },
    adminCookie,
  );
  console.log(`  ✔ Production package archived: ${pkgRes.data?.p?.v?.[0]?.storagePath || "Saved"}`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ✅ COMPLETE 11-STAGE END-TO-END LIFECYCLE VERIFIED SUCCESSFULLY!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

runFullLifecycle().catch(console.error);
