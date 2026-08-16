/**
 * Yearbook System - Phase 2 Asset Management
 * 
 * Architecture Decisions:
 * 1. Multi-tenancy: Enforced at the RLS level using security definer functions.
 * 2. Page Management: decoupled 'position' (internal order) from 'page_number' (display/print).
 * 3. Roles: Hierarchical (Super Admin > Coordinator > Staff > Proofreader > Corrector > Student).
 * 4. Canva: Fields pre-allocated for Phase 2 integration.
 * 5. Assets: Centralized library with versioning and audit trails.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Json = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

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
      yearbooks: (yearbooks ?? []).map((y) => ({
        ...y,
        myRoles: roleByYearbook[y.id] ?? (isSuperAdmin ? ["super_admin"] : []),
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

    return {
      yearbook,
      myRoles: isSuperAdmin ? [...myRoles, "super_admin"] : myRoles,
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
