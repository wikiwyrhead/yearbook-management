import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileCheck,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Clock,
  Lock,
  Unlock,
  ChevronRight,
  Eye,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  getCorrections,
  approvePage,
  lockYearbook,
  unlockYearbook,
} from "@/lib/yearbook.functions";
import {
  getReadinessReport,
  getProofSignoffStatusFn,
  submitGovernanceSignoffFn,
  emergencyReleaseOverrideFn,
  lockProofRoundFn,
  coordinatorApproveCorrectionFn,
} from "@/lib/production.functions";
import { FinalSignoffDashboard } from "@/components/yearbook/governance/FinalSignoffDashboard";

interface ProofreadingCenterProps {
  yearbookId: string;
  canManage: boolean;
  onViewProof: (proofId: string, pageId?: string) => void;
}

export function ProofreadingCenter({
  yearbookId,
  canManage,
  onViewProof,
}: ProofreadingCenterProps) {
  const qc = useQueryClient();
  const fetchReport = useServerFn(getReadinessReport);
  const fetchCorrections = useServerFn(getCorrections);
  const fetchSignoffs = useServerFn(getProofSignoffStatusFn);
  const submitSignoff = useServerFn(submitGovernanceSignoffFn);
  const emergencyOverride = useServerFn(emergencyReleaseOverrideFn);
  const lockRound = useServerFn(lockProofRoundFn);
  const approveCorrection = useServerFn(coordinatorApproveCorrectionFn);

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["readiness", yearbookId],
    queryFn: () => fetchReport({ data: { yearbookId } }),
  });

  const { data: corrections } = useQuery({
    queryKey: ["corrections", yearbookId],
    queryFn: () => fetchCorrections({ data: { yearbookId } }),
  });

  const proofId = report?.lockDetails?.proof_id;

  const { data: signoffStatus } = useQuery({
    queryKey: ["proofSignoffStatus", proofId],
    queryFn: () => fetchSignoffs({ data: { proofId: proofId! } }),
    enabled: !!proofId,
  });

  const mLock = useMutation({
    mutationFn: async (notes?: string) => {
      if (proofId) {
        await lockRound({ data: { proofId, lockNotes: notes } });
      }
    },
    onSuccess: () => {
      toast.success("Proof round locked and frozen for Canva revisions");
      qc.invalidateQueries({ queryKey: ["readiness", yearbookId] });
      qc.invalidateQueries({ queryKey: ["proofSignoffStatus", proofId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to lock proof round");
    },
  });

  const mSign = useMutation({
    mutationFn: async ({
      decision,
      notes,
    }: {
      decision: "approved" | "approved_with_notes" | "changes_requested";
      notes?: string;
    }) => {
      if (!proofId) return;
      await submitSignoff({ data: { proofId, decision, notes } });
    },
    onSuccess: () => {
      toast.success("Institutional governance signoff recorded successfully");
      qc.invalidateQueries({ queryKey: ["proofSignoffStatus", proofId] });
      qc.invalidateQueries({ queryKey: ["readiness", yearbookId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit signoff decision");
    },
  });

  const mOverride = useMutation({
    mutationFn: async (justification: string) => {
      if (!proofId) return;
      await emergencyOverride({
        data: { proofId, writtenJustification: justification },
      });
    },
    onSuccess: () => {
      toast.success("Emergency escalation recorded in audit trail");
      qc.invalidateQueries({ queryKey: ["proofSignoffStatus", proofId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to record emergency escalation");
    },
  });

  const mApproveCorrection = useMutation({
    mutationFn: async (correctionId: string) => {
      await approveCorrection({ data: { correctionId } });
    },
    onSuccess: () => {
      toast.success("Correction approved into Canva Implementation Task");
      qc.invalidateQueries({ queryKey: ["corrections", yearbookId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to approve correction");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card border border-border p-6 rounded-xl shadow-xs">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileCheck className="size-5 text-primary" /> Proofreading &amp; Quality Control Center
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review live PDF spreads, submit spatial pin/box corrections, and record governance
            signoffs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {proofId && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onViewProof(proofId)}
              className="gap-1.5"
            >
              <Eye className="size-3.5" /> View PDF Proof
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="plate p-6 space-y-4 md:col-span-2">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-base">Proofing Progress</h3>
            <span className="text-sm font-medium">
              {report?.totalPages
                ? Math.round((report.completePages / report.totalPages) * 100)
                : 0}
              % Ready
            </span>
          </div>
          <Progress
            value={
              report?.totalPages ? Math.round((report.completePages / report.totalPages) * 100) : 0
            }
            className="h-2"
          />

          <div className="grid grid-cols-3 gap-4 pt-4 border-t text-center">
            <div>
              <div className="text-2xl font-bold">{report?.completePages || 0}</div>
              <div className="text-xs text-muted-foreground">Complete Pages</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-500">
                {Math.max(0, (report?.totalPages || 0) - (report?.completePages || 0))}
              </div>
              <div className="text-xs text-muted-foreground">In Review</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">
                {corrections?.filter((c: any) => c.status !== "resolved").length || 0}
              </div>
              <div className="text-xs text-muted-foreground">Open Corrections</div>
            </div>
          </div>
        </div>

        <div className="plate p-6 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base">Production Lock Status</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Locking an official proof round freezes its pages and corrections, and enables Canva
              task execution.
            </p>
          </div>

          {canManage && (
            <div className="pt-4 border-t">
              {report?.isLocked ? (
                <div className="space-y-2">
                  <Badge
                    variant="outline"
                    className="w-full justify-center py-1.5 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 text-xs"
                  >
                    <Lock className="size-3.5 mr-1.5" /> Proof Round Locked
                  </Badge>
                </div>
              ) : (
                <Button
                  variant="default"
                  className="w-full text-xs"
                  onClick={() => mLock.mutate("Pre-flight review completed")}
                  disabled={!proofId || mLock.isPending}
                >
                  <Lock className="size-3.5 mr-1.5" /> Lock Proof Round
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Institutional Governance Signoff Dashboard (Live Data) */}
      {proofId && signoffStatus && (
        <FinalSignoffDashboard
          proofId={proofId}
          roundName="Candidate Proof Round"
          checksumSha256={signoffStatus.checksumSha256}
          proofVersionStatus={signoffStatus.proofVersionStatus}
          signatories={signoffStatus.signatories.map((s) => ({
            role: s.role,
            roleTitle:
              s.role === "editor_in_chief"
                ? "Editor-in-Chief"
                : s.role === "coordinator"
                  ? "Yearbook Coordinator"
                  : s.role === "principal"
                    ? "School Principal"
                    : "School Director",
            designatedUserName: s.signatoryName,
            designatedUserEmail: s.signatoryEmail,
            decision: s.decision,
            notes: s.notes,
            decidedAt: s.decidedAt,
          }))}
          isSuperAdmin={canManage}
          onSign={(decision, notes) =>
            mSign.mutateAsync({ decision, ...(notes !== undefined ? { notes } : {}) })
          }
          onEmergencyOverride={(justification) => mOverride.mutateAsync(justification)}
        />
      )}

      {/* Recent Corrections List with Coordinator Approval */}
      <div className="plate overflow-hidden">
        <div className="bg-muted/50 p-3 border-b flex items-center justify-between">
          <h3 className="font-medium text-sm">
            Reviewer Corrections &amp; Canva Implementation Tasks
          </h3>
          <span className="text-xs text-muted-foreground">
            {corrections?.length || 0} total corrections
          </span>
        </div>
        <div className="divide-y max-h-[400px] overflow-y-auto">
          {corrections?.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No corrections reported yet for this round.
            </div>
          ) : (
            corrections?.slice(0, 15).map((c: any) => (
              <div
                key={c.id}
                className="p-4 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {c.status === "acknowledged" || c.status === "resolved" ? (
                      <CheckCircle className="size-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {c.title || `Correction on Page ${c.page_number || "—"}`}
                      </span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {c.severity || "medium"}
                      </Badge>
                      <Badge
                        className={
                          c.status === "acknowledged" || c.status === "resolved"
                            ? "bg-emerald-600 text-white text-[10px]"
                            : "bg-muted text-muted-foreground text-[10px]"
                        }
                      >
                        {c.status === "acknowledged"
                          ? "Approved for Canva"
                          : c.status === "resolved"
                            ? "Resolved"
                            : c.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {c.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canManage && c.status !== "acknowledged" && c.status !== "resolved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => mApproveCorrection.mutate(c.id)}
                      disabled={mApproveCorrection.isPending}
                      className="text-xs h-7 gap-1"
                      title="Approve as actionable Canva Implementation Task"
                    >
                      <Check className="size-3" /> Approve for Canva
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
