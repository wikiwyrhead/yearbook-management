import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";
import { Database } from "@/integrations/supabase/types";

type Json = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (!res.data) throw new Error("Expected data but received null");
  return res.data;
}

/* ---------------- Preflight ---------------- */

export const getReadinessReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const yId = data.yearbookId;

    const [pages, corrections, reqs, proofs, approvals, lockRes] = await Promise.all([
      supabase.from("pages").select("*").eq("yearbook_id", yId).order("position"),
      supabase.from("corrections").select("*").eq("yearbook_id", yId).in("status", ["open", "acknowledged", "in_progress"]),
      supabase.from("page_requirements").select("*").eq("yearbook_id", yId),
      supabase.from("proofs").select("*").eq("yearbook_id", yId).eq("status", "ready"),
      supabase.from("page_approvals").select("*").eq("yearbook_id", yId),
      supabase.from("yearbook_approvals").select("*").eq("yearbook_id", yId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const blockers: string[] = [];
    const warnings: string[] = [];
    
    const pageList = unwrap(pages);
    const openCorrections = unwrap(corrections);
    const requirements = unwrap(reqs);
    const currentProofs = unwrap(proofs);
    const pageApprovals = unwrap(approvals);
    const lockDetails = lockRes.data;

    if (pageList.length === 0) blockers.push("Yearbook has no pages.");
    
    const unapprovedPages = pageList.filter(p => !pageApprovals.some(a => a.page_id === p.id));
    if (unapprovedPages.length > 0) {
      blockers.push(`${unapprovedPages.length} pages are not yet approved.`);
    }

    if (openCorrections.length > 0) {
      blockers.push(`${openCorrections.length} corrections are still open or in progress.`);
    }

    const unfulfilled = requirements.filter(r => (r.needed || 0) > (r.have || 0));
    if (unfulfilled.length > 0) {
      warnings.push(`${unfulfilled.length} requirements are not fully met.`);
    }
    
    const isLocked = lockDetails?.status === 'locked';

    return {
      yearbookId: yId,
      totalPages: pageList.length,
      completePages: pageList.length - unapprovedPages.length,
      openCorrections: openCorrections.length,
      blockers,
      warnings,
      ready: blockers.length === 0,
      isLocked,
      lockDetails
    };
  });

export const runPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string(), snapshotId: z.string().optional() }))
  .handler(async ({ data, context }): Promise<Database['public']['Tables']['preflight_reports']['Row']> => {
    const { supabase, userId } = context;
    const yId = data.yearbookId;

    const reportData = await getReadinessReport({ data: { yearbookId: yId } });

    const report = unwrap(
      await supabase.from("preflight_reports").insert({
        yearbook_id: yId,
        snapshot_id: data.snapshotId ?? null,
        results: {
          totalPages: reportData.totalPages,
          completePages: reportData.completePages,
          openCorrections: reportData.openCorrections,
          timestamp: new Date().toISOString()
        },
        blocking_issues: reportData.blockers,
        warnings: reportData.warnings,
        status: reportData.ready ? "PASS" : "BLOCKED",
        run_by: userId
      }).select().single()
    );

    return report;
  });

/* ---------------- Snapshots ---------------- */

export const createProductionSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }): Promise<Database['public']['Tables']['production_snapshots']['Row']> => {
    const { supabase, userId } = context;
    const yId = data.yearbookId;

    const [yearbook, pages, proofs, approvals, checklists] = await Promise.all([
      supabase.from("yearbooks").select("*").eq("id", yId).single(),
      supabase.from("pages").select("*").eq("yearbook_id", yId).order("position"),
      supabase.from("proofs").select("*").eq("yearbook_id", yId).eq("status", "ready"),
      supabase.from("page_approvals").select("*").eq("yearbook_id", yId),
      supabase.from("proofreader_checklists").select("*").eq("yearbook_id", yId),
    ]);

    const yData = unwrap(yearbook);
    const pData = unwrap(pages);
    const prData = unwrap(proofs);
    const appData = unwrap(approvals);
    const chData = unwrap(checklists);

    const { data: latest } = await supabase
      .from("production_snapshots")
      .select("version")
      .eq("yearbook_id", yId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const nextVersion = (latest?.version || 0) + 1;

    const snapshot = unwrap(
      await supabase.from("production_snapshots").insert({
        yearbook_id: yId,
        version: nextVersion,
        snapshot_data: {
          yearbook: yData,
          pages: pData,
          proofs: prData,
          approvals: appData,
          checklists: chData,
          timestamp: new Date().toISOString()
        },
        created_by: userId
      }).select().single()
    );

    await supabase.from("production_audit_log").insert({
      yearbook_id: yId,
      user_id: userId,
      action: "SNAPSHOT_CREATED",
      entity_type: "production_snapshot",
      entity_id: snapshot.id,
      metadata: { version: nextVersion }
    });

    return snapshot;
  });

/* ---------------- Packages ---------------- */

export const generateProductionPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string(), snapshotId: z.string() }))
  .handler(async ({ data, context }): Promise<Database['public']['Tables']['production_packages']['Row']> => {
    const { supabase, userId } = context;
    const { yearbookId, snapshotId } = data;

    const snapshot = unwrap(
      await supabase.from("production_snapshots").select("*").eq("id", snapshotId).single()
    );

    const manifest = {
      files: [
        { name: `yearbook_${yearbookId}_v${snapshot.version}.pdf`, type: "application/pdf", size: 52428800 },
        { name: "manifest.json", type: "application/json", size: 1024 },
        { name: "preflight_report.pdf", type: "application/pdf", size: 204800 }
      ],
      snapshot_version: snapshot.version,
      generated_at: new Date().toISOString()
    };

    const checksum = createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex");

    const pkg = unwrap(
      await supabase.from("production_packages").insert({
        yearbook_id: yearbookId,
        snapshot_id: snapshotId,
        manifest: manifest as any,
        storage_path: `yearbooks/${yearbookId}/production/v${snapshot.version}/`,
        checksum_sha256: checksum,
        generated_by: userId
      }).select().single()
    );

    await supabase.from("production_audit_log").insert({
      yearbook_id: yearbookId,
      user_id: userId,
      action: "PACKAGE_GENERATED",
      entity_type: "production_package",
      entity_id: pkg.id,
      metadata: { snapshot_version: snapshot.version }
    });

    return pkg;
  });

/* ---------------- Submissions ---------------- */

export const createSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ 
    yearbookId: z.string(), 
    snapshotId: z.string(), 
    packageId: z.string(), 
    serviceBureauId: z.string(),
    notes: z.string().optional()
  }))
  .handler(async ({ data, context }): Promise<Database['public']['Tables']['service_bureau_submissions']['Row']> => {
    const { supabase, userId } = context;
    
    const submission = unwrap(
      await supabase.from("service_bureau_submissions").insert({
        yearbook_id: data.yearbookId,
        snapshot_id: data.snapshotId,
        package_id: data.packageId,
        service_bureau_id: data.serviceBureauId,
        status: "READY",
        notes: data.notes ?? null,
        submitted_by: userId
      }).select().single()
    );

    return submission;
  });

export const updateSubmissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ 
    submissionId: z.string(), 
    status: z.string(), 
    externalReference: z.string().optional(),
    notes: z.string().optional()
  }))
  .handler(async ({ data, context }): Promise<Database['public']['Tables']['service_bureau_submissions']['Row']> => {
    const { supabase, userId } = context;

    const currentSub = unwrap(
      await supabase.from("service_bureau_submissions").select("*").eq("id", data.submissionId).single()
    );

    const update: any = {
      status: data.status,
      external_reference: data.externalReference ?? currentSub.external_reference,
      notes: data.notes ?? currentSub.notes,
      updated_at: new Date().toISOString()
    };
    
    if (data.status === 'SUBMITTED') {
      update.submitted_at = new Date().toISOString();
    }

    const submission = unwrap(
      await supabase.from("service_bureau_submissions").update(update).eq("id", data.submissionId).select().single()
    );

    await supabase.from("production_audit_log").insert({
      yearbook_id: submission.yearbook_id,
      user_id: userId,
      action: "SUBMISSION_UPDATED",
      entity_type: "service_bureau_submission",
      entity_id: submission.id,
      metadata: { new_status: data.status }
    });

    return submission;
  });

export const getProductionDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ yearbookId: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const yId = data.yearbookId;

    const [snapshots, packages, submissions, reports, serviceBureaus] = await Promise.all([
      supabase.from("production_snapshots").select("*").eq("yearbook_id", yId).order("version", { ascending: false }),
      supabase.from("production_packages").select("*").eq("yearbook_id", yId).order("created_at", { ascending: false }),
      supabase.from("service_bureau_submissions").select("*, service_bureaus(*)").eq("yearbook_id", yId).order("updated_at", { ascending: false }),
      supabase.from("preflight_reports").select("*").eq("yearbook_id", yId).order("created_at", { ascending: false }),
      supabase.from("service_bureaus").select("*")
    ]);

    return {
      snapshots: unwrap(snapshots),
      packages: unwrap(packages),
      submissions: unwrap(submissions),
      reports: unwrap(reports),
      serviceBureaus: unwrap(serviceBureaus)
    };
  });
