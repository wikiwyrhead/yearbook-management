import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";

type Json = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/* ---------------- Preflight ---------------- */

export const runPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const yId = data.yearbookId;

    // 1. Fetch current yearbook state
    const [pages, corrections, reqs, proofs] = await Promise.all([
      supabase.from("pages").select("*").eq("yearbook_id", yId).order("position"),
      supabase.from("corrections").select("*").eq("yearbook_id", yId).eq("status", "OPEN"),
      supabase.from("page_requirements").select("*").eq("yearbook_id", yId),
      supabase.from("proofs").select("*").eq("yearbook_id", yId).eq("is_current", true),
    ]);

    const blockers: string[] = [];
    const warnings: string[] = [];
    const results: Record<string, any> = {};

    const pageList = unwrap(pages) || [];
    const openCorrections = unwrap(corrections) || [];
    const requirements = unwrap(reqs) || [];
    const currentProofs = unwrap(proofs) || [];

    // Check: Correct page count (min 1)
    if (pageList.length === 0) blockers.push("Yearbook has no pages.");
    
    // Check: Page approvals
    const unapprovedPages = pageList.filter(p => !p.is_approved);
    if (unapprovedPages.length > 0) {
      blockers.push(`${unapprovedPages.length} pages are not yet approved.`);
    }

    // Check: Open corrections
    if (openCorrections.length > 0) {
      blockers.push(`${openCorrections.length} corrections are still OPEN.`);
    }

    // Check: Requirements
    const unfulfilled = requirements.filter(r => (r.needed || 0) > (r.have || 0));
    if (unfulfilled.length > 0) {
      warnings.push(`${unfulfilled.length} requirements are not fully met.`);
    }

    // Check: Proofs for all pages
    const pagesWithoutProof = pageList.filter(p => !currentProofs.some(pr => pr.page_id === p.id));
    if (pagesWithoutProof.length > 0) {
      blockers.push(`${pagesWithoutProof.length} pages are missing a current proof.`);
    }

    const status = blockers.length > 0 ? "BLOCKED" : "PASS";

    const report = unwrap(
      await supabase.from("preflight_reports").insert({
        yearbook_id: yId,
        results: {
          pageCount: pageList.length,
          openCorrectionsCount: openCorrections.length,
          unapprovedPagesCount: unapprovedPages.length,
          timestamp: new Date().toISOString()
        },
        blocking_issues: blockers,
        warnings: warnings,
        status: status,
        run_by: userId
      }).select().single()
    );

    return report;
  });

/* ---------------- Snapshots ---------------- */

export const createProductionSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const yId = data.yearbookId;

    // 1. Get current state in detail
    const [yearbook, pages, proofs, assets, approvals, checklists] = await Promise.all([
      supabase.from("yearbooks").select("*").eq("id", yId).single(),
      supabase.from("pages").select("*").eq("yearbook_id", yId).order("position"),
      supabase.from("proofs").select("*").eq("yearbook_id", yId).eq("is_current", true),
      supabase.from("page_assets").select("*, assets(*)").eq("yearbook_id", yId),
      supabase.from("page_approvals").select("*").eq("yearbook_id", yId),
      supabase.from("proofreader_checklists").select("*").eq("yearbook_id", yId),
    ]);

    const yData = unwrap(yearbook);
    const pData = unwrap(pages) || [];
    const prData = unwrap(proofs) || [];
    const aData = unwrap(assets) || [];
    const appData = unwrap(approvals) || [];
    const chData = unwrap(checklists) || [];

    // Get current max version
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
          assets: aData,
          approvals: appData,
          checklists: chData,
          timestamp: new Date().toISOString()
        },
        created_by: userId
      }).select().single()
    );

    // Audit log
    await supabase.from("production_audit_log").insert({
      yearbook_id: yId,
      action: "SNAPSHOT_CREATED",
      details: `Created Production Snapshot #${nextVersion}`,
      user_id: userId
    });

    return snapshot;
  });

/* ---------------- Packages ---------------- */

export const generateProductionPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string; snapshotId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { yearbookId, snapshotId } = data;

    // 1. Verify snapshot
    const snapshot = unwrap(
      await supabase.from("production_snapshots").select("*").eq("id", snapshotId).single()
    );

    // 2. Mock file generation & compute real manifest/checksums
    // In a real system, we'd trigger a PDF merge/bundle here.
    const manifest = {
      files: [
        { name: `yearbook_${yearbookId}_v${snapshot.version}.pdf`, type: "application/pdf", size: 52428800 },
        { name: "manifest.json", type: "application/json", size: 1024 },
        { name: "preflight_report.pdf", type: "application/pdf", size: 204800 }
      ],
      snapshot_version: snapshot.version,
      generated_at: new Date().toISOString()
    };

    // Calculate a dummy but consistent SHA-256 for the "package" record
    const checksum = createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex");

    const pkg = unwrap(
      await supabase.from("production_packages").insert({
        yearbook_id: yearbookId,
        snapshot_id: snapshotId,
        manifest: manifest,
        storage_path: `yearbooks/${yearbookId}/production/v${snapshot.version}/`,
        checksum_sha256: checksum,
        generated_by: userId
      }).select().single()
    );

    await supabase.from("production_audit_log").insert({
      yearbook_id: yearbookId,
      action: "PACKAGE_GENERATED",
      details: `Generated Production Package for Snapshot #${snapshot.version}`,
      user_id: userId
    });

    return pkg;
  });

/* ---------------- Submissions ---------------- */

export const createSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { 
    yearbookId: string; 
    snapshotId: string; 
    packageId: string; 
    serviceBureauId: string;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    const submission = unwrap(
      await supabase.from("service_bureau_submissions").insert({
        yearbook_id: data.yearbookId,
        snapshot_id: data.snapshotId,
        package_id: data.packageId,
        service_bureau_id: data.serviceBureauId,
        status: "READY",
        notes: data.notes,
        submitted_by: userId
      }).select().single()
    );

    return submission;
  });

export const updateSubmissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { 
    submissionId: string; 
    status: string; 
    externalReference?: string;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const submission = unwrap(
      await supabase.from("service_bureau_submissions").update({
        status: data.status,
        external_reference: data.externalReference,
        notes: data.notes,
        submitted_at: data.status === 'SUBMITTED' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString()
      } as any).eq("id", data.submissionId).select().single()
    );

    await supabase.from("production_audit_log").insert({
      yearbook_id: submission.yearbook_id,
      action: "SUBMISSION_UPDATED",
      details: `Submission status changed to ${data.status}`,
      user_id: userId
    });

    return submission;
  });

export const getProductionDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { yearbookId: string }) => d)
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
      snapshots: unwrap(snapshots) || [],
      packages: unwrap(packages) || [],
      submissions: unwrap(submissions) || [],
      reports: unwrap(reports) || [],
      serviceBureaus: unwrap(serviceBureaus) || []
    };
  });
