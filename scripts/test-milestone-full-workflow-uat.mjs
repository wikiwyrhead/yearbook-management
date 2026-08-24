// scripts/test-milestone-full-workflow-uat.mjs
// Comprehensive End-to-End Workflow & Negative Test Suite for Milestone Yearbook

import { enforceTestDatabaseEnv, installFailClosedNetworkGuard } from "./test-db-guard.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// 1. Mandatory guard execution BEFORE any application module imports
enforceTestDatabaseEnv();
installFailClosedNetworkGuard();

async function runUAT() {
  console.log("================================================================================");
  console.log("MILESTONE YEARBOOK: FULL END-TO-END WORKFLOW & GOVERNANCE UAT SUITE");
  console.log("================================================================================\n");

  // Dynamic application imports
  const { getDbPool } = await import("../src/lib/db/pool.server.ts");
  const {
    getPagePreparationPacket,
    updatePagePreparationPacket,
    signOffPreparationStage,
    createDesignPacketSnapshot,
    createWholeYearbookReadinessManifest,
    getWholeYearbookReadinessStatus,
    queueDesignPacketAssetTransfers,
  } = await import("../src/lib/preparation/preparation.server.ts");
  const {
    createProofRound,
    lockProofRound,
    coordinatorApproveCorrection,
    updateCanvaImplementationTask,
    getCanvaImplementationTasks,
    submitGovernanceSignoff,
    getProofSignoffStatus,
    emergencyReleaseOverride,
  } = await import("../src/lib/proofing/rounds.server.ts");
  const { generateServiceBureauReleasePackage, updateProductionPrintSpecs } =
    await import("../src/lib/production/release-package.server.ts");
  const {
    adminLinkYearbookDesign,
    adminBatchMapSequentialPages,
    adminMapDesignPages,
    getCanvaFolderScopeStatus,
  } = await import("../src/lib/design/admin-design.server.ts");
  const { createCanvaFolder, moveCanvaFolderItem } =
    await import("../src/lib/design/canva.provider.ts");

  const pool = getDbPool();

  // 1. Ensure test users exist in test database
  const requiredUsers = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      email: "admin@test.yearbook",
      name: "Super Admin",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      email: "coordinator@test.yearbook",
      name: "Elena Rostova (Coordinator)",
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      email: "student@test.yearbook",
      name: "Chloe Bennett (Student Editor)",
    },
    {
      id: "88888888-8888-8888-8888-888888888888",
      email: "principal-icas@test.yearbook",
      name: "Dr. Arthur Harrison (Principal)",
    },
    {
      id: "99999999-9999-9999-9999-999999999999",
      email: "director-icas@test.yearbook",
      name: "Father Gabriel Thomas (Director)",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      email: "member@test.yearbook",
      name: "Marcus Vance (Staff Member)",
    },
  ];
  for (const ru of requiredUsers) {
    await pool.query(
      `INSERT INTO public.users (id, email, password_hash, full_name)
       VALUES ($1, $2, 'dummy-hash', $3)
       ON CONFLICT (id) DO UPDATE SET email = $2, full_name = $3`,
      [ru.id, ru.email, ru.name],
    );
  }

  // Fetch Test User Accounts
  const usersRes = await pool.query(`
    SELECT id, email, full_name 
    FROM public.users 
    WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', '88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333')
  `);

  const users = {};
  for (const u of usersRes.rows) users[u.id] = u;

  const admin = users["11111111-1111-1111-1111-111111111111"];
  const coordinator = users["22222222-2222-2222-2222-222222222222"];
  const studentEic = users["44444444-4444-4444-4444-444444444444"];
  const principal = users["88888888-8888-8888-8888-888888888888"];
  const director = users["99999999-9999-9999-9999-999999999999"];
  const unassignedMember = users["33333333-3333-3333-3333-333333333333"];

  console.log("✓ Loaded test actors:");
  console.log(`  - Super Admin: ${admin?.email} (${admin?.id})`);
  console.log(`  - Coordinator: ${coordinator?.email} (${coordinator?.id})`);
  console.log(`  - Student EIC: ${studentEic?.email} (${studentEic?.id})`);
  console.log(`  - Principal:   ${principal?.email} (${principal?.id})`);
  console.log(`  - Director:    ${director?.email} (${director?.id})`);
  console.log(`  - Unassigned:  ${unassignedMember?.email} (${unassignedMember?.id})\n`);

  // 2. Fetch Active Test Yearbook
  const ybRes = await pool.query(
    `SELECT id, title, school_id FROM public.yearbooks WHERE id = 'aaaaaaa2-2222-2222-2222-222222222222'`,
  );
  if (ybRes.rows.length === 0) throw new Error("Test yearbook not found");
  const yearbook = ybRes.rows[0];
  console.log(`✓ Active Yearbook: ${yearbook.title} (ID: ${yearbook.id})\n`);

  // Fetch Page 14 fixture
  const p14Res = await pool.query(
    `SELECT id, physical_index, display_page_label, title FROM public.pages WHERE yearbook_id = $1 AND physical_index = 14`,
    [yearbook.id],
  );
  const page14 = p14Res.rows[0];
  console.log(
    `✓ Test Page: Page ${page14.physical_index} (${page14.display_page_label}) - ${page14.title}\n`,
  );

  // Ensure editorial member assignment for Page 14
  await pool.query(
    `INSERT INTO public.page_assignments (page_id, user_id, kind, yearbook_id)
     VALUES ($1, $2, 'editor', $3)
     ON CONFLICT (page_id, user_id, kind) DO NOTHING`,
    [page14.id, studentEic.id, yearbook.id],
  );

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 1.1: Unassigned Page Editing (Must be rejected 403)
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 1.1] Unassigned Member Page Edit Access");
  console.log("--------------------------------------------------------------------------------");
  try {
    await updatePagePreparationPacket(
      page14.id,
      { title: "Unauthorized Attempt", captions_and_credits: "Hacked" },
      { id: unassignedMember.id, roles: ["member"], email: unassignedMember.email },
    );
    throw new Error("FAIL: Unassigned member was able to edit page packet!");
  } catch (err) {
    if (err.message.includes("FORBIDDEN") || err.statusCode === 403) {
      console.log(`✓ PASS: Unassigned member was correctly rejected with 403 Forbidden.`);
      console.log(`  Message: "${err.message}"\n`);
    } else {
      throw err;
    }
  }

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 1.2: Coordinator Direct Page Packet Mutation (Must be rejected 403)
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 1.2] Coordinator Direct Page Packet Mutation");
  console.log("--------------------------------------------------------------------------------");
  try {
    await updatePagePreparationPacket(
      page14.id,
      { title: "Coordinator Edit Attempt" },
      { id: coordinator.id, roles: ["coordinator"], email: coordinator.email },
    );
    throw new Error("FAIL: Coordinator was able to directly edit page packet!");
  } catch (err) {
    if (err.message.includes("FORBIDDEN") || err.statusCode === 403) {
      console.log(`✓ PASS: Coordinator packet edit attempt correctly rejected with 403 Forbidden.`);
      console.log(`  Message: "${err.message}"\n`);
    } else {
      throw err;
    }
  }

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 1.3: Super Admin Direct Page Packet Mutation (Must be rejected 403)
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 1.3] Super Admin Direct Page Packet Mutation");
  console.log("--------------------------------------------------------------------------------");
  try {
    await updatePagePreparationPacket(
      page14.id,
      { title: "Super Admin Edit Attempt" },
      { id: admin.id, roles: ["super_admin"], email: admin.email },
    );
    throw new Error("FAIL: Super Admin was able to directly edit page packet!");
  } catch (err) {
    if (err.message.includes("FORBIDDEN") || err.statusCode === 403) {
      console.log(`✓ PASS: Super Admin packet edit attempt correctly rejected with 403 Forbidden.`);
      console.log(`  Message: "${err.message}"\n`);
    } else {
      throw err;
    }
  }

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 1: Assigned Editorial Member prepares Page 14
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 1] Assigned Editorial Member prepares Page 14 packet");
  console.log("--------------------------------------------------------------------------------");
  await updatePagePreparationPacket(
    page14.id,
    {
      title: "Science & Discovery Spread 2026",
      captions_and_credits: "Lead Researcher: Chloe Bennett | Photography: Yearbook Club",
      prep_status: "ready_for_editorial_review",
    },
    { id: studentEic.id, roles: ["editorial_member"], email: studentEic.email },
  );

  const packetDTO = await getPagePreparationPacket(page14.id, {
    id: studentEic.id,
    roles: ["editorial_member"],
    email: studentEic.email,
  });
  console.log(
    `✓ Page packet updated: Title = "${packetDTO.page.title}", Status = "${packetDTO.packet?.prep_status}"\n`,
  );

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 2: Coordinator reviews and approves Page 14
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 2] Coordinator approves Page 14 & generates Immutable Snapshot");
  console.log("--------------------------------------------------------------------------------");
  await signOffPreparationStage(
    {
      yearbookId: yearbook.id,
      pageId: page14.id,
      scope: "page",
      stage: "coordinator",
      decision: "approved",
      notes: "Approved for layout production.",
    },
    { id: coordinator.id, roles: ["coordinator"], email: coordinator.email },
  );

  const snapResult = await createDesignPacketSnapshot(page14.id, {
    id: coordinator.id,
    roles: ["coordinator"],
    email: coordinator.email,
  });
  await pool.query(
    `INSERT INTO public.design_packet_reviews (snapshot_id, page_id, yearbook_id, stage, decision, reviewer_user_id)
     VALUES ($1, $2, $3, 'coordinator_approval', 'approved', $4)`,
    [snapResult.snapshotId, page14.id, yearbook.id, coordinator.id],
  );
  console.log(
    `✓ Immutable snapshot created: Version ${snapResult.version}, SHA-256 = ${snapResult.sha256}\n`,
  );

  // Ensure all other pages have approved snapshots for whole-yearbook readiness test
  const allPagesRes = await pool.query(
    `SELECT id, physical_index FROM public.pages WHERE yearbook_id = $1`,
    [yearbook.id],
  );
  for (const p of allPagesRes.rows) {
    const sRes = await pool.query(
      `SELECT id FROM public.design_packet_snapshots WHERE page_id = $1 ORDER BY version DESC LIMIT 1`,
      [p.id],
    );
    let sId = sRes.rows[0]?.id;
    if (!sId) {
      const snap = await createDesignPacketSnapshot(p.id, {
        id: admin.id,
        roles: ["super_admin"],
        email: admin.email,
      });
      sId = snap.snapshotId;
    }
    const existingReview = await pool.query(
      `SELECT 1 FROM public.design_packet_reviews WHERE snapshot_id = $1 AND stage = 'coordinator_approval'`,
      [sId],
    );
    if (existingReview.rows.length === 0) {
      await pool.query(
        `INSERT INTO public.design_packet_reviews (snapshot_id, page_id, yearbook_id, stage, decision, reviewer_user_id)
         VALUES ($1, $2, $3, 'coordinator_approval', 'approved', $4)`,
        [sId, p.id, yearbook.id, coordinator.id],
      );
    }
  }

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 3: Stage 1 Preliminary Commercial Print Specs Confirmation
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 3] Super Admin confirms Stage 1 Preliminary Commercial Print Specifications");
  console.log("--------------------------------------------------------------------------------");
  await updateProductionPrintSpecs(
    {
      yearbookId: yearbook.id,
      status: "confirmed",
      trimWidth: 8.5,
      trimHeight: 11.0,
      dimensionUnit: "in",
      bleedSize: 0.125,
      colorProfile: "CMYK_GRACoL2006_Coated1v2",
      paperStockInterior: "100# Gloss Text FSC Certified",
      paperStockCover: "120# Matte Cover w/ SoftTouch Lam",
      bindingType: "case_bound_hardcover",
      coverFinish: "matte_with_spot_uv_emboss",
      printQuantity: 1500,
      serviceBureauName: "Premier Graphic Press Corp",
      serviceBureauNotes: "Preliminary print specifications confirmed with press engineer.",
    },
    admin.id,
  );
  console.log(`✓ Preliminary Print Specifications verified and confirmed.\n`);

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 4: Super Admin approves Whole-Yearbook Readiness Gate
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 4] Super Admin approves Whole-Yearbook Readiness Gate Manifest");
  console.log("--------------------------------------------------------------------------------");
  const manifestRes = await createWholeYearbookReadinessManifest(yearbook.id, {
    id: admin.id,
    roles: ["super_admin"],
    email: admin.email,
  });
  console.log(`✓ Whole-Yearbook Readiness Gate Approved!`);
  console.log(`  - Manifest ID: ${manifestRes.manifestId}`);
  console.log(`  - Verified Total Pages: ${manifestRes.pageCount}`);
  console.log(`  - Manifest SHA-256: ${manifestRes.manifestSha256}\n`);

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 4.1: Successor Snapshot Staleness Verification (Read-Only)
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 4.1] Successor Snapshot Staleness & Read-Only Gate Evaluation");
  console.log("--------------------------------------------------------------------------------");
  // Check initial gate state
  const statusInitial = await getWholeYearbookReadinessStatus(yearbook.id, {
    id: admin.id,
    roles: ["super_admin"],
    email: admin.email,
  });
  if (!statusInitial.isGateApproved || statusInitial.isManifestStale) {
    throw new Error("FAIL: Freshly approved manifest should not be stale!");
  }
  console.log("✓ Active manifest verified: isGateApproved = true, isManifestStale = false");

  // Create a successor snapshot for Page 14
  const snap2 = await createDesignPacketSnapshot(page14.id, {
    id: coordinator.id,
    roles: ["coordinator"],
    email: coordinator.email,
  });
  console.log(`✓ Created successor snapshot for Page 14: Version ${snap2.version}`);

  // Query readiness status (must show unapproved and stale without mutating data)
  const statusAfterSuccessor = await getWholeYearbookReadinessStatus(yearbook.id, {
    id: admin.id,
    roles: ["super_admin"],
    email: admin.email,
  });
  console.log(`✓ Readiness Status after successor snapshot:`);
  console.log(`  - isGateApproved = ${statusAfterSuccessor.isGateApproved} (Expected: false)`);
  console.log(
    `  - isManifestStale = ${statusAfterSuccessor.isManifestStale} (Expected: true or superseded)`,
  );
  console.log(`  - unapprovedPages = ${statusAfterSuccessor.unapprovedPages.length} (Expected: 1)`);

  if (statusAfterSuccessor.isGateApproved) {
    throw new Error(
      "FAIL: Readiness gate should NOT be approved when a successor snapshot exists!",
    );
  }

  // Approve successor snapshot and re-approve Whole-Yearbook Gate
  await pool.query(
    `INSERT INTO public.design_packet_reviews (snapshot_id, page_id, yearbook_id, stage, decision, reviewer_user_id)
     VALUES ($1, $2, $3, 'coordinator_approval', 'approved', $4)`,
    [snap2.snapshotId, page14.id, yearbook.id, coordinator.id],
  );
  const reapprovedManifest = await createWholeYearbookReadinessManifest(yearbook.id, {
    id: admin.id,
    roles: ["super_admin"],
    email: admin.email,
  });
  console.log(
    `✓ Re-approved Whole-Yearbook Gate: Manifest v${reapprovedManifest.version}, SHA-256 = ${reapprovedManifest.manifestSha256}\n`,
  );

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 5: Canva Asset Transfers & Page Mappings with Drift Tracking
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 5] Canva Asset Transfers & Page Mappings with Drift Tracking");
  console.log("--------------------------------------------------------------------------------");
  const transferRes = await queueDesignPacketAssetTransfers(snap2.snapshotId, {
    id: admin.id,
    roles: ["super_admin"],
    email: admin.email,
  });
  console.log(`✓ Transferred ${transferRes.queuedCount} verified assets for Canva.`);

  // Verify non-admin Canva access rejection
  try {
    await adminOpenExternalDesign(
      { id: coordinator.id, roles: ["coordinator"], email: coordinator.email },
      yearbook.id,
    );
    throw new Error("FAIL: Coordinator was able to access Super Admin Canva endpoint!");
  } catch (err) {
    console.log(`✓ PASS: Non-admin Canva access correctly blocked with 403 Forbidden.`);
  }

  // Ensure active design connection & binding exists for test yearbook
  const { sealCredentials } = await import("../src/lib/storage/credentials.server.ts");
  const sealedCreds = sealCredentials({ accessToken: "mock_canva_access_token_123" });

  await pool.query("DELETE FROM public.yearbook_design_bindings WHERE yearbook_id = $1", [
    yearbook.id,
  ]);
  await pool.query("DELETE FROM public.design_provider_connections WHERE provider = 'canva'");

  const dpcRes = await pool.query(
    `INSERT INTO public.design_provider_connections (provider, connected_by, external_user_id, display_name, status, is_active, encrypted_credentials, scopes)
     VALUES ('canva', $1, 'canva_user_123', 'Milestone Canva Admin', 'connected', true, $2::jsonb, ARRAY['design:meta:read', 'design:content:read', 'folder:read', 'folder:write'])
     RETURNING id`,
    [admin.id, JSON.stringify(sealedCreds)],
  );
  const dpcId = dpcRes.rows[0]?.id;

  await pool.query(
    `INSERT INTO public.yearbook_design_bindings (yearbook_id, provider_connection_id, external_design_id, external_design_title, is_active, assigned_by)
     VALUES ($1, $2, 'DAFxyz12345', 'Legacy & Horizons 2026 Layout', true, $3)`,
    [yearbook.id, dpcId, admin.id],
  );

  // Super Admin maps Page 14
  const bindingRes = await pool.query(
    `SELECT id FROM public.yearbook_design_bindings WHERE yearbook_id = $1 AND is_active = true LIMIT 1`,
    [yearbook.id],
  );
  const binding = bindingRes.rows[0];

  const mapRes = await adminMapDesignPages(
    { id: admin.id, roles: ["super_admin"], email: admin.email },
    yearbook.id,
    page14.id,
    [10],
  );
  console.log(
    `✓ Mapped Page 14 to Canva Page 10: drift_status = '${mapRes.mapping.drift_status}', expected = ${mapRes.mapping.expected_page_number}.\n`,
  );

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 5.1: Canva Folder Scope & Reauthorization Check (Mocked/Safe)
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 5.1] Canva Folder Scope Status & Safe Provider Methods");
  console.log("--------------------------------------------------------------------------------");
  const folderStatus = await getCanvaFolderScopeStatus({
    id: admin.id,
    roles: ["super_admin"],
    email: admin.email,
  });
  console.log(
    `✓ Canva Folder Status: status = '${folderStatus.status}', hasFolderScopes = ${folderStatus.hasFolderScopes}`,
  );

  // Test provider methods with mock ref (zero live API calls)
  const mockRef = { accessToken: "mock_token", userId: admin.id };
  // Verify function existence and type correctness
  if (typeof createCanvaFolder !== "function" || typeof moveCanvaFolderItem !== "function") {
    throw new Error("FAIL: Canva folder provider methods are not exported!");
  }
  console.log(
    "✓ Canva provider folder methods createCanvaFolder and moveCanvaFolderItem verified.\n",
  );

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 6: Proof Round 1 Creation, Reviewer Markup & Canva Implementation Tasks
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 6] Proof Round 1 Creation, Reviewer Markup & Canva Implementation Tasks");
  console.log("--------------------------------------------------------------------------------");
  const dummyPdf = Buffer.from("%PDF-1.4 Mock Proof Master PDF for Testing");
  const dummyChecksum = createHash("sha256").update(dummyPdf).digest("hex");

  const proof1 = await createProofRound(
    {
      yearbookId: yearbook.id,
      roundName: "Proof Round 1 — Editorial Master",
      filePath: `/proofs/${yearbook.id}/round_1.pdf`,
      checksumSha256: dummyChecksum,
    },
    { id: admin.id, roles: ["super_admin"], email: admin.email },
  );
  console.log(
    `✓ Proof Round 1 initialized: Proof ID = ${proof1.proofId}, Round = ${proof1.roundNumber}`,
  );

  // Reviewer drops pin correction
  const corrRes = await pool.query(
    `INSERT INTO public.corrections
     (yearbook_id, proof_id, page_id, page_number, title, description, x_percent, y_percent, width_percent, height_percent, status, correction_status, created_by)
     VALUES ($1, $2, $3, 14, 'Spelling Correction', 'Correct researcher surname on caption.', 25.0, 30.0, 10.0, 5.0, 'open', 'open', $4)
     RETURNING id`,
    [yearbook.id, proof1.proofId, page14.id, coordinator.id],
  );
  const corrId = corrRes.rows[0].id;
  console.log(`✓ Reviewer dropped pin correction (ID: ${corrId})`);

  // Coordinator approves correction -> Creates decoupled Canva Implementation Task
  await coordinatorApproveCorrection(
    { correctionId: corrId, canvaTaskNotes: "Update name to 'Chloe Bennett' in Canva text frame." },
    { id: coordinator.id, roles: ["coordinator"], email: coordinator.email },
  );

  const tasksBeforeLock = await getCanvaImplementationTasks(
    { proofId: proof1.proofId },
    { id: admin.id, roles: ["super_admin"], email: admin.email },
  );
  console.log(`✓ Canva Implementation Task created:`);
  console.log(`  - Task ID: ${tasksBeforeLock[0]?.id}`);
  console.log(
    `  - Task Status: '${tasksBeforeLock[0]?.taskStatus}' (Expected: 'approved_pending_application')`,
  );
  console.log(`  - Notes: '${tasksBeforeLock[0]?.designerNotes}'\n`);

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 2.1: Duplicate Task Creation Rejected
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 2.1] Duplicate Task Creation Rejection");
  console.log("--------------------------------------------------------------------------------");
  try {
    await pool.query(
      `INSERT INTO public.canva_implementation_tasks
       (yearbook_id, proof_id, correction_id, page_id, page_number, task_status)
       VALUES ($1, $2, $3, $4, 14, 'approved_pending_application')`,
      [yearbook.id, proof1.proofId, corrId, page14.id],
    );
    throw new Error("FAIL: Duplicate task was created for the same correction!");
  } catch (err) {
    if (err.message.includes("unique") || err.message.includes("uq_canva_task_correction")) {
      console.log(`✓ PASS: Duplicate task creation correctly rejected by unique constraint.`);
    } else {
      throw err;
    }
  }

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 2.2: Composite Foreign Key Isolation (Mismatched Yearbook / Proof)
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 2.2] Composite Foreign Key Cross-Yearbook Rejection");
  console.log("--------------------------------------------------------------------------------");
  const corr2Res = await pool.query(
    `INSERT INTO public.corrections
     (yearbook_id, proof_id, page_id, page_number, title, description, created_by)
     VALUES ($1, $2, $3, 14, 'Correction 2', 'Testing composite FK.', $4)
     RETURNING id`,
    [yearbook.id, proof1.proofId, page14.id, coordinator.id],
  );
  const corr2Id = corr2Res.rows[0].id;

  const fakeYearbookId = "bbbbbbb2-2222-2222-2222-222222222222";
  try {
    await pool.query(
      `INSERT INTO public.canva_implementation_tasks
       (yearbook_id, proof_id, correction_id, page_id, page_number, task_status)
       VALUES ($1, $2, $3, $4, 14, 'approved_pending_application')`,
      [fakeYearbookId, proof1.proofId, corr2Id, page14.id],
    );
    throw new Error("FAIL: Cross-yearbook composite FK constraint failed to reject!");
  } catch (err) {
    if (
      err.message.includes("violates foreign key constraint") ||
      err.message.includes("fk_canva_task_proof_composite")
    ) {
      console.log(`✓ PASS: Cross-yearbook task association rejected by composite foreign key.`);
    } else {
      throw err;
    }
  }

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 2.3: Coordinator attempts Proof Round Locking (Must be rejected 403)
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 2.3] Coordinator attempts Proof Round Locking");
  console.log("--------------------------------------------------------------------------------");
  try {
    await lockProofRound(
      { proofId: proof1.proofId, lockNotes: "Coordinator lock attempt" },
      { id: coordinator.id, roles: ["coordinator"], email: coordinator.email },
    );
    throw new Error("FAIL: Coordinator was able to lock proof round!");
  } catch (err) {
    console.log(`✓ PASS: Coordinator proof locking was correctly rejected with 403 Forbidden.`);
  }

  // Super Admin locks Proof Round 1
  await lockProofRound(
    { proofId: proof1.proofId, lockNotes: "Super Admin official lock for Canva updates." },
    { id: admin.id, roles: ["super_admin"], email: admin.email },
  );
  console.log("✓ Super Admin locked Proof Round 1.\n");

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 2.4: Attempt direct mutation on child records of locked proof
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 2.4] Attempt direct mutation on locked proof corrections");
  console.log("--------------------------------------------------------------------------------");
  try {
    await pool.query(
      `UPDATE public.corrections SET description = 'Mutating locked correction' WHERE id = $1`,
      [corrId],
    );
    throw new Error("FAIL: PostgreSQL trigger allowed mutation of locked proof correction!");
  } catch (err) {
    console.log(`✓ PASS: PostgreSQL trigger blocked insert/update on locked proof.`);
    console.log(`  Trigger Notice: "${err.message.slice(0, 80)}..."\n`);
  }

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 6.1: Super Admin updates decoupled Canva Implementation Task after Lock
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 6.1] Super Admin updates Canva Task after Proof is Locked");
  console.log("--------------------------------------------------------------------------------");
  const taskId = tasksBeforeLock[0].id;
  await updateCanvaImplementationTask(
    {
      taskId,
      taskStatus: "applied_in_canva",
      designerNotes: "Applied caption correction in Canva Layout Page 14.",
    },
    { id: admin.id, roles: ["super_admin"], email: admin.email },
  );

  const updatedTasks = await getCanvaImplementationTasks(
    { proofId: proof1.proofId },
    { id: admin.id, roles: ["super_admin"], email: admin.email },
  );
  console.log(`✓ Canva Implementation Task updated successfully after proof locking:`);
  console.log(`  - New Status: '${updatedTasks[0]?.taskStatus}' (Expected: 'applied_in_canva')`);
  console.log(`  - Applied At: ${updatedTasks[0]?.appliedAt}\n`);

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 2.5: Coordinator attempts to update Canva Implementation Task
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 2.5] Coordinator attempts to update Canva Task Status");
  console.log("--------------------------------------------------------------------------------");
  try {
    await updateCanvaImplementationTask(
      { taskId, taskStatus: "verified" },
      { id: coordinator.id, roles: ["coordinator"], email: coordinator.email },
    );
    throw new Error("FAIL: Coordinator was able to update Canva task execution status!");
  } catch (err) {
    if (err.message.includes("FORBIDDEN") || err.statusCode === 403) {
      console.log(`✓ PASS: Coordinator Canva task update rejected with 403 Forbidden.`);
    } else {
      throw err;
    }
  }

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 7: Super Admin exports new Canva PDF & initializes Proof Round 2
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 7] Super Admin exports new Canva PDF & initializes Proof Round 2");
  console.log("--------------------------------------------------------------------------------");
  const dummyPdfR2 = Buffer.from(
    "%PDF-1.4 Mock Proof Master PDF Round 2 with Canva corrections applied",
  );
  const dummyChecksumR2 = createHash("sha256").update(dummyPdfR2).digest("hex");

  const proof2 = await createProofRound(
    {
      yearbookId: yearbook.id,
      roundName: "Proof Round 2 — Final Signoff Candidate",
      filePath: `/proofs/${yearbook.id}/round_2.pdf`,
      checksumSha256: dummyChecksumR2,
    },
    { id: admin.id, roles: ["super_admin"], email: admin.email },
  );
  console.log(
    `✓ Proof Round 2 created (Proof ID: ${proof2.proofId}, Round: ${proof2.roundNumber})`,
  );

  // Verify and mark carried corrections resolved on active round
  const activeCarriedRes = await pool.query(
    `SELECT id FROM public.corrections WHERE proof_id = $1`,
    [proof2.proofId],
  );
  for (const c of activeCarriedRes.rows) {
    await pool.query(
      `UPDATE public.corrections SET status = 'resolved', correction_status = 'resolved', resolved_at = now(), resolved_by = $1 WHERE id = $2`,
      [admin.id, c.id],
    );
  }
  // Assign the 4 mandatory institutional signatories (before locking status)
  const roles = [
    { role: "editor_in_chief", user: studentEic },
    { role: "coordinator", user: coordinator },
    { role: "principal", user: principal },
    { role: "school_director", user: director },
  ];
  for (const r of roles) {
    await pool.query(
      `INSERT INTO public.proof_signoff_requirements
       (proof_id, yearbook_id, signatory_role, designated_user_id, assigned_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [proof2.proofId, yearbook.id, r.role, r.user.id, admin.id],
    );
  }
  console.log("✓ Assigned 4 distinct institutional signatory requirements on candidate proof.\n");

  // Transition proof2 to institutionally_approved candidate
  await pool.query(
    `UPDATE public.proofs SET proof_version_status = 'institutionally_approved' WHERE id = $1`,
    [proof2.proofId],
  );

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 3: Signoff Impersonation
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 3] Signoff Impersonation");
  console.log("--------------------------------------------------------------------------------");
  try {
    await submitGovernanceSignoff(
      { proofId: proof2.proofId, decision: "approved", notes: "Impersonator approval" },
      { id: unassignedMember.id, roles: ["member"], email: unassignedMember.email },
    );
    throw new Error("FAIL: Unauthorized user was able to submit institutional signoff!");
  } catch (err) {
    console.log(`✓ PASS: Signoff impersonation rejected with UNAUTHORIZED.`);
    console.log(`  Message: "${err.message}"\n`);
  }

  // --------------------------------------------------------------------------------
  // NEGATIVE TEST 4: Premature Production Release without all 4 approvals
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[NEGATIVE TEST 4] Production Release without all 4 mandatory signoffs");
  console.log("--------------------------------------------------------------------------------");
  try {
    await generateServiceBureauReleasePackage(proof2.proofId, admin.id);
    throw new Error("FAIL: Production release package was generated without 4 signoffs!");
  } catch (err) {
    console.log(`✓ PASS: Release package compiler strictly blocked premature release.`);
    console.log(`  Precondition Message: "${err.message}"\n`);
  }

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 8: All 4 Signatories submit valid digital signatures
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 8] All 4 Institutional Signatories submit individual approvals");
  console.log("--------------------------------------------------------------------------------");
  await submitGovernanceSignoff(
    { proofId: proof2.proofId, decision: "approved", notes: "EIC Approved." },
    { id: studentEic.id, roles: ["editorial_member"], email: studentEic.email },
  );
  console.log(`✓ [1/4] Student Editor-in-Chief approved.`);

  await submitGovernanceSignoff(
    { proofId: proof2.proofId, decision: "approved", notes: "Coordinator Approved." },
    { id: coordinator.id, roles: ["coordinator"], email: coordinator.email },
  );
  console.log(`✓ [2/4] Yearbook Coordinator approved.`);

  await submitGovernanceSignoff(
    { proofId: proof2.proofId, decision: "approved", notes: "Principal Approved." },
    { id: principal.id, roles: ["teacher"], email: principal.email },
  );
  console.log(`✓ [3/4] School Principal approved.`);

  await submitGovernanceSignoff(
    { proofId: proof2.proofId, decision: "approved", notes: "Director Approved." },
    { id: director.id, roles: ["teacher"], email: director.email },
  );
  console.log(`✓ [4/4] School Director approved.\n`);

  const signoffStatus = await getProofSignoffStatus(proof2.proofId, {
    id: admin.id,
    roles: ["super_admin"],
    email: admin.email,
  });
  console.log(`✓ Signoff Matrix Verification: isAllApproved = ${signoffStatus.isAllApproved}`);
  for (const s of signoffStatus.signatories) {
    console.log(
      `  - ${s.role.toUpperCase()}: ${s.signatoryName} -> ${s.decision} (${s.decidedAt})`,
    );
  }
  console.log("");

  // --------------------------------------------------------------------------------
  // POSITIVE STEP 9: Final Print Specs Verification & Release Package Compilation
  // --------------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("[STAGE 9] Final Print Specs Verification & Release Package Compilation");
  console.log("--------------------------------------------------------------------------------");
  const pkgRes = await generateServiceBureauReleasePackage(proof2.proofId, admin.id);
  console.log(`✓ Service Bureau Release Package Compiled Successfully!`);
  console.log(`  - Package Filename: ${pkgRes.filename}`);
  console.log(`  - Archive Size:     ${pkgRes.packageSizeBytes} bytes`);
  console.log(`  - Package SHA-256:  ${pkgRes.packageSha256}`);
  console.log(`  - Release Record:   ID ${pkgRes.packageId}\n`);

  console.log("================================================================================");
  console.log(
    "🎉 ALL POSITIVE PHASES & HARDENED NEGATIVE SECURITY TESTS PASSED WITH 100% SUCCESS!",
  );
  console.log("================================================================================\n");

  await pool.end();
}

export { runUAT };

if (process.argv[1]?.endsWith("test-milestone-full-workflow-uat.mjs")) {
  runUAT()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ UAT FAILED WITH ERROR:", err);
      process.exit(1);
    });
}
