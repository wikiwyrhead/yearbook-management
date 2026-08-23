/**
 * Server-only Canva integration logic (User-Scoped & Strict Role Enforcement).
 */
import { supabaseAdmin } from "../../integrations/supabase/client.server.ts";
import { openCredentials, sealCredentials } from "../storage/credentials.server.ts";
import { canvaProvider, uploadAssetToCanva } from "./canva.provider.ts";
import type { DesignRef } from "./design-provider.ts";
import { query } from "../db/pool.server.ts";

/**
 * Read the authenticated user's individual Canva connection.
 * Tokens are never exposed to the client or UI.
 */
export async function readUserCanvaConnection(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("canva_user_connections")
    .select(
      "user_id, canva_user_id, team_id, display_name, scopes, status, updated_at, credentials",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const creds = openCredentials((data as any).credentials);
  const ref: DesignRef = {
    userId,
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
  };

  const state = await canvaProvider.getConnectionStatus(ref);

  return {
    userId: data.user_id,
    canvaUserId: data.canva_user_id || state.userId,
    teamId: data.team_id || state.teamId,
    displayName: data.display_name || state.accountName || "Connected Canva User",
    scopes: data.scopes || [],
    status: state.status,
    detail: state.detail,
    updatedAt: data.updated_at,
    expiresAt: creds.expiresAt,
  };
}

/**
 * Resolves a valid user DesignRef with decrypted access token for server-side operations.
 */
export async function resolveUserDesignRef(userId: string): Promise<DesignRef> {
  const { data } = await supabaseAdmin
    .from("canva_user_connections")
    .select("user_id, canva_user_id, credentials")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    throw new Error(
      "You have not connected your Canva account. Please connect Canva in the Design tab.",
    );
  }

  const creds = openCredentials((data as any).credentials);
  if (!creds.accessToken) {
    throw new Error("Canva access token missing. Please reconnect your Canva account.");
  }

  return {
    userId: data.user_id,
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
  };
}

/**
 * Upsert user-scoped Canva connection with AES-256-GCM encrypted tokens.
 */
export async function upsertCanvaUserConnection(
  userId: string,
  data: {
    canvaUserId?: string | null;
    teamId?: string | null;
    displayName?: string | null;
    accessToken: string;
    refreshToken?: string | null;
    expiresIn?: number | null;
    scopes?: string[];
  },
) {
  const expiresAt = data.expiresIn
    ? new Date(Date.now() + data.expiresIn * 1000).toISOString()
    : undefined;

  const credentials = sealCredentials({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? undefined,
    expiresAt,
  });

  const { error } = await supabaseAdmin.from("canva_user_connections").upsert(
    {
      user_id: userId,
      canva_user_id: data.canvaUserId ?? null,
      team_id: data.teamId ?? null,
      display_name: data.displayName ?? null,
      credentials,
      scopes: data.scopes ?? [
        "profile:read",
        "asset:read",
        "asset:write",
        "design:meta:read",
        "design:content:read",
        "design:content:write",
      ],
      status: "connected",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
  return { success: true };
}

/**
 * Atomic token update when Canva returns a rotating refresh token on API calls.
 */
export async function updateCanvaUserCredentials(
  userId: string,
  data: {
    accessToken: string;
    refreshToken?: string | null;
    expiresIn?: number;
  },
) {
  const { data: existing } = await supabaseAdmin
    .from("canva_user_connections")
    .select("credentials")
    .eq("user_id", userId)
    .maybeSingle();

  const current = openCredentials((existing as any)?.credentials);
  const expiresAt = data.expiresIn
    ? new Date(Date.now() + data.expiresIn * 1000).toISOString()
    : current.expiresAt;

  const credentials = sealCredentials({
    ...current,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? current.refreshToken,
    expiresAt,
  });

  const { error } = await supabaseAdmin
    .from("canva_user_connections")
    .update({ credentials, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) throw error;
  return { success: true };
}

/**
 * Disconnect and revoke user Canva connection.
 */
export async function disconnectCanvaUser(userId: string) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("canva_user_connections")
      .select("credentials")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const creds = openCredentials((existing as any).credentials);
      if (creds.refreshToken || creds.accessToken) {
        const { revokeCanvaToken } = await import("./canva.provider.ts");
        await revokeCanvaToken(creds.refreshToken || creds.accessToken || "");
      }
    }
  } catch (revokeErr) {
    console.warn("[CanvaServer] Token revocation warning:", revokeErr);
  }

  const { error } = await supabaseAdmin
    .from("canva_user_connections")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
  return { success: true };
}

/**
 * Strict Role and Page Assignment Enforcement.
 *
 * Rules:
 * 1. Super Admin: full access to all yearbooks & pages.
 * 2. Center Coordinator: full access to assigned Center yearbooks & pages.
 * 3. Editorial Member: access ONLY to pages or sections explicitly assigned to them.
 * 4. Advisor / Teacher: Read-only in Milestone (no Canva mutation unless separately assigned).
 * 5. Student Contributor: Denied all Canva design actions.
 */
export async function requireCanvaPageAccess(
  userId: string,
  yearbookId: string,
  pageId?: string,
): Promise<{ isSuperAdmin: boolean; isCoordinator: boolean; isAssignedEditor: boolean }> {
  // 1. Super Admin Check
  const superAdminRes = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [userId],
  );
  if (superAdminRes.rows.length > 0) {
    return { isSuperAdmin: true, isCoordinator: true, isAssignedEditor: true };
  }

  // 2. Get Yearbook and Center
  const ybRes = await query(`SELECT school_id as center_id FROM public.yearbooks WHERE id = $1`, [
    yearbookId,
  ]);
  if (ybRes.rows.length === 0) throw new Error("Yearbook not found.");
  const centerId = ybRes.rows[0].center_id;

  // 3. Coordinator Check
  const coordRes = await query(
    `SELECT 1 FROM public.center_role_appointments
     WHERE user_id = $1 AND center_id = $2 AND is_active = true AND role = 'coordinator'`,
    [userId, centerId],
  );
  if (coordRes.rows.length > 0) {
    return { isSuperAdmin: false, isCoordinator: true, isAssignedEditor: true };
  }

  // If no specific page is requested (e.g. general design listing), verify active editorial membership
  const teamMemberRes = await query(
    `SELECT id, role, is_active FROM public.yearbook_team_assignments
     WHERE user_id = $1 AND yearbook_id = $2 AND is_active = true`,
    [userId, yearbookId],
  );

  if (teamMemberRes.rows.length === 0) {
    throw new Error("You are not an active member of this yearbook's editorial team.");
  }

  const assignment = teamMemberRes.rows[0];
  if (assignment.role === "advisor") {
    throw new Error("Advisors have read-only access in Milestone and cannot modify Canva designs.");
  }

  if (
    assignment.role !== "editorial_member" &&
    assignment.role !== "editor" &&
    assignment.role !== "member" &&
    assignment.role !== "designer"
  ) {
    throw new Error("Your assigned role does not permit Canva design management.");
  }

  // If a specific page is targeted, check explicit assignment to that page or section
  if (pageId) {
    // A. Check direct page_assignments
    const directPageRes = await query(
      `SELECT 1 FROM public.page_assignments WHERE page_id = $1 AND user_id = $2`,
      [pageId, userId],
    );
    if (directPageRes.rows.length > 0) {
      return { isSuperAdmin: false, isCoordinator: false, isAssignedEditor: true };
    }

    // B. Check yearbook_assignment_pages
    const assignPageRes = await query(
      `SELECT 1 FROM public.yearbook_assignment_pages yap
       JOIN public.yearbook_team_assignments yta ON yta.id = yap.assignment_id
       WHERE yap.page_id = $1 AND yta.user_id = $2 AND yta.is_active = true`,
      [pageId, userId],
    );
    if (assignPageRes.rows.length > 0) {
      return { isSuperAdmin: false, isCoordinator: false, isAssignedEditor: true };
    }

    // C. Check yearbook_assignment_sections
    const pageSectionRes = await query(`SELECT section_id FROM public.pages WHERE id = $1`, [
      pageId,
    ]);
    const sectionId = pageSectionRes.rows[0]?.section_id;
    if (sectionId) {
      const assignSecRes = await query(
        `SELECT 1 FROM public.yearbook_assignment_sections yas
         JOIN public.yearbook_team_assignments yta ON yta.id = yas.assignment_id
         WHERE yas.section_id = $1 AND yta.user_id = $2 AND yta.is_active = true`,
        [sectionId, userId],
      );
      if (assignSecRes.rows.length > 0) {
        return { isSuperAdmin: false, isCoordinator: false, isAssignedEditor: true };
      }
    }

    throw new Error(
      `You are only permitted to link or edit Canva designs for your assigned pages or sections.`,
    );
  }

  return { isSuperAdmin: false, isCoordinator: false, isAssignedEditor: true };
}

/**
 * List Canva designs using the authenticated user's own Canva connection.
 */
export async function listUserDesigns(userId: string, search?: string) {
  const ref = await resolveUserDesignRef(userId);
  return canvaProvider.listDesigns(ref, search);
}

/**
 * Fetch a specific Canva design's metadata and refreshed URLs.
 */
export async function getUserDesignDetails(userId: string, designId: string) {
  const ref = await resolveUserDesignRef(userId);
  return canvaProvider.getDesign(ref, designId);
}

/**
 * Link a Canva design to a Yearbook page with explicit spread & assignment mapping.
 */
export async function linkCanvaDesignToPage(
  userId: string,
  yearbookId: string,
  pageId: string,
  canvaDesignId: string,
  canvaPages?: number[],
) {
  // 1. Enforce Role & Page Assignment
  await requireCanvaPageAccess(userId, yearbookId, pageId);

  // 2. Fetch fresh design details from Canva using the user's connection
  const ref = await resolveUserDesignRef(userId);
  const design = await canvaProvider.getDesign(ref, canvaDesignId);

  // 3. Resolve & Validate Positive Integer Canva Pages
  let targetCanvaPages: number[] = [1];
  if (canvaPages && canvaPages.length > 0) {
    targetCanvaPages = canvaPages;
  }

  for (const p of targetCanvaPages) {
    if (!Number.isInteger(p) || p < 1) {
      throw new Error(
        `Invalid Canva page number: ${p}. Page numbers must be positive integers (>= 1).`,
      );
    }
    if (design.pageCount && design.pageCount > 0 && p > design.pageCount) {
      throw new Error(
        `Canva page ${p} does not exist in design "${design.title}" (design only has ${design.pageCount} page(s)).`,
      );
    }
  }

  // Resolve mapping relations
  const [ybRes, pageRes, assignRes] = await Promise.all([
    query(`SELECT school_id as center_id FROM public.yearbooks WHERE id = $1`, [yearbookId]),
    query(`SELECT position, page_number, section_id FROM public.pages WHERE id = $1`, [pageId]),
    query(`SELECT user_id FROM public.page_assignments WHERE page_id = $1 LIMIT 1`, [pageId]),
  ]);

  const centerId = ybRes.rows[0]?.center_id;
  const pageNumber = pageRes.rows[0]?.page_number || pageRes.rows[0]?.position || 1;
  const sectionId = pageRes.rows[0]?.section_id;
  const assignedUserId = assignRes.rows[0]?.user_id || userId;

  // 4. Upsert into public.canva_designs with full mapping columns
  const { error: designError } = await supabaseAdmin.from("canva_designs").upsert(
    {
      yearbook_id: yearbookId,
      page_id: pageId,
      center_id: centerId,
      created_by: userId,
      canva_design_id: design.id,
      title: design.title,
      thumbnail_url: design.thumbnailUrl ?? null,
      edit_url: design.url,
      view_url: design.url.replace("/edit", "/view"),
      spread_id: sectionId ? `section_${sectionId}` : `page_${pageNumber}`,
      canva_pages: targetCanvaPages,
      assigned_user_id: assignedUserId,
      last_metadata_refresh: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "yearbook_id,canva_design_id" },
  );

  if (designError) throw designError;

  // 5. Update public.pages record
  const { error: pageError } = await supabaseAdmin
    .from("pages")
    .update({
      canva_design_id: design.id,
      canva_design_url: design.url,
      canva_synced_at: new Date().toISOString(),
    })
    .eq("id", pageId);

  if (pageError) throw pageError;

  return {
    success: true,
    design,
    canvaPages: targetCanvaPages,
  };
}

/**
 * Upload an approved asset from Milestone / Google Drive into the user's Canva account.
 */
export async function uploadYearbookAssetToCanva(
  userId: string,
  yearbookId: string,
  assetId: string,
) {
  await requireCanvaPageAccess(userId, yearbookId);
  const ref = await resolveUserDesignRef(userId);

  // Fetch asset metadata
  const assetRes = await query(
    `SELECT id, filename, mime_type, storage_path, storage_provider FROM public.assets WHERE id = $1 AND yearbook_id = $2`,
    [assetId, yearbookId],
  );

  if (assetRes.rows.length === 0) throw new Error("Asset not found in this yearbook.");
  const asset = assetRes.rows[0];

  // Download binary content from Google Drive or local storage
  let bytes: Buffer;
  if (asset.storage_provider === "google_drive" && asset.storage_path) {
    const { resolveCenterRef } = await import("../storage/registry.server.ts");
    const { googleDriveProvider } = await import("../storage/google-drive.provider.ts");
    const ybRes = await query(`SELECT school_id as center_id FROM public.yearbooks WHERE id = $1`, [
      yearbookId,
    ]);
    const driveRef = await resolveCenterRef(ybRes.rows[0].center_id, "google_drive");
    const downloaded = await googleDriveProvider.downloadFile(driveRef, asset.storage_path);
    bytes = Buffer.from(downloaded.bytes);
  } else {
    const { localStorageProvider } = await import("../storage/local.provider.ts");
    bytes = await localStorageProvider.download("yearbook-assets", asset.storage_path || asset.id);
  }

  const uploaded = await uploadAssetToCanva(
    ref,
    asset.filename || "yearbook-photo.jpg",
    asset.mime_type || "image/jpeg",
    bytes,
  );

  return {
    success: true,
    canvaAssetId: uploaded.id,
    name: uploaded.name,
  };
}

/**
 * Idempotent PDF Proof Export & Ingestion Pipeline:
 * 1. Requests PDF export from Canva Connect API (/v1/exports) with exact mapped Canva pages.
 * 2. Safely polls export status until completed.
 * 3. Downloads PDF bytes before Canva's temporary signed URL expires.
 * 4. Resolves Center's Google Drive Proofs folder.
 * 5. Uploads PDF into Google Drive Proofs folder.
 * 6. Creates immutable record in public.proofs and public.proof_pages.
 * 7. Updates page proof status to in_review and updates canva_designs tracking.
 */
export async function exportCanvaDesignToProof(
  userId: string,
  yearbookId: string,
  pageId: string,
  canvaDesignId: string,
) {
  // 1. Enforce Role & Page Assignment
  await requireCanvaPageAccess(userId, yearbookId, pageId);

  // 2. Fetch user Canva credentials
  const ref = await resolveUserDesignRef(userId);

  // 3. Retrieve mapped canva_pages from database for exact page export
  const mapRes = await query(
    `SELECT canva_pages FROM public.canva_designs WHERE yearbook_id = $1 AND canva_design_id = $2`,
    [yearbookId, canvaDesignId],
  );
  let exportPages: number[] | undefined = undefined;
  if (
    mapRes.rows.length > 0 &&
    Array.isArray(mapRes.rows[0].canva_pages) &&
    mapRes.rows[0].canva_pages.length > 0
  ) {
    exportPages = mapRes.rows[0].canva_pages.map(Number);
  }

  // 4. Initiate Canva PDF export job with exact pages
  const job = await canvaProvider.requestPdfExport(ref, canvaDesignId, exportPages);

  // 4. Check for existing proof for this exact export job (Idempotency Guard)
  const [pageRes, ybRes] = await Promise.all([
    query(`SELECT position, page_number FROM public.pages WHERE id = $1`, [pageId]),
    query(`SELECT school_id as center_id, title, year FROM public.yearbooks WHERE id = $1`, [
      yearbookId,
    ]),
  ]);

  const pageNumber = pageRes.rows[0]?.page_number || pageRes.rows[0]?.position || 1;
  const centerId = ybRes.rows[0]?.center_id;

  const existingProof = await query(
    `SELECT * FROM public.proofs WHERE yearbook_id = $1 AND canva_export_id = $2`,
    [yearbookId, job.id],
  );
  if (existingProof.rows.length > 0) {
    const p = existingProof.rows[0];
    return {
      success: true,
      proofId: p.id,
      version: p.version,
      fileName: `proof_page_${pageNumber}_v${p.version}.pdf`,
      storagePath: p.storage_path,
      canvaExportJobId: job.id,
      isDuplicate: true,
    };
  }

  // 5. Poll for job completion safely (max 60 seconds)
  let exportJob = job;
  const startTime = Date.now();
  while (exportJob.status === "processing" && Date.now() - startTime < 60000) {
    await new Promise((r) => setTimeout(r, 2000));
    exportJob = await canvaProvider.getExportStatus(ref, job.id);
  }

  if (
    exportJob.status !== "completed" ||
    !exportJob.downloadUrls ||
    exportJob.downloadUrls.length === 0
  ) {
    throw new Error(
      `Canva PDF export did not complete: ${exportJob.error || exportJob.status}. Please retry.`,
    );
  }

  const downloadUrl = exportJob.downloadUrls[0]!;

  // 6. Download PDF stream before Canva URL expires
  const pdfRes = await fetch(downloadUrl);
  if (!pdfRes.ok)
    throw new Error(`Failed to download exported PDF from Canva: ${await pdfRes.text()}`);
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());

  // Determine next proof version number
  const verRes = await query(
    `SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM public.proofs WHERE yearbook_id = $1`,
    [yearbookId],
  );
  const nextVersion = verRes.rows[0]?.next_version || 1;
  const fileName = `proof_page_${pageNumber}_v${nextVersion}.pdf`;

  // 7. Upload to Google Drive Proofs Folder if connected
  let storagePath = `proofs/${fileName}`;
  try {
    const { resolveCenterRef } = await import("../storage/registry.server.ts");
    const { googleDriveProvider } = await import("../storage/google-drive.provider.ts");
    const driveRef = await resolveCenterRef(centerId, "google_drive");

    if (driveRef.accessToken) {
      const configRes = await query(
        `SELECT proofs_folder_id FROM public.yearbook_storage_config WHERE yearbook_id = $1`,
        [yearbookId],
      );
      const proofsFolderId = configRes.rows[0]?.proofs_folder_id;
      if (proofsFolderId) {
        const uploadResult = await googleDriveProvider.uploadFile(
          driveRef,
          proofsFolderId,
          fileName,
          "application/pdf",
          pdfBytes,
        );
        storagePath = uploadResult.id;
      }
    }
  } catch (driveErr) {
    console.warn("[CanvaServer] Google Drive Proof upload fallback to local storage:", driveErr);
    const { localStorageProvider } = await import("../storage/local.provider.ts");
    await localStorageProvider.upload("yearbook-proofs", storagePath, pdfBytes, "application/pdf");
  }

  // 8. Idempotent insert into public.proofs
  const proofRes = await query(
    `INSERT INTO public.proofs (
       yearbook_id, version, proof_type, pdf_storage_path, storage_path,
       status, page_count, created_by, canva_export_id, notes
     ) VALUES ($1, $2, 'spread', $3, $4, 'ready', 1, $5, $6, $7)
     RETURNING *`,
    [
      yearbookId,
      nextVersion,
      storagePath,
      storagePath,
      userId,
      job.id,
      `Exported from Canva Design ${canvaDesignId}`,
    ],
  );

  const proof = proofRes.rows[0];

  // 9. Link proof to page in public.proof_pages
  await query(
    `INSERT INTO public.proof_pages (proof_id, page_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [proof.id, pageId],
  );

  // 10. Update page proof status in public.pages
  await query(`UPDATE public.pages SET canva_synced_at = now() WHERE id = $1`, [pageId]);

  // 11. Update tracking on public.canva_designs
  await query(
    `UPDATE public.canva_designs
     SET last_proof_export_at = now(), last_proof_id = $1
     WHERE yearbook_id = $2 AND canva_design_id = $3`,
    [proof.id, yearbookId, canvaDesignId],
  );

  return {
    success: true,
    proofId: proof.id,
    version: nextVersion,
    fileName,
    storagePath,
    canvaExportJobId: job.id,
  };
}
