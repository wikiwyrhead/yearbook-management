/**
 * Yearbook System - Phase 3 Canva & Production Workflow
 * 
 * '''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            finalize thi sapp and then push to github main adn portable branch
 * 
 * Architecture Decisions:
 * 1. Multi-tenancy: Enforced at the RLS level using security definer functions.
...
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Json = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type YearbookAsset = {
  id: string;
  yearbook_id: string;
  file_name: string;
  file_type?: string;
  file_size?: number;
  storage_path: string;
  asset_type: 'photo' | 'document' | 'pdf' | 'logo' | 'artwork' | 'message' | 'other';
  status: string;
  created_at: string;
  uploaded_by?: string;
  is_current: boolean;
  version: number;
  student_id?: string;
  category?: string;
  uploaded_by_profile?: { full_name: string };
  student?: { first_name: string; last_name: string };
  pages?: Array<{ page: { id: string; page_number: number; title: string } }>;
};


/* ---------------- Dashboard ---------------- */

export const getControlCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const memberships = unwrap(
      await supabase.from("yearbook_members").select("yearbook_id, role").eq("user_id", userId),
    );
    const schools = unwrap(await supabase.from("schools").select("*").order("name"));
    const yearbooks = unwrap(
      await supabase
        .from("yearbooks")
        .select("*, schools(id, name, short_name, logo_url)")
        .order("year", { ascending: false }),
    );
    const isSuperAdmin =
      (unwrap(await supabase.from("user_roles").select("role").eq("user_id", userId)) ?? []).length >
      0;

    const roleByYearbook: Record<string, string[]> = {};
    for (const m of memberships ?? []) {
      (roleByYearbook[m.yearbook_id] ??= []).push(m.role);
    }

    const myStudentRecords = unwrap(
      await supabase
        .from("students")
        .select("*, yearbooks(id, year, title, schools(name))")
        .eq("user_id", userId),
    );

    return {
      userId,
      isSuperAdmin,
      schools: schools ?? [],
      yearbooks: await Promise.all((yearbooks ?? []).map(async (y) => {
        const myRoles = roleByYearbook[y.id] ?? (isSuperAdmin ? ["super_admin"] : []);
        const isPrivileged = myRoles.includes('coordinator') || isSuperAdmin;
        
        let metrics = { assetCompletion: 0, pageProgress: "0 / 0", designStats: { total: 0, ready: 0, designing: 0, complete: 0 } };
        
        if (isPrivileged) {
          const { data: reqs } = await supabase
            .from("page_requirements")
            .select("have, needed")
            .eq("yearbook_id", y.id);
          
          if (reqs && reqs.length > 0) {
            const totalNeeded = reqs.reduce((acc, r) => acc + (r.needed || 0), 0);
            const totalHave = reqs.reduce((acc, r) => acc + (r.have || 0), 0);
            metrics.assetCompletion = totalNeeded > 0 ? Math.round((totalHave / totalNeeded) * 100) : 0;
          }

          const { count: totalPages } = await supabase
            .from("pages")
            .select("id", { count: 'exact', head: true })
            .eq("yearbook_id", y.id);
          
          const { count: completedPages } = await supabase
            .from("pages")
            .select("id", { count: 'exact', head: true })
            .eq("yearbook_id", y.id)
            .not("status_id", "is", null);
            
          metrics.pageProgress = `${completedPages || 0} / ${totalPages || 0}`;

          const { data: designStatusData } = await (supabase as any)
            .from("pages")
            .select("design_status")
            .eq("yearbook_id", y.id);
          
          if (designStatusData) {
            metrics.designStats = {
              total: designStatusData.length,
              ready: designStatusData.filter((p: any) => p.design_status === 'ready_for_design').length,
              designing: designStatusData.filter((p: any) => p.design_status === 'designing').length,
              complete: designStatusData.filter((p: any) => p.design_status === 'complete').length,
            };
          }
        }

        return {
          ...y,
          myRoles,
          metrics
        };
      })),
      myStudentRecords: myStudentRecords ?? [],

    };
  });

export const createSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Json) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = unwrap(
      await supabase
        .from("schools")
        .insert({
          name: String(data['name'] ?? "").trim(),
          short_name: (data['short_name'] as string) || null,
          logo_url: (data['logo_url'] as string) || null,
          address: (data['address'] as string) || null,
          contact_name: (data['contact_name'] as string) || null,
          contact_email: (data['contact_email'] as string) || null,
          contact_phone: (data['contact_phone'] as string) || null,
          notes: (data['notes'] as string) || null,
          created_by: userId,
        })
        .select()
        .single(),
    );
    return row;
  });

export const updateSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Json }) => d)
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase.from("schools").update(data.patch as never).eq("id", data.id).select().single(),
    ),
  );

export const createYearbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { school_id: string; year: number; title?: string; theme?: string; deadline?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return unwrap(
      await supabase
        .from("yearbooks")
        .insert({
          school_id: data.school_id,
          year: data.year,
          title: data.title || null,
          theme: data.theme || null,
          deadline: data.deadline || null,
          created_by: userId,
        })
        .select()
        .single(),
    );
  });

/* ---------------- Yearbook workspace ---------------- */

export const getYearbook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const id = data.yearbookId;

    const yearbook = unwrap(
      await supabase.from("yearbooks").select("*, schools(*)").eq("id", id).single(),
    );
    const myProfileRes = await supabase.from("profiles").select("email").eq("id", userId).single();
    const myEmail = myProfileRes.data?.email || "";

    const myRoles = (
      unwrap(
        await supabase
          .from("yearbook_members")
          .select("role")
          .eq("yearbook_id", id)
          .eq("user_id", userId),
      ) ?? []
    ).map((r) => r.role as string);
    const isSuperAdmin =
      (unwrap(await supabase.from("user_roles").select("role").eq("user_id", userId)) ?? []).length >
      0;

    const [sections, pageTypes, statuses, members] = await Promise.all([
      supabase.from("sections").select("*").eq("yearbook_id", id).order("position"),
      supabase.from("page_types").select("*").eq("yearbook_id", id).order("position"),
      supabase.from("page_statuses").select("*").eq("yearbook_id", id).order("position"),
      supabase.from("yearbook_members").select("*").eq("yearbook_id", id),
    ]);

    const memberRows = unwrap(members) ?? [];
    const profiles = memberRows.length
      ? (unwrap(
          await supabase
            .from("profiles")
            .select("id, email, full_name")
            .in("id", memberRows.map((m) => m.user_id)),
        ) ?? [])
      : [];


    const myStudentRecords = myEmail 
      ? unwrap(
          await supabase
            .from("students")
            .select("id")
            .eq("email", myEmail)
            .eq("yearbook_id", id)
        )
      : [];

    return {
      yearbook,
      myRoles: isSuperAdmin ? [...myRoles, "super_admin"] : myRoles,
      myStudentId: (myStudentRecords as any[])?.[0]?.id || null,
      canManage: isSuperAdmin || myRoles.includes("coordinator"),
      canEdit: isSuperAdmin || myRoles.includes("coordinator") || myRoles.includes("staff"),
      sections: unwrap(sections) ?? [],
      pageTypes: unwrap(pageTypes) ?? [],
      statuses: unwrap(statuses) ?? [],
      members: memberRows.map((m) => ({
        ...m,
        profile: profiles.find((p) => p.id === m.user_id) ?? null,
      })),
    };


  });

/* ---------------- Members ---------------- */

export const addMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string; email: string; role: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const profileRes = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", data.email.trim())
      .maybeSingle();
    if (profileRes.error) throw new Error(profileRes.error.message);
    const profile = profileRes.data;
    if (!profile) {
      throw new Error(
        "No account found with that email. Ask them to sign up first, then add them here.",
      );
    }
    return unwrap(
      await supabase
        .from("yearbook_members")
        .insert({
          yearbook_id: data.yearbookId,
          user_id: profile.id,
          role: data.role as never,
        })
        .select()
        .single(),
    );
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("yearbook_members").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- People ---------------- */

export const getPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [students, faculty, classes] = await Promise.all([
      supabase.from("students").select("*").eq("yearbook_id", data.yearbookId).order("last_name"),
      supabase.from("faculty").select("*").eq("yearbook_id", data.yearbookId).order("last_name"),
      supabase.from("classes").select("*").eq("yearbook_id", data.yearbookId).order("name"),
    ]);
    return {
      students: unwrap(students) ?? [],
      faculty: unwrap(faculty) ?? [],
      classes: unwrap(classes) ?? [],
    };
  });

export const savePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: "students" | "faculty" | "classes"; id?: string; values: Json; yearbookId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.id) {
      return unwrap(
        await supabase
          .from(data.table)
          .update(data.values as never)
          .eq("id", data.id)
          .select()
          .single(),
      );
    }
    return unwrap(
      await supabase
        .from(data.table)
        .insert({ ...data.values, yearbook_id: data.yearbookId } as never)
        .select()
        .single(),
    );
  });

export const deletePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { table: "students" | "faculty" | "classes"; id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from(data.table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string; kind: "students" | "faculty"; csv: string }) => d)
  .handler(async ({ data, context }) => {
    const lines = data.csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row.");
    const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const allowed =
      data.kind === "students"
        ? [
            "student_number",
            "first_name",
            "middle_name",
            "last_name",
            "preferred_name",
            "suffix",
            "grade",
            "email",
          ]
        : ["first_name", "middle_name", "last_name", "preferred_name", "suffix", "title", "department", "email"];

    const rows = lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const row: Record<string, unknown> = { yearbook_id: data.yearbookId };
      header.forEach((h, i) => {
        if (allowed.includes(h) && cells[i]) row[h] = cells[i];
      });
      return row;
    });
    const valid = rows.filter((r) => r['first_name'] && r['last_name']);
    if (!valid.length) throw new Error("No rows with both first_name and last_name were found.");

    const { error } = await context.supabase.from(data.kind).insert(valid as never);
    if (error) throw new Error(error.message);
    return { inserted: valid.length, skipped: rows.length - valid.length };
  });

/* ---------------- Page ladder ---------------- */

export const getLadder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [pages, reqs, assignments] = await Promise.all([
      supabase
        .from("pages")
        .select("*")
        .eq("yearbook_id", data.yearbookId)
        .order("position", { ascending: true }),
      supabase.from("page_requirements").select("*").eq("yearbook_id", data.yearbookId).order("position"),
      supabase.from("page_assignments").select("*").eq("yearbook_id", data.yearbookId),
    ]);
    return {
      pages: unwrap(pages) ?? [],
      requirements: unwrap(reqs) ?? [],
      assignments: unwrap(assignments) ?? [],
    };
  });

export const createPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string; count: number; sectionId?: string | null; pageTypeId?: string | null; title?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const existing = unwrap(
      await supabase
        .from("pages")
        .select("position, page_number")
        .eq("yearbook_id", data.yearbookId)
        .order("position", { ascending: false })
        .limit(1),
    );
    let pos = existing?.[0]?.position ?? 0;
    let num = existing?.[0]?.page_number ?? 0;
    const statusRes = await supabase
      .from("page_statuses")
      .select("id")
      .eq("yearbook_id", data.yearbookId)
      .order("position")
      .limit(1)
      .maybeSingle();
    const defaultStatus = statusRes.data;

    const rows = Array.from({ length: Math.max(1, Math.min(200, data.count)) }, () => {
      pos += 1;
      num += 1;
      return {
        yearbook_id: data.yearbookId,
        section_id: data.sectionId || null,
        page_type_id: data.pageTypeId || null,
        status_id: defaultStatus?.id ?? null,
        position: pos,
        page_number: num,
        title: data.title || null,
      };
    });
    const { error } = await supabase.from("pages").insert(rows);
    if (error) throw new Error(error.message);
    return { created: rows.length };
  });

export const updatePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Json }) => d)
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("pages")
        .update(data.patch as never)
        .eq("id", data.id)
        .select()
        .single(),
    ),
  );

export const deletePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderedIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await supabase
        .from("pages")
        .update({ position: i + 1 })
        .eq("id", data.orderedIds[i]!);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const renumberPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string; startAt: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const pages =
      unwrap(
        await supabase
          .from("pages")
          .select("id")
          .eq("yearbook_id", data.yearbookId)
          .order("position"),
      ) ?? [];
    for (let i = 0; i < pages.length; i++) {
      const { error } = await supabase
        .from("pages")
        .update({ page_number: data.startAt + i })
        .eq("id", pages[i]!.id);
      if (error) throw new Error(error.message);
    }
    return { renumbered: pages.length };
  });

export const assignPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { yearbookId: string; fromPosition: number; toPosition: number; userId: string; kind: "designer" | "proofreader" }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const pages =
      unwrap(
        await supabase
          .from("pages")
          .select("id")
          .eq("yearbook_id", data.yearbookId)
          .gte("position", data.fromPosition)
          .lte("position", data.toPosition),
      ) ?? [];
    if (!pages.length) throw new Error("No pages in that range.");
    const { error } = await supabase.from("page_assignments").upsert(
      pages.map((p) => ({
        page_id: p.id,
        yearbook_id: data.yearbookId,
        user_id: data.userId,
        kind: data.kind,
      })),
      { onConflict: "page_id,user_id,kind" },
    );
    if (error) throw new Error(error.message);
    return { assigned: pages.length };
  });

export const unassignPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("page_assignments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id?: string; pageId?: string; yearbookId?: string; label?: string; needed?: number; have?: number; position?: number }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.id) {
      const patch: Record<string, unknown> = {};
      if (data.label !== undefined) patch['label'] = data.label;
      if (data.needed !== undefined) patch['needed'] = data.needed;
      if (data.have !== undefined) patch['have'] = data.have;
      return unwrap(
        await supabase.from("page_requirements").update(patch as never).eq("id", data.id).select().single(),
      );
    }
    return unwrap(
      await supabase
        .from("page_requirements")
        .insert({
          page_id: data.pageId!,
          yearbook_id: data.yearbookId!,
          label: data.label ?? "Requirement",
          needed: data.needed ?? 0,
          have: data.have ?? 0,
          position: data.position ?? 0,
        })
        .select()
        .single(),
    );
  });

export const deleteRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("page_requirements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Asset Management ---------------- */

export const getAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    yearbookId: z.string(),
    filters: z.object({
      status: z.string().optional(),
      type: z.string().optional(),
      studentId: z.string().optional(),
      pageId: z.string().optional(),
      search: z.string().optional(),
    }).optional()
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = supabase
      .from("assets")
      .select("*, uploaded_by_profile:profiles!assets_uploaded_by_fkey(full_name, email), student:students(first_name, last_name), pages:page_assets(page:pages(id, page_number, title))")
      .eq("yearbook_id", data.yearbookId)
      .eq("is_current", true)
      .order("created_at", { ascending: false });


    if (data.filters?.status) query = query.eq("status", data.filters.status as never);
    if (data.filters?.type) query = query.eq("asset_type", data.filters.type as never);
    if (data.filters?.studentId) query = query.eq("student_id", data.filters.studentId);
    
    if (data.filters?.search) {
        query = query.ilike("file_name", `%${data.filters.search}%`);
    }

    const assets = unwrap(await query);

    // If pageId filter, we need to join through page_assets
    if (data.filters?.pageId) {
        const pageAssetIds = unwrap(
            await supabase.from("page_assets").select("asset_id").eq("page_id", data.filters.pageId)
        ).map(pa => pa.asset_id);
        return (assets ?? []).filter(a => pageAssetIds.includes(a.id));
    }

    return assets ?? [];
  });

export const getAssetDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ assetId: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const asset = unwrap(
      await supabase
        .from("assets")
        .select("*, pages:page_assets(page:pages(id, page_number, title))")
        .eq("id", data.assetId)
        .single()
    ) as YearbookAsset;

    if (!asset) throw new Error("Asset not found");

    const history = unwrap(
      await supabase
        .from("assets")
        .select("*")
        .eq("yearbook_id", asset.yearbook_id)
        .eq("file_name", asset.file_name)
        .order("version", { ascending: false })
    );

    const auditLogs = unwrap(
      await supabase
        .from("asset_audit_log")
        .select("*, performed_by_profile:profiles!asset_audit_log_performed_by_fkey(full_name)")
        .eq("asset_id", data.assetId)
        .order("created_at", { ascending: false })
    );

    return { asset, history: history ?? [], auditLogs: auditLogs ?? [] };
  });

export const createAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    yearbookId: z.string(),
    fileName: z.string(),
    fileType: z.string().optional(),
    fileSize: z.number().optional(),
    storagePath: z.string(),
    assetType: z.enum(['photo', 'document', 'pdf', 'logo', 'artwork', 'message', 'other']).default('photo'),
    studentId: z.string().optional(),
    facultyId: z.string().optional(),
    classId: z.string().optional(),
    sectionId: z.string().optional(),
    category: z.string().optional(),
    validationMetadata: z.record(z.any()).optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const existing = await supabase
        .from("assets")
        .select("id, version")
        .eq("yearbook_id", data.yearbookId)
        .eq("file_name", data.fileName)
        .eq("is_current", true)
        .maybeSingle();

    let version = 1;
    if (existing.data) {
        version = existing.data.version + 1;
        await supabase.from("assets").update({ is_current: false }).eq("id", existing.data.id);
    }

    const asset = unwrap(
      await supabase
        .from("assets")
        .insert({
          yearbook_id: data.yearbookId,
          file_name: data.fileName,
          file_type: data.fileType ?? null,
          file_size: data.fileSize ?? null,
          storage_path: data.storagePath,
          asset_type: data.assetType,
          student_id: data.studentId ?? null,
          faculty_id: data.facultyId ?? null,
          class_id: data.classId ?? null,
          section_id: data.sectionId ?? null,
          category: data.category ?? null,
          version,
          is_current: true,
          status: 'uploaded',
          uploaded_by: userId,
          validation_metadata: data.validationMetadata || {},
        })
        .select()
        .single()
    ) as YearbookAsset;

    if (!asset) throw new Error("Failed to create asset");

    await supabase.from("asset_audit_log").insert({
      asset_id: asset.id,
      yearbook_id: data.yearbookId,
      action: version > 1 ? 'replaced' : 'uploaded',
      performed_by: userId,
      new_status: 'uploaded',
      metadata: { version }
    });

    return asset;
  });

export const updateAssetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    assetId: z.string(),
    status: z.enum(['missing', 'requested', 'uploaded', 'under_review', 'approved', 'rejected', 'replacement_required', 'archived']),
    notes: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const oldAsset = unwrap(await supabase.from("assets").select("status, yearbook_id").eq("id", data.assetId).single()) as YearbookAsset;
    if (!oldAsset) throw new Error("Asset not found");
    
    const asset = unwrap(
      await supabase
        .from("assets")
        .update({ status: data.status, notes: data.notes ?? null })
        .eq("id", data.assetId)
        .select()
        .single()
    );

    await supabase.from("asset_audit_log").insert({
      asset_id: data.assetId,
      yearbook_id: oldAsset.yearbook_id,
      action: 'status_changed',
      performed_by: userId,
      old_status: oldAsset.status as any,
      new_status: data.status,
      metadata: { notes: data.notes }
    });

    return asset;
  });

export const associateAssetToPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    assetId: z.string(),
    pageId: z.string(),
    requirementId: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    
    const res = unwrap(
      await supabase
        .from("page_assets")
        .upsert({
          asset_id: data.assetId,
          page_id: data.pageId,
          requirement_id: data.requirementId ?? null,
        })
        .select()
        .single()
    );

    if (data.requirementId) {
        const countRes = await supabase
            .from("page_assets")
            .select("id", { count: 'exact', head: true })
            .eq("requirement_id", data.requirementId);
        
        if (countRes.count !== null) {
            await supabase
                .from("page_requirements")
                .update({ have: countRes.count })
                .eq("id", data.requirementId);
        }
    }

    return res;
  });

/* ---------------- Invitations ---------------- */

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    yearbookId: z.string(),
    email: z.string().email(),
    role: z.enum(['coordinator', 'staff', 'proofreader', 'corrector', 'student']),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return unwrap(
      await supabase
        .from("yearbook_invitations")
        .insert({
          yearbook_id: data.yearbookId,
          email: data.email.toLowerCase(),
          role: data.role,
          invited_by: userId,
        })
        .select()
        .single()
    );
  });

export const getInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    return unwrap(
      await context.supabase
        .from("yearbook_invitations")
        .select("*, invited_by_profile:profiles!yearbook_invitations_invited_by_fkey(full_name)")
        .eq("yearbook_id", data.yearbookId)
        .order("created_at", { ascending: false })
    );
  });

/* ---------------- Design & Canva ---------------- */

export const getCanvaConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase } = context;
    return unwrap(
      await (supabase as any)
        .from("canva_integrations")
        .select("*")
        .eq("yearbook_id", data.yearbookId)
        .maybeSingle()
    );
  });

export const updateDesignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    pageId: z.string(),
    status: z.string(),
    override: z.boolean().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    return unwrap(
      await supabase
        .from("pages")
        .update({ 
          design_status: data.status as any,
          design_readiness_override: data.override ?? false
        } as any)
        .eq("id", data.pageId)
        .select()
        .single()
    );
  });

export const connectCanvaDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    pageId: z.string(),
    canvaDesignId: z.string(),
    designUrl: z.string().optional(),
    designName: z.string().optional()
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { canvaService } = await import("./canva.server");
    const design = await canvaService.connectDesign(data.canvaDesignId);
    
    return unwrap(
      await supabase
        .from("pages")
        .update({
          canva_design_id: design.id,
          canva_design_url: data.designUrl || design.url,
          canva_design_name: (data.designName || design.name) as any,
          canva_synced_at: design.lastSyncedAt
        } as any)
        .eq("id", data.pageId)
        .select()
        .single()
    );
  });

export const createProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    yearbookId: z.string(),
    pageIds: z.array(z.string()),
    storagePath: z.string(),
    notes: z.string().optional(),
    canvaExportId: z.string().optional(),
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    
    const lastProof = await (supabase as any)
      .from("proofs")
      .select("version")
      .eq("yearbook_id", data.yearbookId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
      
    const version = ((lastProof.data as any)?.version ?? 0) + 1;
    
    const proof = unwrap(
      await (supabase as any)
        .from("proofs")
        .insert({
          yearbook_id: data.yearbookId,
          version,
          storage_path: data.storagePath,
          canva_export_id: data.canvaExportId ?? null,
          notes: data.notes ?? null,
          created_by: userId,
          status: 'ready'
        })
        .select()
        .single()
    );
    
    if (proof && data.pageIds.length > 0) {
      await (supabase as any)
        .from("proof_pages")
        .insert(data.pageIds.map(id => ({
          proof_id: (proof as any).id,
          page_id: id
        })));
    }
    
    return proof;
  });

export const getProofs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ 
    yearbookId: z.string(),
    pageId: z.string().optional()
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = (supabase as any)
      .from("proofs")
      .select("*, created_by_profile:profiles!proofs_created_by_fkey(full_name), pages:proof_pages(page_id)")
      .eq("yearbook_id", data.yearbookId)
      .order("version", { ascending: false });
      
    const proofsRes = await query;
    const proofs = unwrap(proofsRes) as any[];
    
    if (data.pageId) {
      return (proofs ?? []).filter(p => 
        (p.pages as any[]).some(pg => pg.page_id === data.pageId)
      );
    }
    
    return proofs ?? [];
  });

/* ---------------- Corrections & Approvals (Phase 4) ---------------- */

export const getCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ 
    yearbookId: z.string(),
    proofId: z.string().optional(),
    pageId: z.string().optional()
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase } = context;
    let query = (supabase as any)
      .from("corrections")
      .select(`
        *,
        created_by_profile:profiles!corrections_created_by_fkey(full_name),
        assigned_to_profile:profiles!corrections_assigned_to_fkey(full_name),
        resolved_by_profile:profiles!corrections_resolved_by_fkey(full_name),
        verified_by_profile:profiles!corrections_verified_by_fkey(full_name),
        comments:correction_comments(*, user_profile:profiles(full_name))
      `)
      .eq("yearbook_id", data.yearbookId)
      .order("created_at", { ascending: false });
    
    if (data.proofId) query = query.eq("proof_id", data.proofId);
    if (data.pageId) query = query.eq("page_id", data.pageId);

    const res = await query;
    return unwrap(res);
  });

export const createCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    yearbookId: z.string(),
    proofId: z.string(),
    pageId: z.string(),
    annotationType: z.enum(['point', 'rectangle', 'highlight', 'comment']),
    coordinates: z.record(z.any()),
    title: z.string(),
    description: z.string().optional(),
    category: z.string(),
    priority: z.string().optional(),
    assignedTo: z.string().optional()
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    const correctionRes = await (supabase as any)
        .from("corrections")
        .insert({
          yearbook_id: data.yearbookId,
          proof_id: data.proofId,
          page_id: data.pageId,
          annotation_type: data.annotationType,
          coordinates: data.coordinates,
          title: data.title,
          description: data.description ?? null,
          category: data.category as any,
          priority: data.priority ?? 'medium',
          assigned_to: data.assignedTo ?? null,
          created_by: userId,
          status: 'open'
        })
        .select()
        .single();
    
    const correction = unwrap(correctionRes) as any;

    await (supabase as any).from("production_audit_log").insert({
      yearbook_id: data.yearbookId,
      user_id: userId,
      action: 'created',
      entity_type: 'correction',
      entity_id: correction.id,
      metadata: { proof_id: data.proofId, page_id: data.pageId }
    });

    return correction;
  });

export const updateCorrectionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    correctionId: z.string(),
    status: z.enum(['open', 'acknowledged', 'in_progress', 'resolved', 'awaiting_verification', 'verified', 'closed', 'rejected', 'cancelled']),
    resolutionNotes: z.string().optional(),
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    
    const update: any = { status: data.status };
    if (data.status === 'resolved') {
      update.resolved_by = userId;
      update.resolved_at = new Date().toISOString();
      update.resolution_notes = data.resolutionNotes ?? null;
    } else if (data.status === 'verified') {
      update.verified_by = userId;
      update.verified_at = new Date().toISOString();
    }

    const res = await (supabase as any)
      .from("corrections")
      .update(update)
      .eq("id", data.correctionId)
      .select()
      .single();
    
    const correction = unwrap(res) as any;

    await (supabase as any).from("production_audit_log").insert({
      yearbook_id: correction.yearbook_id,
      user_id: userId,
      action: 'status_change',
      entity_type: 'correction',
      entity_id: correction.id,
      metadata: { new_status: data.status }
    });

    return correction;
  });

export const addCorrectionComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    correctionId: z.string(),
    content: z.string()
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    const res = await (supabase as any)
        .from("correction_comments")
        .insert({
          correction_id: data.correctionId,
          user_id: userId,
          content: data.content
        })
        .select()
        .single();
    return unwrap(res);
  });

export const approvePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    pageId: z.string(),
    proofId: z.string(),
    yearbookId: z.string()
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    
    // Check for open corrections
    const { count } = await (supabase as any)
      .from("corrections")
      .select("id", { count: 'exact', head: true })
      .eq("page_id", data.pageId)
      .eq("proof_id", data.proofId)
      .not("status", "in", "('verified', 'closed', 'rejected', 'cancelled')");

    if (count && count > 0) {
      throw new Error("Cannot approve page with open corrections.");
    }

    const approval = unwrap(
      await (supabase as any)
        .from("page_approvals")
        .upsert({
          page_id: data.pageId,
          proof_id: data.proofId,
          yearbook_id: data.yearbookId,
          approved_by: userId,
          approved_at: new Date().toISOString()
        })
        .select()
        .single()
    );

    await (supabase as any).from("production_audit_log").insert({
      yearbook_id: data.yearbookId,
      user_id: userId,
      action: 'approved',
      entity_type: 'page',
      entity_id: data.pageId,
      metadata: { proof_id: data.proofId }
    });

    return approval;
  });

export const lockYearbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    yearbookId: z.string(),
    proofId: z.string(),
    notes: z.string().optional()
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    
    const approval = unwrap(
      await (supabase as any)
        .from("yearbook_approvals")
        .insert({
          yearbook_id: data.yearbookId,
          proof_id: data.proofId,
          status: 'locked',
          notes: data.notes ?? null,
          created_by: userId
        })
        .select()
        .single()
    );

    await (supabase as any).from("production_audit_log").insert({
      yearbook_id: data.yearbookId,
      user_id: userId,
      action: 'locked',
      entity_type: 'yearbook',
      entity_id: data.yearbookId,
      metadata: { proof_id: data.proofId }
    });

    return approval;
  });

export const unlockYearbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    yearbookId: z.string(),
    proofId: z.string(),
    reason: z.string()
  }))
  .handler(async ({ data, context }): Promise<any> => {
    const { supabase, userId } = context;
    
    const approval = unwrap(
      await (supabase as any)
        .from("yearbook_approvals")
        .insert({
          yearbook_id: data.yearbookId,
          proof_id: data.proofId,
          status: 'unlocked_revision',
          reason: data.reason,
          created_by: userId
        })
        .select()
        .single()
    );

    await (supabase as any).from("production_audit_log").insert({
      yearbook_id: data.yearbookId,
      user_id: userId,
      action: 'unlocked',
      entity_type: 'yearbook',
      entity_id: data.yearbookId,
      metadata: { proof_id: data.proofId, reason: data.reason }
    });

    return approval;
  });


