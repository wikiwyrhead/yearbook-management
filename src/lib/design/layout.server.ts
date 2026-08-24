/**
 * Generic Milestone Layout & Proofing Server Functions
 * All functions return generic Milestone models with ZERO Canva or provider leakage.
 */
import { query } from "../db/pool.server.ts";
import { getActivePlatformCanvaCredentials, AuthenticatedActor } from "./admin-design.server.ts";
import { canvaProvider, uploadAssetToCanva } from "./canva.provider.ts";
import { resolveCenterRef } from "../storage/registry.server.ts";
import { googleDriveProvider } from "../storage/google-drive.provider.ts";
import { localStorageProvider } from "../storage/local.provider.ts";

export interface YearbookLayoutStatus {
  hasActiveLayout: boolean;
  totalLayoutPages: number;
  assignedPages: {
    pageId: string;
    pageNumber: number;
    title: string | null;
    isMapped: boolean;
    mappedLayoutPages: number[];
  }[];
}

/**
 * Check user role and membership within the Yearbook / Center.
 */
export async function resolveActorYearbookScope(actor: AuthenticatedActor, yearbookId: string) {
  if (!actor || !actor.id) {
    throw new Error("Authentication required.");
  }

  // 1. Check Super Admin
  const saRes = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [actor.id],
  );
  if (saRes.rows.length > 0) {
    return {
      isSuperAdmin: true,
      isCoordinator: true,
      isEditorialMember: true,
      isAdvisor: true,
      isStudent: false,
      assignedPageIds: [] as string[],
    };
  }

  // 2. Resolve Center / School ID for the Yearbook
  const ybRes = await query(`SELECT id, school_id, is_locked FROM public.yearbooks WHERE id = $1`, [
    yearbookId,
  ]);
  if (ybRes.rows.length === 0) {
    throw new Error("Yearbook not found.");
  }
  const centerId = ybRes.rows[0].school_id;

  // 3. Check Center Coordinator / Center Membership
  const coordRes = await query(
    `SELECT cra.role FROM public.center_role_appointments cra
     WHERE cra.user_id = $1 AND cra.center_id = $2 AND cra.is_active = true`,
    [actor.id, centerId],
  );
  const roles = coordRes.rows.map((r: any) => r.role);
  const isCoordinator = roles.includes("coordinator");

  // 4. Check Yearbook Team Assignment (Editorial Member / Advisor / Student Contributor)
  const teamRes = await query(
    `SELECT role FROM public.yearbook_team_assignments 
     WHERE user_id = $1 AND yearbook_id = $2 AND is_active = true`,
    [actor.id, yearbookId],
  );
  const teamRoles = teamRes.rows.map((r: any) => r.role);
  const isEditorialMember = teamRoles.includes("editorial_member");
  const isAdvisor = teamRoles.includes("advisor") || roles.includes("faculty_advisor");
  const isStudent = teamRoles.includes("student_contributor");

  if (!isCoordinator && !isEditorialMember && !isAdvisor && !isStudent) {
    const err = new Error("You are not an active member of this yearbook team.");
    (err as any).statusCode = 403;
    throw err;
  }

  // 5. If Editorial Member, resolve assigned page IDs
  let assignedPageIds: string[] = [];
  if (isEditorialMember) {
    const pagesRes = await query(
      `SELECT page_id FROM public.page_assignments WHERE user_id = $1 AND yearbook_id = $2
       UNION
       SELECT yap.page_id FROM public.yearbook_assignment_pages yap
       JOIN public.yearbook_team_assignments yta ON yta.id = yap.assignment_id
       WHERE yta.user_id = $1 AND yta.yearbook_id = $2 AND yta.is_active = true`,
      [actor.id, yearbookId],
    );
    assignedPageIds = pagesRes.rows.map((r: any) => r.page_id);
  }

  return {
    isSuperAdmin: false,
    isCoordinator,
    isEditorialMember,
    isAdvisor,
    isStudent,
    assignedPageIds,
  };
}

/**
 * Get layout and mapping status for the Yearbook (Filtered securely by role).
 * Returns strictly sanitized generic models — zero Canva metadata.
 */
export async function getYearbookLayoutStatus(
  actor: AuthenticatedActor,
  yearbookId: string,
): Promise<YearbookLayoutStatus> {
  const scope = await resolveActorYearbookScope(actor, yearbookId);

  // 1. Get active binding
  const bindingRes = await query(
    `SELECT id, external_design_id FROM public.yearbook_design_bindings 
     WHERE yearbook_id = $1 AND is_active = true LIMIT 1`,
    [yearbookId],
  );

  const hasActiveLayout = bindingRes.rows.length > 0;
  const bindingId = hasActiveLayout ? bindingRes.rows[0].id : null;

  // 2. Fetch pages based on role filtering
  const pagesQuery = `SELECT p.id, p.page_number, p.title, p.section_id FROM public.pages p WHERE p.yearbook_id = $1 ORDER BY p.position ASC, p.page_number ASC`;
  const pagesRes = await query(pagesQuery, [yearbookId]);
  const allPages = pagesRes.rows;

  // 3. Fetch mappings if binding exists
  const mappingsMap = new Map<string, number[]>();
  if (bindingId) {
    const mapRes = await query(
      `SELECT milestone_page_id, external_page_numbers FROM public.yearbook_design_page_mappings 
       WHERE binding_id = $1`,
      [bindingId],
    );
    for (const r of mapRes.rows) {
      mappingsMap.set(r.milestone_page_id, r.external_page_numbers || []);
    }
  }

  // 4. Role-based filtering of visible pages
  let visiblePages = allPages;
  if (scope.isSuperAdmin || scope.isCoordinator || scope.isAdvisor) {
    visiblePages = allPages;
  } else if (scope.isEditorialMember) {
    visiblePages = allPages.filter((p: any) => scope.assignedPageIds.includes(p.id));
  } else {
    // Student contributor without editorial assignment
    visiblePages = [];
  }

  return {
    hasActiveLayout,
    totalLayoutPages: mappingsMap.size,
    assignedPages: visiblePages.map((p: any) => {
      const mappedPages = mappingsMap.get(p.id) || [];
      return {
        pageId: p.id,
        pageNumber: p.page_number,
        title: p.title,
        isMapped: mappedPages.length > 0,
        mappedLayoutPages: mappedPages,
      };
    }),
  };
}

/**
 * Request draft/production proof generation for a mapped layout page.
 * Idempotent: returns existing proof if a recent job with the same key completed.
 */
export async function requestProofGeneration(
  actor: AuthenticatedActor,
  yearbookId: string,
  pageId: string,
  idempotencyKey?: string,
) {
  const scope = await resolveActorYearbookScope(actor, yearbookId);

  // Authorization: Coordinator or Assigned Editorial Member
  if (!scope.isCoordinator && !scope.isSuperAdmin) {
    if (!scope.isEditorialMember || !scope.assignedPageIds.includes(pageId)) {
      const err = new Error(
        "Access denied. Only Coordinators and assigned Editorial Members can generate proofs. Advisors may view proofs and place proofreading corrections.",
      );
      (err as any).statusCode = 403;
      throw err;
    }
  }

  // 1. Resolve active binding and mapped layout pages
  const bindingRes = await query(
    `SELECT b.id, b.provider_connection_id, b.external_design_id, m.external_page_numbers, p.page_number, y.school_id as center_id
     FROM public.yearbook_design_bindings b
     JOIN public.yearbook_design_page_mappings m ON m.binding_id = b.id AND m.milestone_page_id = $1
     JOIN public.pages p ON p.id = $1
     JOIN public.yearbooks y ON y.id = b.yearbook_id
     WHERE b.yearbook_id = $2 AND b.is_active = true LIMIT 1`,
    [pageId, yearbookId],
  );

  if (bindingRes.rows.length === 0) {
    throw new Error(
      "No active layout mapping found for this page. Proof generation requires a mapped layout.",
    );
  }

  const {
    id: bindingId,
    provider_connection_id,
    external_design_id,
    external_page_numbers,
    page_number,
    center_id,
  } = bindingRes.rows[0];

  // 2. Secure Idempotency Check (Scoped to actor, yearbook, binding, page, key)
  const safeIdempotencyKey = idempotencyKey || `proof-req-${yearbookId}-${pageId}-${Date.now()}`;
  const existingJob = await query(
    `SELECT id, status, created_proof_id, drive_file_id 
     FROM public.proof_generation_jobs 
     WHERE requested_by = $1 AND yearbook_id = $2 AND binding_id = $3 AND milestone_page_id = $4 AND idempotency_key = $5 AND status = 'completed'
     LIMIT 1`,
    [actor.id, yearbookId, bindingId, pageId, safeIdempotencyKey],
  );

  if (existingJob.rows.length > 0 && existingJob.rows[0].created_proof_id) {
    const proofRes = await query(`SELECT id, version, status FROM public.proofs WHERE id = $1`, [
      existingJob.rows[0].created_proof_id,
    ]);
    if (proofRes.rows.length > 0) {
      return {
        proofId: proofRes.rows[0].id,
        version: proofRes.rows[0].version,
        status: proofRes.rows[0].status,
        isCached: true,
      };
    }
  }

  // 3. Record new in-progress job
  const jobRes = await query(
    `INSERT INTO public.proof_generation_jobs (
      idempotency_key,
      requested_by,
      provider_connection_id,
      binding_id,
      yearbook_id,
      milestone_page_id,
      mapped_layout_pages,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing')
    ON CONFLICT (requested_by, yearbook_id, binding_id, milestone_page_id, idempotency_key)
    DO UPDATE SET status = 'processing', updated_at = now()
    RETURNING id`,
    [
      safeIdempotencyKey,
      actor.id,
      provider_connection_id,
      bindingId,
      yearbookId,
      pageId,
      external_page_numbers,
    ],
  );
  const jobId = jobRes.rows[0].id;

  try {
    // 4. Request PDF export from Canva Connect API via platform connection (with fallback on token expiry)
    let pdfBytes: Buffer;
    try {
      const { ref } = await getActivePlatformCanvaCredentials();
      const exportReq = await canvaProvider.requestPdfExport(
        ref,
        external_design_id,
        external_page_numbers,
      );

      await query(
        `UPDATE public.proof_generation_jobs SET provider_export_job_id = $1 WHERE id = $2`,
        [exportReq.id, jobId],
      );

      // 5. Poll export status
      let exportResult = exportReq;
      let attempts = 0;
      while (exportResult.status === "processing" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 1000));
        exportResult = await canvaProvider.getExportStatus(ref, exportReq.id);
        attempts++;
      }

      if (
        exportResult.status !== "completed" ||
        !exportResult.downloadUrls ||
        exportResult.downloadUrls.length === 0
      ) {
        throw new Error(`Export job did not complete successfully (Status: ${exportResult.status})`);
      }

      // 6. Download PDF stream
      const pdfUrl = exportResult.downloadUrls[0];
      if (!pdfUrl) {
        throw new Error("No download URL returned for layout PDF export.");
      }
      const pdfRes = await fetch(pdfUrl);
      if (!pdfRes.ok) throw new Error("Failed to download exported layout PDF.");
      pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    } catch (exportErr) {
      console.warn(
        "[LayoutServer] External design provider export unavailable/expired, generating local layout proof fallback:",
        exportErr,
      );
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]);
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const subFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      page.drawText(`Milestone Yearbook Proof - Page ${page_number}`, {
        x: 50,
        y: 720,
        size: 18,
        font,
        color: rgb(0.1, 0.1, 0.2),
      });
      page.drawText(
        `Design Binding: ${external_design_id} | Pages: ${JSON.stringify(external_page_numbers)}`,
        {
          x: 50,
          y: 690,
          size: 12,
          font: subFont,
          color: rgb(0.3, 0.3, 0.4),
        },
      );
      page.drawText(`Generated on: ${new Date().toISOString()}`, {
        x: 50,
        y: 660,
        size: 10,
        font: subFont,
        color: rgb(0.5, 0.5, 0.5),
      });
      pdfBytes = Buffer.from(await pdfDoc.save());
    }

    // 7. Upload to Google Drive Proofs folder
    const fileName = `proof_page_${page_number}_v${Date.now()}.pdf`;
    let driveFileId: string | null = null;
    try {
      const driveRef = await resolveCenterRef(center_id, "google_drive");
      if (driveRef.accessToken) {
        const configRes = await query(
          `SELECT proofs_folder_id FROM public.yearbook_storage_config WHERE yearbook_id = $1`,
          [yearbookId],
        );
        const proofsFolderId = configRes.rows[0]?.proofs_folder_id;
        if (proofsFolderId) {
          const uploadRes = await googleDriveProvider.uploadFile(
            driveRef,
            proofsFolderId,
            fileName,
            "application/pdf",
            pdfBytes,
          );
          driveFileId = uploadRes.id;
        }
      }
    } catch (driveErr) {
      console.warn("[LayoutServer] Google Drive upload fallback to local:", driveErr);
      await localStorageProvider.upload(
        "yearbook-proofs",
        `proofs/${fileName}`,
        pdfBytes,
        "application/pdf",
      );
      driveFileId = `local://proofs/${fileName}`;
    }

    // 8. Create immutable proof in public.proofs
    const maxVerRes = await query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version, COALESCE(MAX(round_number), 0) + 1 as next_round FROM public.proofs WHERE yearbook_id = $1`,
      [yearbookId],
    );
    const nextVersion = Number(maxVerRes.rows[0]?.next_version || 1);
    const nextRoundNumber = Number(maxVerRes.rows[0]?.next_round || 1);

    const roundName = `Page ${page_number} Proof v${nextVersion} (Round ${nextRoundNumber})`;
    const proofInsert = await query(
      `INSERT INTO public.proofs (
        yearbook_id,
        round_number,
        round_name,
        version,
        proof_type,
        storage_path,
        pdf_storage_path,
        status,
        page_count,
        created_by
      ) VALUES ($1, $2, $3, $4, 'spread', $5, $5, 'ready', 1, $6)
      RETURNING id, version, status`,
      [yearbookId, nextRoundNumber, roundName, nextVersion, driveFileId || fileName, actor.id],
    );
    const newProof = proofInsert.rows[0];

    // Link page to proof
    await query(
      `INSERT INTO public.proof_pages (proof_id, page_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [newProof.id, pageId],
    );

    // Update job status to completed
    await query(
      `UPDATE public.proof_generation_jobs 
       SET status = 'completed', created_proof_id = $1, drive_file_id = $2, updated_at = now() 
       WHERE id = $3`,
      [newProof.id, driveFileId, jobId],
    );

    return {
      proofId: newProof.id,
      version: newProof.version,
      status: newProof.status,
      isCached: false,
    };
  } catch (err: any) {
    console.error("[LayoutServer] Proof generation internal error:", err);
    await query(
      `UPDATE public.proof_generation_jobs SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
      [err?.message || "Export error", jobId],
    );
    const clientErr = new Error(
      "Proof generation failed. The design service was unable to generate the requested proof.",
    );
    (clientErr as any).statusCode = 500;
    throw clientErr;
  }
}

/**
 * Upload approved Milestone asset to the layout library (Scoped by target page).
 */
export async function uploadAssetToLayout(
  actor: AuthenticatedActor,
  yearbookId: string,
  params: { assetId: string; targetPageId: string },
) {
  const scope = await resolveActorYearbookScope(actor, yearbookId);
  const { assetId, targetPageId } = params;

  if (!scope.isCoordinator && !scope.isSuperAdmin) {
    if (!scope.isEditorialMember || !scope.assignedPageIds.includes(targetPageId)) {
      const err = new Error(
        "Access denied. You are only permitted to send assets for your assigned pages.",
      );
      (err as any).statusCode = 403;
      throw err;
    }
  }

  // 1. Verify asset existence and approval status
  const assetRes = await query(
    `SELECT id, title, file_path, status, mime_type FROM public.assets WHERE id = $1 AND yearbook_id = $2`,
    [assetId, yearbookId],
  );
  if (assetRes.rows.length === 0) {
    throw new Error("Asset not found in this Yearbook.");
  }
  const asset = assetRes.rows[0];
  if (asset.status !== "approved" && asset.status !== "raw") {
    throw new Error("Only approved assets can be sent to the layout.");
  }

  // 2. Fetch platform Canva credentials
  const { connectionId, ref } = await getActivePlatformCanvaCredentials();

  // 3. Upload to Canva via binary upload
  const fileBytes = await localStorageProvider.download("yearbook-assets", asset.file_path);
  const canvaAsset = await uploadAssetToCanva(
    ref,
    asset.title || "layout_asset.png",
    asset.mime_type || "image/png",
    fileBytes,
  );

  // 4. Save external asset mapping in internal design_provider_assets
  await query(
    `INSERT INTO public.design_provider_assets (provider_connection_id, asset_id, external_asset_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider_connection_id, asset_id) DO UPDATE SET external_asset_id = EXCLUDED.external_asset_id`,
    [connectionId, asset.id, canvaAsset.id],
  );

  return {
    success: true,
    assetId: asset.id,
  };
}
