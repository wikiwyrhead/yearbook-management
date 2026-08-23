import { query, getDbPool } from "../db/pool.server";
import { validateSession, parseSessionCookie, type SessionUser } from "../auth/session.server";

export async function getAuthenticatedActor(actorOrCookie?: string | null): Promise<SessionUser> {
  if (!actorOrCookie) {
    throw new Error("UNAUTHORIZED: Missing session");
  }

  // Check if direct UUID passed from server context or script
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(actorOrCookie)) {
    const res = await query(`SELECT id, email, full_name FROM public.users WHERE id = $1`, [actorOrCookie]);
    if (res.rows.length > 0) {
      const u = res.rows[0];
      const rolesRes = await query(`SELECT role FROM public.user_roles WHERE user_id = $1`, [u.id]);
      const roles = rolesRes.rows.map((r) => r.role);
      return {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        avatarUrl: null,
        roles,
      };
    }
  }

  const sessionId = parseSessionCookie(actorOrCookie);
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

import { createHash } from "node:crypto";

export const STANDARD_SECTION_CATEGORIES = [
  { code: "COVER_ENDSHEET", name: "Cover & Endsheet", color: "#1e293b", sort_order: 1 },
  { code: "IDENTITY_HERITAGE", name: "School Identity & Heritage", color: "#0f766e", sort_order: 2 },
  { code: "LEADERSHIP_MESSAGES", name: "Leadership Messages", color: "#1d4ed8", sort_order: 3 },
  { code: "ADMINISTRATION", name: "Administration", color: "#4338ca", sort_order: 4 },
  { code: "FACULTY_STAFF", name: "Faculty & Staff", color: "#6d28d9", sort_order: 5 },
  { code: "CEREMONIES", name: "Ceremonies", color: "#b45309", sort_order: 6 },
  { code: "AWARDS_RECOGNITION", name: "Awards & Recognition", color: "#d97706", sort_order: 7 },
  { code: "CLASS_PROFILES", name: "Class & Grade Profiles", color: "#2563eb", sort_order: 8 },
  { code: "GRADUATES", name: "Graduates", color: "#059669", sort_order: 9 },
  { code: "UNDERGRADUATES", name: "Undergraduates", color: "#0891b2", sort_order: 10 },
  { code: "STUDENT_LIFE", name: "Student Life & Events", color: "#ea580c", sort_order: 11 },
  { code: "FAITH_MINISTRY", name: "Faith & Ministry", color: "#7c3aed", sort_order: 12 },
  { code: "ATHLETICS", name: "Athletics", color: "#dc2626", sort_order: 13 },
  { code: "CLUBS_ORGS", name: "Clubs & Organizations", color: "#4f46e5", sort_order: 14 },
  { code: "SPONSORS_ADS", name: "Sponsors & Advertisements", color: "#475569", sort_order: 15 },
  { code: "EDITORIAL_CREDITS", name: "Editorial Board & Credits", color: "#334155", sort_order: 16 },
  { code: "HYMN_PRAYER", name: "Hymn, Prayer & Alma Mater", color: "#0284c7", sort_order: 17 },
  { code: "CLOSING_MATTER", name: "Closing Matter", color: "#64748b", sort_order: 18 },
  { code: "CUSTOM_OTHER", name: "Custom / Other", color: "#94a3b8", sort_order: 19 },
];

export const STANDARD_LAYOUT_TYPES = [
  { code: "FRONT_COVER", name: "Front Cover", default_span: "cover", sort_order: 1 },
  { code: "BACK_COVER", name: "Back Cover", default_span: "cover", sort_order: 2 },
  { code: "ENDSHEET_BLANK", name: "Endsheet / Blank", default_span: "two_page_spread", sort_order: 3 },
  { code: "SECTION_DIVIDER", name: "Section Divider / Opener", default_span: "single_page", sort_order: 4 },
  { code: "MISSION_VISION", name: "Mission–Vision / School Identity", default_span: "single_page", sort_order: 5 },
  { code: "VALUES_INFOGRAPHIC", name: "Values Infographic", default_span: "single_page", sort_order: 6 },
  { code: "LEADERSHIP_SINGLE", name: "Leadership Message — Single Page", default_span: "single_page", slot_count: 1, sort_order: 7 },
  { code: "LEADERSHIP_SPREAD", name: "Leadership Message — Facing Spread", default_span: "two_page_spread", slot_count: 1, sort_order: 8 },
  { code: "ADMIN_DIRECTORY", name: "Administration Directory", default_span: "single_page", slot_count: 12, row_count: 3, col_count: 4, sort_order: 9 },
  { code: "FACULTY_DIRECTORY", name: "Faculty Directory", default_span: "single_page", slot_count: 16, row_count: 4, col_count: 4, sort_order: 10 },
  { code: "CEREMONY_OPENER", name: "Ceremony Opener", default_span: "two_page_spread", sort_order: 11 },
  { code: "CEREMONY_PROGRAM", name: "Ceremony Program", default_span: "single_page", sort_order: 12 },
  { code: "SPEECH_ADDRESS", name: "Speech / Address", default_span: "single_page", slot_count: 1, sort_order: 13 },
  { code: "AWARDEES_GRID", name: "Awardees Portrait Grid", default_span: "single_page", slot_count: 12, row_count: 3, col_count: 4, sort_order: 14 },
  { code: "CLASS_OPENER", name: "Class Opener — Group Photo, Adviser and Class Identity", default_span: "single_page", slot_count: 1, sort_order: 15 },
  { code: "STUDENT_PROFILE_INDIVIDUAL", name: "Student Profile — Individual", default_span: "single_page", slot_count: 1, sort_order: 16 },
  { code: "STUDENT_PROFILE_ROWS", name: "Student Profile Rows", default_span: "single_page", slot_count: 4, row_count: 4, col_count: 1, sort_order: 17 },
  { code: "PORTRAIT_GRID_CONFIGURABLE", name: "Portrait Grid — Configurable Slot Count", default_span: "single_page", slot_count: 24, row_count: 6, col_count: 4, sort_order: 18 },
  { code: "CLASS_GROUP_PHOTO", name: "Class Group Photo", default_span: "two_page_spread", slot_count: 1, sort_order: 19 },
  { code: "SECTION_CLOSING_QUOTE", name: "Quote / Section Closing Page", default_span: "single_page", sort_order: 20 },
  { code: "FUTURE_SELF_LETTER", name: "Future-Self Letter / Memory Page", default_span: "single_page", sort_order: 21 },
  { code: "EVENT_COLLAGE", name: "Event Photo Collage", default_span: "two_page_spread", slot_count: 8, sort_order: 22 },
  { code: "FAITH_COLLAGE", name: "Faith Event Collage", default_span: "two_page_spread", slot_count: 6, sort_order: 23 },
  { code: "ATHLETICS_COLLAGE", name: "Athletics Event Collage", default_span: "two_page_spread", slot_count: 8, sort_order: 24 },
  { code: "AD_FULL_PAGE", name: "Full-Page Advertisement / Tribute", default_span: "single_page", slot_count: 1, sort_order: 25 },
  { code: "AD_MULTI_SPONSOR", name: "Multi-Sponsor Advertisement Grid", default_span: "single_page", slot_count: 8, row_count: 4, col_count: 2, sort_order: 26 },
  { code: "EDITORIAL_MASTHEAD", name: "Editorial Board / Masthead", default_span: "single_page", slot_count: 10, sort_order: 27 },
  { code: "ACKNOWLEDGEMENTS", name: "Acknowledgements", default_span: "single_page", sort_order: 28 },
  { code: "HYMN_ALMA_MATER", name: "Hymn / Prayer / Alma Mater", default_span: "single_page", sort_order: 29 },
  { code: "CUSTOM_LAYOUT", name: "Custom Layout", default_span: "single_page", sort_order: 30 },
];

/**
 * Ensures all 19 standard section categories and 30 layout types exist for a yearbook.
 */
export async function ensureYearbookCatalogs(yearbookId: string): Promise<void> {
  for (const cat of STANDARD_SECTION_CATEGORIES) {
    await query(
      `INSERT INTO public.section_categories (yearbook_id, name, code, color, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [yearbookId, cat.name, cat.code, cat.color, cat.sort_order]
    );
  }

  for (const lt of STANDARD_LAYOUT_TYPES) {
    await query(
      `INSERT INTO public.layout_types (yearbook_id, name, code, default_span, slot_count, row_count, col_count, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        yearbookId,
        lt.name,
        lt.code,
        lt.default_span,
        lt.slot_count || null,
        lt.row_count || null,
        lt.col_count || null,
        lt.sort_order,
      ]
    );
  }
}

/**
 * Creates an immutable, versioned Design Packet Snapshot with canonical SHA-256 hash.
 */
export async function createDesignPacketSnapshot(
  pageId: string,
  cookieHeader?: string | null
): Promise<{ snapshotId: string; version: number; sha256: string }> {
  const actor = await getAuthenticatedActor(cookieHeader);

  // Fetch complete packet
  const packetData = await getPagePreparationPacket(pageId, cookieHeader);
  const yearbookId = packetData.page.yearbook_id;

  // Build canonical payload obeying minimum-necessary data policy (no internal student IDs)
  const canonicalPayload = {
    page: {
      physical_index: packetData.page.physical_index,
      display_page_label: packetData.page.display_page_label,
      is_unnumbered: packetData.page.is_unnumbered,
      title: packetData.page.title,
      section_name: packetData.page.section_name || "",
      section_category_name: packetData.page.section_category_name || "",
      layout_type_name: packetData.page.layout_type_name || "",
    },
    packet: {
      spread_index: packetData.packet?.spread_index || null,
      school_level: packetData.packet?.school_level || null,
      grade_level: packetData.packet?.grade_level || null,
      strand_or_track: packetData.packet?.strand_or_track || null,
      class_section: packetData.packet?.class_section || null,
      session_name: packetData.packet?.session_name || null,
      captions_and_credits: packetData.packet?.captions_and_credits || null,
    },
    text_blocks: packetData.content_blocks.map((b) => ({
      block_type: b.block_type,
      heading_level: b.heading_level,
      text_content: b.text_content,
      sort_order: b.sort_order,
      is_verified: b.is_verified,
    })),
    roster_subjects: packetData.person_appearances.map((p) => ({
      display_name_snapshot: p.display_name_snapshot,
      academic_honor: p.academic_honor,
      quoted_text: p.quoted_text,
      sort_order: p.sort_order,
      is_verified: p.is_verified,
    })),
    approved_assets: packetData.asset_requirements
      .filter((a) => a.status === "verified" && !a.is_reference_only)
      .map((a) => ({
        requirement_id: a.id,
        label: a.label,
        asset_type: a.asset_type,
        high_res_asset_id: a.high_res_asset_id,
      })),
    checklist_status: packetData.checklist_items.map((c) => ({
      category: c.category,
      is_resolved: c.is_resolved,
    })),
  };

  const payloadStr = JSON.stringify(canonicalPayload);
  const snapshotSha256 = createHash("sha256").update(payloadStr).digest("hex");

  // Determine next version and parent snapshot
  const prevRes = await query(
    `SELECT id, version FROM public.design_packet_snapshots 
     WHERE page_id = $1 ORDER BY version DESC LIMIT 1`,
    [pageId]
  );
  const nextVersion = prevRes.rows.length > 0 ? prevRes.rows[0].version + 1 : 1;
  const parentSnapshotId = prevRes.rows[0]?.id || null;

  const insRes = await query(
    `INSERT INTO public.design_packet_snapshots 
     (page_id, yearbook_id, version, parent_snapshot_id, snapshot_sha256, prepared_by, snapshot_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [pageId, yearbookId, nextVersion, parentSnapshotId, snapshotSha256, actor.id, payloadStr]
  );

  return {
    snapshotId: insRes.rows[0].id,
    version: nextVersion,
    sha256: snapshotSha256,
  };
}

/**
 * Records an append-only review decision for a design packet snapshot.
 */
export async function recordDesignPacketReview(
  params: {
    snapshotId: string;
    stage: "eic_review" | "coordinator_approval" | "super_admin_check";
    decision: "approved" | "changes_requested" | "rejected";
    notes?: string;
  },
  cookieHeader?: string | null
): Promise<{ reviewId: string }> {
  const actor = await getAuthenticatedActor(cookieHeader);

  const snapRes = await query(
    `SELECT page_id, yearbook_id FROM public.design_packet_snapshots WHERE id = $1`,
    [params.snapshotId]
  );
  if (snapRes.rows.length === 0) {
    throw new Error("NOT_FOUND: Design packet snapshot not found");
  }
  const { page_id, yearbook_id } = snapRes.rows[0];

  // Enforce sequential workflow
  if (params.stage === "coordinator_approval") {
    const eicRes = await query(
      `SELECT 1 FROM public.design_packet_reviews 
       WHERE snapshot_id = $1 AND stage = 'eic_review' AND decision = 'approved'`,
      [params.snapshotId]
    );
    if (eicRes.rows.length === 0) {
      throw new Error("PRECONDITION_FAILED: EIC review approval required before Coordinator approval.");
    }
  } else if (params.stage === "super_admin_check") {
    const coordRes = await query(
      `SELECT 1 FROM public.design_packet_reviews 
       WHERE snapshot_id = $1 AND stage = 'coordinator_approval' AND decision = 'approved'`,
      [params.snapshotId]
    );
    if (coordRes.rows.length === 0) {
      throw new Error("PRECONDITION_FAILED: Coordinator approval required before Super Admin check.");
    }
  }

  const insRes = await query(
    `INSERT INTO public.design_packet_reviews
     (snapshot_id, page_id, yearbook_id, stage, reviewer_user_id, decision, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [params.snapshotId, page_id, yearbook_id, params.stage, actor.id, params.decision, params.notes || null]
  );

  return { reviewId: insRes.rows[0].id };
}

/**
 * Retrieves the approved Design Queue for the Super Admin.
 */
export async function getDesignQueue(
  yearbookId: string,
  cookieHeader?: string | null
): Promise<Array<{
  snapshot_id: string;
  page_id: string;
  physical_index: number;
  display_page_label: string;
  title: string;
  version: number;
  snapshot_sha256: string;
  eic_approved: boolean;
  coordinator_approved: boolean;
  super_admin_checked: boolean;
  created_at: string;
}>> {
  await getAuthenticatedActor(cookieHeader);

  const res = await query(
    `SELECT 
       s.id as snapshot_id,
       s.page_id,
       p.physical_index,
       p.display_page_label,
       p.title,
       s.version,
       s.snapshot_sha256,
       EXISTS (SELECT 1 FROM public.design_packet_reviews r WHERE r.snapshot_id = s.id AND r.stage = 'eic_review' AND r.decision = 'approved') as eic_approved,
       EXISTS (SELECT 1 FROM public.design_packet_reviews r WHERE r.snapshot_id = s.id AND r.stage = 'coordinator_approval' AND r.decision = 'approved') as coordinator_approved,
       EXISTS (SELECT 1 FROM public.design_packet_reviews r WHERE r.snapshot_id = s.id AND r.stage = 'super_admin_check' AND r.decision = 'approved') as super_admin_checked,
       s.created_at
     FROM public.design_packet_snapshots s
     JOIN public.pages p ON p.id = s.page_id
     WHERE s.yearbook_id = $1
       -- Only latest snapshot per page
       AND s.id = (
         SELECT id FROM public.design_packet_snapshots s2 
         WHERE s2.page_id = s.page_id ORDER BY s2.version DESC LIMIT 1
       )
     ORDER BY p.physical_index ASC`,
    [yearbookId]
  );

  return res.rows;
}

/**
 * Queues verified high-resolution assets for Canva transfer.
 */
export async function queueDesignPacketAssetTransfers(
  snapshotId: string,
  cookieHeader?: string | null
): Promise<{ queuedCount: number; transfers: any[] }> {
  const actor = await getAuthenticatedActor(cookieHeader);

  const snapRes = await query(
    `SELECT s.page_id, s.yearbook_id, s.version, y.school_id as center_id
     FROM public.design_packet_snapshots s
     JOIN public.yearbooks y ON y.id = s.yearbook_id
     WHERE s.id = $1`,
    [snapshotId]
  );
  if (snapRes.rows.length === 0) {
    throw new Error("NOT_FOUND: Snapshot not found");
  }
  const { page_id, yearbook_id, version, center_id } = snapRes.rows[0];

  // Fetch verified, non-reference-only production assets
  const reqRes = await query(
    `SELECT ar.id as asset_requirement_id, ar.high_res_asset_id, a.id as asset_id
     FROM public.page_asset_requirements ar
     JOIN public.assets a ON a.id = ar.high_res_asset_id
     WHERE ar.page_id = $1 
       AND ar.status = 'verified' 
       AND ar.is_reference_only = false
       AND a.yearbook_id = $2
       AND (a.school_id IS NULL OR a.school_id = $3)`,
    [page_id, yearbook_id, center_id]
  );

  const queued = [];
  for (const row of reqRes.rows) {
    const idempotencyKey = `${snapshotId}:${row.asset_id}:v${version}`;
    const insRes = await query(
      `INSERT INTO public.design_packet_asset_transfers
       (design_packet_id, page_id, yearbook_id, asset_requirement_id, source_asset_id, provider, transfer_status, idempotency_key, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, 'canva', 'pending', $6, $7)
       ON CONFLICT (idempotency_key) DO UPDATE SET attempt_count = design_packet_asset_transfers.attempt_count + 1
       RETURNING id, idempotency_key, transfer_status`,
      [snapshotId, page_id, yearbook_id, row.asset_requirement_id, row.asset_id, idempotencyKey, actor.id]
    );
    queued.push(insRes.rows[0]);
  }

  return { queuedCount: queued.length, transfers: queued };
}

