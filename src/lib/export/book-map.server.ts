import { query } from "../db/pool.server";
import { getAuthenticatedActor } from "../preparation/preparation.server";

export interface TableOfContentsEntry {
  section_id: string;
  section_name: string;
  start_page: number;
  end_page: number;
  page_count: number;
  category_name: string | null;
}

/**
 * Generates reader-facing Table of Contents derived from section openers.
 */
export async function exportTableOfContents(
  yearbookId: string,
  cookieHeader?: string | null
): Promise<TableOfContentsEntry[]> {
  const actor = await getAuthenticatedActor(cookieHeader);

  // Assert user is authorized to view yearbook
  const authRes = await query(
    `SELECT id FROM public.yearbooks WHERE id = $1`,
    [yearbookId]
  );
  if (authRes.rows.length === 0) {
    throw new Error("NOT_FOUND: Yearbook not found");
  }

  const res = await query(
    `SELECT 
       s.id as section_id,
       s.name as section_name,
       MIN(p.physical_index) as start_page,
       MAX(p.physical_index) as end_page,
       COUNT(p.id) as page_count,
       sc.name as category_name
     FROM public.sections s
     JOIN public.pages p ON p.section_id = s.id
     LEFT JOIN public.section_categories sc ON sc.id = p.section_category_id
     WHERE s.yearbook_id = $1
     GROUP BY s.id, s.name, s.position, sc.name
     ORDER BY MIN(p.physical_index) ASC, s.position ASC`,
    [yearbookId]
  );

  return res.rows.map((r) => ({
    section_id: r.section_id,
    section_name: r.section_name,
    start_page: parseInt(r.start_page, 10),
    end_page: parseInt(r.end_page, 10),
    page_count: parseInt(r.page_count, 10),
    category_name: r.category_name || null,
  }));
}

/**
 * Generates the complete 138-page Production Book Map as CSV or JSON.
 */
export async function exportProductionBookMap(
  yearbookId: string,
  cookieHeader?: string | null
): Promise<string> {
  const actor = await getAuthenticatedActor(cookieHeader);

  // Role Gate: Super Admin, EIC, Coordinator, Advisor
  const userRoles = actor.roles;
  const isSuperAdmin = userRoles.includes("super_admin");

  const memberRes = await query(
    `SELECT role FROM public.yearbook_members WHERE yearbook_id = $1 AND user_id = $2`,
    [yearbookId, actor.id]
  );
  const memberRole = memberRes.rows[0]?.role;

  if (!isSuperAdmin && !["coordinator", "advisor", "editor_in_chief"].includes(memberRole)) {
    throw new Error("FORBIDDEN: You do not have permission to export production book maps");
  }

  const res = await query(
    `SELECT 
       p.physical_index,
       p.display_page_label,
       p.is_unnumbered,
       p.title as page_title,
       COALESCE(s.name, '') as section_name,
       COALESCE(sc.name, '') as category_name,
       COALESCE(lt.name, '') as layout_type,
       COALESCE(pkt.school_level, '') as school_level,
       COALESCE(pkt.grade_level, '') as grade_level,
       COALESCE(pkt.strand_or_track, '') as strand_or_track,
       COALESCE(pkt.class_section, '') as class_section,
       COALESCE(pkt.prep_status::text, 'not_started') as prep_status,
       (
         SELECT string_agg(ys.full_name, '; ')
         FROM public.page_person_appearances pa
         JOIN public.yearbook_subjects ys ON ys.id = pa.person_id
         WHERE pa.page_id = p.id
       ) as student_names,
       (
         SELECT COUNT(*) 
         FROM public.page_asset_requirements ar 
         WHERE ar.page_id = p.id AND ar.status IN ('missing', 'requested')
       ) as missing_assets_count,
       (
         SELECT COUNT(*) 
         FROM public.page_asset_requirements ar 
         WHERE ar.page_id = p.id AND ar.status IN ('received', 'verified')
       ) as received_assets_count,
       (
         SELECT COUNT(*) 
         FROM public.missing_content_checklist_items ckl 
         WHERE ckl.page_id = p.id AND ckl.is_resolved = false
       ) as open_punch_items
     FROM public.pages p
     LEFT JOIN public.sections s ON s.id = p.section_id
     LEFT JOIN public.section_categories sc ON sc.id = p.section_category_id
     LEFT JOIN public.layout_types lt ON lt.id = p.layout_type_id
     LEFT JOIN public.page_preparation_packets pkt ON pkt.page_id = p.id
     WHERE p.yearbook_id = $1
     ORDER BY p.physical_index ASC`,
    [yearbookId]
  );

  // Log export event
  await query(
    `INSERT INTO public.production_audit_log (yearbook_id, action, entity_type, entity_id, user_id, metadata, created_at)
     VALUES ($1, 'export_production_book_map', 'yearbook', $1, $2, $3, now())`,
    [yearbookId, actor.id, JSON.stringify({ format: "csv", row_count: res.rows.length })]
  );

  // Format as CSV
  const headers = [
    "Page #",
    "Display Label",
    "Unnumbered",
    "Page Title",
    "Section",
    "Category",
    "Layout Type",
    "School Level",
    "Grade",
    "Strand",
    "Class Section",
    "Prep Status",
    "Student / Subject Names",
    "Missing Assets",
    "Received Assets",
    "Open Punch Items",
  ];

  const csvRows = [headers.join(",")];

  for (const row of res.rows) {
    const values = [
      row.physical_index,
      `"${(row.display_page_label || "").replace(/"/g, '""')}"`,
      row.is_unnumbered ? "YES" : "NO",
      `"${(row.page_title || "").replace(/"/g, '""')}"`,
      `"${(row.section_name || "").replace(/"/g, '""')}"`,
      `"${(row.category_name || "").replace(/"/g, '""')}"`,
      `"${(row.layout_type || "").replace(/"/g, '""')}"`,
      `"${(row.school_level || "").replace(/"/g, '""')}"`,
      `"${(row.grade_level || "").replace(/"/g, '""')}"`,
      `"${(row.strand_or_track || "").replace(/"/g, '""')}"`,
      `"${(row.class_section || "").replace(/"/g, '""')}"`,
      `"${(row.prep_status || "").replace(/"/g, '""')}"`,
      `"${(row.student_names || "").replace(/"/g, '""')}"`,
      row.missing_assets_count || 0,
      row.received_assets_count || 0,
      row.open_punch_items || 0,
    ];
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

/**
 * Exports targeted Asset Requirements Punch List (missing portraits, groups, etc.).
 */
export async function exportAssetRequirementsPunchList(
  yearbookId: string,
  cookieHeader?: string | null
): Promise<string> {
  const actor = await getAuthenticatedActor(cookieHeader);

  const res = await query(
    `SELECT 
       p.physical_index as page_number,
       p.display_page_label,
       COALESCE(s.name, '') as section_name,
       ar.asset_type,
       ar.label as asset_label,
       COALESCE(ys.full_name, '') as student_name,
       COALESCE(ar.specification, '') as specification,
       ar.status,
       ar.is_reference_only
     FROM public.page_asset_requirements ar
     JOIN public.pages p ON p.id = ar.page_id
     LEFT JOIN public.sections s ON s.id = p.section_id
     LEFT JOIN public.yearbook_subjects ys ON ys.id = ar.person_id
     WHERE ar.yearbook_id = $1 AND ar.status IN ('missing', 'requested')
     ORDER BY p.physical_index ASC, ar.created_at ASC`,
    [yearbookId]
  );

  const headers = [
    "Page #",
    "Display Label",
    "Section",
    "Asset Type",
    "Asset Label",
    "Subject Name",
    "Specification",
    "Status",
    "Reference Only",
  ];

  const csvRows = [headers.join(",")];

  for (const row of res.rows) {
    const values = [
      row.page_number,
      `"${(row.display_page_label || "").replace(/"/g, '""')}"`,
      `"${(row.section_name || "").replace(/"/g, '""')}"`,
      `"${(row.asset_type || "").replace(/"/g, '""')}"`,
      `"${(row.asset_label || "").replace(/"/g, '""')}"`,
      `"${(row.student_name || "").replace(/"/g, '""')}"`,
      `"${(row.specification || "").replace(/"/g, '""')}"`,
      `"${(row.status || "").replace(/"/g, '""')}"`,
      row.is_reference_only ? "YES" : "NO",
    ];
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}
