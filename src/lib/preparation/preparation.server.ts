import { query, getDbPool } from "../db/pool.server";
import { validateSession, parseSessionCookie, type SessionUser } from "../auth/session.server";

export async function getAuthenticatedActor(cookieHeader?: string | null): Promise<SessionUser> {
  const sessionId = parseSessionCookie(cookieHeader);
  if (!sessionId) {
    throw new Error("UNAUTHORIZED: Missing session");
  }
  const user = await validateSession(sessionId);
  if (!user) {
    throw new Error("UNAUTHORIZED: Invalid or expired session");
  }
  return user;
}

export interface PreparationPacketDTO {
  page: {
    id: string;
    yearbook_id: string;
    physical_index: number;
    display_page_label: string;
    is_unnumbered: boolean;
    title: string;
    section_id: string | null;
    section_name?: string;
    section_category_id: string | null;
    section_category_name?: string;
    layout_type_id: string | null;
    layout_type_name?: string;
  };
  packet: {
    id: string;
    spread_index: number | null;
    school_level: string | null;
    grade_level: string | null;
    strand_or_track: string | null;
    class_section: string | null;
    session_name: string | null;
    captions_and_credits: string | null;
    source_pdf_page: number | null;
    prep_status: string;
  } | null;
  content_blocks: Array<{
    id: string;
    block_type: string;
    heading_level: number | null;
    text_content: string;
    sort_order: number;
    is_verified: boolean;
  }>;
  person_appearances: Array<{
    id: string;
    person_id: string;
    full_name: string;
    display_name_snapshot: string;
    academic_honor: string | null;
    quoted_text: string | null;
    sort_order: number;
    is_verified: boolean;
  }>;
  asset_requirements: Array<{
    id: string;
    asset_type: string;
    person_id: string | null;
    label: string;
    specification: string | null;
    status: string;
    is_reference_only: boolean;
    reference_storage_path: string | null;
    high_res_asset_id: string | null;
  }>;
  checklist_items: Array<{
    id: string;
    category: string;
    description: string;
    is_resolved: boolean;
    resolved_by: string | null;
    resolved_at: string | null;
  }>;
  reviews: Array<{
    id: string;
    scope: string;
    stage: string;
    decision: string;
    notes: string | null;
    reviewer_name: string;
    created_at: string;
  }>;
}

/**
 * Retrieves the complete preparation packet for a specific page.
 */
export async function getPagePreparationPacket(
  pageId: string,
  cookieHeader?: string | null
): Promise<PreparationPacketDTO> {
  await getAuthenticatedActor(cookieHeader);

  // 1. Fetch Page Master
  const pageRes = await query(
    `SELECT p.id, p.yearbook_id, p.physical_index, p.display_page_label, p.is_unnumbered,
            p.title, p.section_id, s.name as section_name,
            p.section_category_id, sc.name as section_category_name,
            p.layout_type_id, lt.name as layout_type_name
     FROM public.pages p
     LEFT JOIN public.sections s ON s.id = p.section_id
     LEFT JOIN public.section_categories sc ON sc.id = p.section_category_id
     LEFT JOIN public.layout_types lt ON lt.id = p.layout_type_id
     WHERE p.id = $1`,
    [pageId]
  );

  if (pageRes.rows.length === 0) {
    throw new Error("NOT_FOUND: Page does not exist");
  }
  const page = pageRes.rows[0];

  // 2. Fetch Packet Header
  const packetRes = await query(
    `SELECT id, spread_index, school_level, grade_level, strand_or_track,
            class_section, session_name, captions_and_credits, source_pdf_page, prep_status
     FROM public.page_preparation_packets
     WHERE page_id = $1`,
    [pageId]
  );
  const packet = packetRes.rows[0] || null;

  // 3. Fetch Content Blocks
  const blocksRes = await query(
    `SELECT id, block_type, heading_level, text_content, sort_order, is_verified
     FROM public.page_content_blocks
     WHERE page_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [pageId]
  );

  // 4. Fetch Person Appearances
  const appearancesRes = await query(
    `SELECT pa.id, pa.person_id, ys.full_name, pa.display_name_snapshot,
            pa.academic_honor, pa.quoted_text, pa.sort_order, pa.is_verified
     FROM public.page_person_appearances pa
     JOIN public.yearbook_subjects ys ON ys.id = pa.person_id
     WHERE pa.page_id = $1
     ORDER BY pa.sort_order ASC, pa.created_at ASC`,
    [pageId]
  );

  // 5. Fetch Asset Requirements
  const assetsRes = await query(
    `SELECT id, asset_type, person_id, label, specification, status,
            is_reference_only, reference_storage_path, high_res_asset_id
     FROM public.page_asset_requirements
     WHERE page_id = $1
     ORDER BY created_at ASC`,
    [pageId]
  );

  // 6. Fetch Checklist Punch Items
  const checklistRes = await query(
    `SELECT id, category, description, is_resolved, resolved_by, resolved_at
     FROM public.missing_content_checklist_items
     WHERE page_id = $1
     ORDER BY is_resolved ASC, created_at ASC`,
    [pageId]
  );

  // 7. Fetch Review History
  const reviewsRes = await query(
    `SELECT r.id, r.scope, r.stage, r.decision, r.notes, u.full_name as reviewer_name, r.created_at
     FROM public.preparation_reviews r
     JOIN public.users u ON u.id = r.reviewer_user_id
     WHERE r.page_id = $1
     ORDER BY r.created_at DESC`,
    [pageId]
  );

  return {
    page,
    packet,
    content_blocks: blocksRes.rows,
    person_appearances: appearancesRes.rows,
    asset_requirements: assetsRes.rows,
    checklist_items: checklistRes.rows,
    reviews: reviewsRes.rows,
  };
}

/**
 * Updates textual and metadata properties on a page preparation packet.
 */
export async function updatePagePreparationPacket(
  pageId: string,
  updates: {
    title?: string;
    captions_and_credits?: string;
    prep_status?: string;
  },
  cookieHeader?: string | null
): Promise<void> {
  const actor = await getAuthenticatedActor(cookieHeader);
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN;");

    const pageRes = await client.query(
      `SELECT p.id, p.yearbook_id, y.school_id 
       FROM public.pages p
       JOIN public.yearbooks y ON y.id = p.yearbook_id
       WHERE p.id = $1 FOR UPDATE`,
      [pageId]
    );

    if (pageRes.rows.length === 0) {
      throw new Error("NOT_FOUND: Page not found");
    }

    const { yearbook_id } = pageRes.rows[0];

    if (updates.title !== undefined) {
      await client.query(
        `UPDATE public.pages SET title = $1, updated_at = now() WHERE id = $2`,
        [updates.title, pageId]
      );
    }

    if (updates.captions_and_credits !== undefined || updates.prep_status !== undefined) {
      await client.query(
        `UPDATE public.page_preparation_packets
         SET captions_and_credits = COALESCE($1, captions_and_credits),
             prep_status = COALESCE($2::public.page_prep_status, prep_status),
             updated_at = now()
         WHERE page_id = $3`,
        [updates.captions_and_credits, updates.prep_status, pageId]
      );
    }

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Records a multi-stage review decision for a page, section, or edition.
 */
export async function signOffPreparationStage(
  params: {
    yearbookId: string;
    pageId?: string | null;
    sectionId?: string | null;
    scope: "page" | "section" | "edition";
    stage: "editorial_member" | "editor_in_chief" | "coordinator" | "principal" | "school_director" | "super_admin";
    decision: "approved" | "changes_requested";
    notes?: string;
  },
  cookieHeader?: string | null
): Promise<{ reviewId: string }> {
  const actor = await getAuthenticatedActor(cookieHeader);

  // Validate scope-target constraints before insert
  if (params.scope === "page" && (!params.pageId || params.sectionId)) {
    throw new Error("INVALID_SCOPE: Page scope requires pageId and null sectionId");
  }
  if (params.scope === "section" && (!params.sectionId || params.pageId)) {
    throw new Error("INVALID_SCOPE: Section scope requires sectionId and null pageId");
  }
  if (params.scope === "edition" && (params.pageId || params.sectionId)) {
    throw new Error("INVALID_SCOPE: Edition scope requires null pageId and null sectionId");
  }

  const res = await query(
    `INSERT INTO public.preparation_reviews 
     (yearbook_id, page_id, section_id, scope, stage, reviewer_user_id, decision, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING id`,
    [
      params.yearbookId,
      params.pageId || null,
      params.sectionId || null,
      params.scope,
      params.stage,
      actor.id,
      params.decision,
      params.notes || null,
    ]
  );

  return { reviewId: res.rows[0].id };
}

/**
 * Returns complete 138-page production map overview with readiness indicators.
 */
export async function getYearbookPreparationBookMap(
  yearbookId: string,
  cookieHeader?: string | null
): Promise<Array<{
  page_id: string;
  physical_index: number;
  display_page_label: string;
  is_unnumbered: boolean;
  title: string;
  section_name: string | null;
  section_category_name: string | null;
  layout_type_name: string | null;
  school_level: string | null;
  grade_level: string | null;
  class_section: string | null;
  prep_status: string;
  missing_assets_count: number;
  unresolved_punch_count: number;
  total_subjects_count: number;
}>> {
  await getAuthenticatedActor(cookieHeader);

  const res = await query(
    `SELECT 
       p.id as page_id,
       p.physical_index,
       p.display_page_label,
       p.is_unnumbered,
       p.title,
       s.name as section_name,
       sc.name as section_category_name,
       lt.name as layout_type_name,
       pkt.school_level,
       pkt.grade_level,
       pkt.class_section,
       COALESCE(pkt.prep_status, 'not_started') as prep_status,
       COUNT(DISTINCT ar.id) FILTER (WHERE ar.status IN ('missing', 'requested')) as missing_assets_count,
       COUNT(DISTINCT ckl.id) FILTER (WHERE ckl.is_resolved = false) as unresolved_punch_count,
       COUNT(DISTINCT pa.id) as total_subjects_count
     FROM public.pages p
     LEFT JOIN public.sections s ON s.id = p.section_id
     LEFT JOIN public.section_categories sc ON sc.id = p.section_category_id
     LEFT JOIN public.layout_types lt ON lt.id = p.layout_type_id
     LEFT JOIN public.page_preparation_packets pkt ON pkt.page_id = p.id
     LEFT JOIN public.page_asset_requirements ar ON ar.page_id = p.id
     LEFT JOIN public.missing_content_checklist_items ckl ON ckl.page_id = p.id
     LEFT JOIN public.page_person_appearances pa ON pa.page_id = p.id
     WHERE p.yearbook_id = $1
     GROUP BY p.id, p.physical_index, p.display_page_label, p.is_unnumbered, p.title,
              s.name, sc.name, lt.name, pkt.school_level, pkt.grade_level, pkt.class_section, pkt.prep_status
     ORDER BY p.physical_index ASC`,
    [yearbookId]
  );

  return res.rows.map((r) => ({
    ...r,
    missing_assets_count: Number(r.missing_assets_count || 0),
    unresolved_punch_count: Number(r.unresolved_punch_count || 0),
    total_subjects_count: Number(r.total_subjects_count || 0),
  }));
}
