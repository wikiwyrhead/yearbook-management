import { query } from "../db/pool.server.ts";
import { getAuthenticatedActor } from "../preparation/preparation.server.ts";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Short-lived in-memory cache for generated PDF page slices
interface CachedSlice {
  pdfBuffer: Uint8Array;
  expiresAt: number;
}
const sliceCache = new Map<string, CachedSlice>();
const CACHE_TTL_MS = 60_000; // 1 minute

// Simple in-memory rate limiter: max 60 requests per minute per user
const userRequestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userRate = userRequestCounts.get(userId);
  if (!userRate || now > userRate.resetAt) {
    userRequestCounts.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (userRate.count >= 60) {
    return false;
  }
  userRate.count++;
  return true;
}

export function invalidateProofSliceCache(proofId?: string): void {
  if (!proofId) {
    sliceCache.clear();
    return;
  }
  for (const key of sliceCache.keys()) {
    if (key.startsWith(proofId)) {
      sliceCache.delete(key);
    }
  }
}

export interface UserProofAccessEvaluation {
  hasAccess: boolean;
  isWholeBook: boolean;
  authorizedPageNumbers: Set<number>;
  roleSummary: string;
}

/**
 * Evaluates whether a user is authorized to view a proof and whether access is whole-book or page-scoped.
 */
export async function evaluateUserProofAccess(
  userId: string,
  proofId: string,
): Promise<UserProofAccessEvaluation> {
  // 1. Fetch Proof & Yearbook metadata
  const proofRes = await query(
    `SELECT p.id as proof_id, p.yearbook_id, p.checksum_sha256, y.school_id as center_id
     FROM public.proofs p
     JOIN public.yearbooks y ON y.id = p.yearbook_id
     WHERE p.id = $1`,
    [proofId],
  );

  if (proofRes.rows.length === 0) {
    return {
      hasAccess: false,
      isWholeBook: false,
      authorizedPageNumbers: new Set(),
      roleSummary: "none",
    };
  }
  const { yearbook_id, center_id } = proofRes.rows[0];

  // 2. Check Super Admin
  const adminRes = await query(
    `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
    [userId],
  );
  if (adminRes.rows.length > 0) {
    return {
      hasAccess: true,
      isWholeBook: true,
      authorizedPageNumbers: new Set(),
      roleSummary: "super_admin",
    };
  }

  // 3. Verify user belongs to Center
  const centerMemberRes = await query(
    `SELECT 1 FROM public.center_memberships
     WHERE user_id = $1 AND center_id = $2 AND is_active = true`,
    [userId, center_id],
  );
  const isCenterMember = centerMemberRes.rows.length > 0;

  // 4. Check Center Coordinator via center_role_appointments (active, date-ranged)
  const coordRes = await query(
    `SELECT 1 FROM public.center_role_appointments
     WHERE user_id = $1
       AND center_id = $2
       AND role = 'coordinator'
       AND is_active = true
       AND start_date <= CURRENT_DATE
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
    [userId, center_id],
  );
  if (coordRes.rows.length > 0) {
    return {
      hasAccess: true,
      isWholeBook: true,
      authorizedPageNumbers: new Set(),
      roleSummary: "coordinator",
    };
  }

  // 4b. Check yearbook_members for coordinator role on this yearbook's center
  const ymCoordRes = await query(
    `SELECT 1 FROM public.yearbook_members
     WHERE user_id = $1 AND yearbook_id = $2 AND role = 'coordinator'`,
    [userId, yearbook_id],
  );
  if (ymCoordRes.rows.length > 0) {
    return {
      hasAccess: true,
      isWholeBook: true,
      authorizedPageNumbers: new Set(),
      roleSummary: "coordinator",
    };
  }

  // 5. Check Governance Signatories (proof_signoff_requirements covers EIC, Principal, School Director)
  const signoffRes = await query(
    `SELECT signatory_role FROM public.proof_signoff_requirements
     WHERE proof_id = $1 AND designated_user_id = $2 AND is_active = true`,
    [proofId, userId],
  );
  if (signoffRes.rows.length > 0) {
    return {
      hasAccess: true,
      isWholeBook: true,
      authorizedPageNumbers: new Set(),
      roleSummary: signoffRes.rows[0].signatory_role,
    };
  }

  // 6. Check EIC annual assignment via yearbook_members
  const eicRes = await query(
    `SELECT role FROM public.yearbook_members
     WHERE yearbook_id = $1 AND user_id = $2 AND role = 'editor_in_chief'`,
    [yearbook_id, userId],
  );
  if (eicRes.rows.length > 0) {
    return {
      hasAccess: true,
      isWholeBook: true,
      authorizedPageNumbers: new Set(),
      roleSummary: "editor_in_chief",
    };
  }

  // 6b. Check advisor/proofreader in yearbook_members (whole-book roles)
  const advisorRes = await query(
    `SELECT role FROM public.yearbook_members
     WHERE yearbook_id = $1 AND user_id = $2 AND role IN ('advisor', 'proofreader')`,
    [yearbook_id, userId],
  );
  if (advisorRes.rows.length > 0) {
    return {
      hasAccess: true,
      isWholeBook: true,
      authorizedPageNumbers: new Set(),
      roleSummary: advisorRes.rows[0].role,
    };
  }

  // 7. Check Scoped Reviewer Assignments & Page Assignments
  const authorizedPages = new Set<number>();

  // a. Assigned pages via yearbook_team_assignments + yearbook_assignment_pages
  const pageAssignRes = await query(
    `SELECT p.physical_index, p.page_number
     FROM public.yearbook_team_assignments ta
     JOIN public.yearbook_assignment_pages ap ON ap.assignment_id = ta.id AND ap.yearbook_id = ta.yearbook_id
     JOIN public.pages p ON p.id = ap.page_id
     WHERE ta.user_id = $1 AND ta.yearbook_id = $2 AND ta.is_active = true
       AND ta.start_date <= CURRENT_DATE
       AND (ta.end_date IS NULL OR ta.end_date >= CURRENT_DATE)`,
    [userId, yearbook_id],
  );
  for (const r of pageAssignRes.rows) {
    authorizedPages.add(r.physical_index || r.page_number);
  }

  // b. Assigned sections via yearbook_team_assignments + yearbook_assignment_sections
  const secAssignRes = await query(
    `SELECT p.physical_index, p.page_number
     FROM public.yearbook_team_assignments ta
     JOIN public.yearbook_assignment_sections as_sec ON as_sec.assignment_id = ta.id AND as_sec.yearbook_id = ta.yearbook_id
     JOIN public.pages p ON p.section_id = as_sec.section_id
     WHERE ta.user_id = $1 AND ta.yearbook_id = $2 AND ta.is_active = true
       AND ta.start_date <= CURRENT_DATE
       AND (ta.end_date IS NULL OR ta.end_date >= CURRENT_DATE)`,
    [userId, yearbook_id],
  );
  for (const r of secAssignRes.rows) {
    authorizedPages.add(r.physical_index || r.page_number);
  }

  // c. Proof Reviewer Assignments (Scoped grant via proof_reviewer_assignments)
  const revAssignRes = await query(
    `SELECT ra.scope, p.physical_index as page_num, sec_p.physical_index as sec_page_num
     FROM public.proof_reviewer_assignments ra
     LEFT JOIN public.pages p ON p.id = ra.target_page_id
     LEFT JOIN public.pages sec_p ON sec_p.section_id = ra.target_section_id
     WHERE ra.proof_id = $1 AND ra.user_id = $2 AND ra.revoked_at IS NULL`,
    [proofId, userId],
  );
  for (const r of revAssignRes.rows) {
    if (r.scope === "edition") {
      return {
        hasAccess: true,
        isWholeBook: true,
        authorizedPageNumbers: new Set(),
        roleSummary: "special_edition_reviewer",
      };
    }
    if (r.page_num) authorizedPages.add(r.page_num);
    if (r.sec_page_num) authorizedPages.add(r.sec_page_num);
  }

  // d. Active Proof Access Grants (approved special reviewer access)
  const grantRes = await query(
    `SELECT g.id, gp.page_id, p.physical_index as page_num, gs.section_id, sec_p.physical_index as sec_page_num
     FROM public.proof_access_grants g
     LEFT JOIN public.proof_access_grant_pages gp ON gp.grant_id = g.id
     LEFT JOIN public.pages p ON p.id = gp.page_id
     LEFT JOIN public.proof_access_grant_sections gs ON gs.grant_id = g.id
     LEFT JOIN public.pages sec_p ON sec_p.section_id = gs.section_id
     WHERE (g.proof_id = $1 OR g.yearbook_id = $2)
       AND g.user_id = $3
       AND g.starts_at <= now()
       AND g.expires_at >= now()
       AND g.revoked_at IS NULL`,
    [proofId, yearbook_id, userId],
  );
  for (const r of grantRes.rows) {
    if (r.page_num) authorizedPages.add(r.page_num);
    if (r.sec_page_num) authorizedPages.add(r.sec_page_num);
  }

  if (authorizedPages.size > 0) {
    return {
      hasAccess: true,
      isWholeBook: false,
      authorizedPageNumbers: authorizedPages,
      roleSummary: "scoped_reviewer",
    };
  }

  // Fallback: deny
  return {
    hasAccess: false,
    isWholeBook: false,
    authorizedPageNumbers: new Set(),
    roleSummary: isCenterMember ? "unassigned_center_member" : "cross_center",
  };
}

/**
 * Loads the source PDF binary from Google Drive storage (or local fallback).
 */
async function loadProofSourcePdfBinary(proofId: string): Promise<Buffer> {
  const objRes = await query(
    `SELECT pso.provider, pso.provider_file_id, pso.center_id, pso.checksum_sha256, csc.credentials, csc.status
     FROM public.proof_storage_objects pso
     LEFT JOIN public.center_storage_connections csc ON csc.center_id = pso.center_id AND csc.provider = pso.provider
     WHERE pso.proof_id = $1`,
    [proofId],
  );

  if (objRes.rows.length > 0) {
    const row = objRes.rows[0];
    if (row.provider === "google_drive" && row.provider_file_id && row.credentials) {
      try {
        const { googleDriveProvider } = await import("./google-drive.provider.ts");
        const { openCredentials } = await import("./credentials.server.ts");
        const credObj = typeof row.credentials === "string" ? JSON.parse(row.credentials) : row.credentials;
        const unsealed = openCredentials(credObj);
        if (unsealed.accessToken || unsealed.refreshToken) {
          const credRef = {
            provider: "google_drive" as const,
            scope: "center" as const,
            centerId: row.center_id,
            accessToken: unsealed.accessToken,
            refreshToken: unsealed.refreshToken,
            expiresAt: unsealed.expiresAt,
          };
          const downloaded = await googleDriveProvider.downloadFile(credRef, row.provider_file_id);
          if (downloaded.bytes && downloaded.bytes.byteLength > 0) {
            return Buffer.from(downloaded.bytes);
          }
        }
      } catch (gdriveErr) {
        console.warn("[ProofStream] Google Drive download fallback:", gdriveErr);
      }
    }
  }

  // Fallback to local cache/fixture
  const localFixturePath =
    process.env["ICAS_BLUEPRINT_PDF_PATH"] ||
    path.resolve(process.cwd(), ".localdev/fixtures/icas-138.pdf");
  try {
    return await fs.readFile(localFixturePath);
  } catch {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 138; i++) {
      doc.addPage([612, 792]);
    }
    const bytes = await doc.save();
    return Buffer.from(bytes);
  }
}

/**
 * Handler for GET /api/storage/proofs/:proofId/stream
 */
export async function handleProofStreamRequest(
  proofId: string,
  request: Request,
  trustedActor?: { id: string; email: string; fullName: string | null; roles: string[] },
): Promise<Response> {
  let actor = trustedActor;

  if (!actor) {
    // Derive identity exclusively from authenticated server session cookie
    const cookieHeader = request.headers.get("cookie");
    try {
      actor = await getAuthenticatedActor(cookieHeader);
    } catch {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Valid authentication session cookie required." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // Rate limiting check per authenticated user
  if (!checkRateLimit(actor.id)) {
    return new Response(JSON.stringify({ error: "Too Many Requests. Rate limit exceeded." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  // Authorization Evaluation
  const evalResult = await evaluateUserProofAccess(actor.id, proofId);
  if (!evalResult.hasAccess) {
    return new Response(
      JSON.stringify({
        error: "Forbidden. Access to this proof is denied.",
        role: evalResult.roleSummary,
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  const reqPage = pageParam ? parseInt(pageParam, 10) : null;
  const reqStart = startParam ? parseInt(startParam, 10) : null;
  const reqEnd = endParam ? parseInt(endParam, 10) : null;

  // Load Source PDF
  const sourcePdfBuffer = await loadProofSourcePdfBinary(proofId);

  // SCENARIO A: Whole-Book Authorized User
  if (evalResult.isWholeBook && !reqPage && !reqStart) {
    const totalBytes = sourcePdfBuffer.length;
    const rangeHeader = request.headers.get("range");

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0] || "0", 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalBytes - 1;

      if (isNaN(start) || start >= totalBytes || end >= totalBytes || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${totalBytes}` },
        });
      }

      const chunk = sourcePdfBuffer.subarray(start, end + 1);
      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Range": `bytes ${start}-${end}/${totalBytes}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.length),
          "Cache-Control": "private, no-cache",
        },
      });
    }

    return new Response(new Uint8Array(sourcePdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(totalBytes),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-cache",
      },
    });
  }

  // If user is page-scoped and did not specify a page or slice range, deny whole-book access
  if (!evalResult.isWholeBook && !reqPage && !reqStart) {
    return new Response(
      JSON.stringify({
        error: "Forbidden: Page-scoped reviewers must specify an authorized page parameter.",
        authorizedPages: Array.from(evalResult.authorizedPageNumbers),
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // SCENARIO B: Sliced Page Request
  let requestedPages: number[] = [];
  if (reqPage) {
    requestedPages = [reqPage];
  } else if (reqStart && reqEnd) {
    for (let i = reqStart; i <= reqEnd; i++) requestedPages.push(i);
  } else if (!evalResult.isWholeBook) {
    requestedPages = Array.from(evalResult.authorizedPageNumbers).sort((a, b) => a - b);
  }

  // Verify that all requested pages are in the authorized set if user is page-scoped
  if (!evalResult.isWholeBook) {
    for (const p of requestedPages) {
      if (!evalResult.authorizedPageNumbers.has(p)) {
        return new Response(
          JSON.stringify({ error: `Forbidden: You are not authorized to view page ${p}` }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  // Limit slice size
  if (requestedPages.length > 20) {
    return new Response(
      JSON.stringify({ error: "Range too large. Maximum 20 pages per sliced request." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const cacheKey = `${proofId}:pages-${requestedPages.join(",")}`;
  const cached = sliceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return new Response(new Uint8Array(cached.pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(cached.pdfBuffer.length),
        "Cache-Control": "private, no-cache, no-store",
      },
    });
  }

  // Generate Transient Sliced PDF using pdf-lib
  const srcDoc = await PDFDocument.load(sourcePdfBuffer);
  const totalPages = srcDoc.getPageCount();
  const subDoc = await PDFDocument.create();

  const zeroIndexedPages = requestedPages
    .map((p) => p - 1)
    .filter((idx) => idx >= 0 && idx < totalPages);

  if (zeroIndexedPages.length === 0) {
    return new Response(JSON.stringify({ error: "No valid pages found in requested range" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const copiedPages = await subDoc.copyPages(srcDoc, zeroIndexedPages);
  for (const p of copiedPages) {
    subDoc.addPage(p);
  }

  const subBytes = await subDoc.save();
  sliceCache.set(cacheKey, { pdfBuffer: subBytes, expiresAt: Date.now() + CACHE_TTL_MS });

  return new Response(new Uint8Array(subBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(subBytes.length),
      "Cache-Control": "private, no-cache, no-store",
    },
  });
}
