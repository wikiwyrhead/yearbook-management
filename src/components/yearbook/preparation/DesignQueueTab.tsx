import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Layers,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Send,
  AlertCircle,
  FileCheck,
  Lock,
  Printer,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getDesignQueueFn,
  queueDesignPacketAssetTransfersFn,
  getWholeYearbookReadinessStatusFn,
  createWholeYearbookReadinessManifestFn,
} from "@/lib/preparation.functions";
import { getCanvaFolderScopeStatusFn } from "@/lib/design.functions";

interface DesignQueueTabProps {
  yearbookId: string;
  isSuperAdmin?: boolean;
}

export function DesignQueueTab({ yearbookId, isSuperAdmin = false }: DesignQueueTabProps) {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(getDesignQueueFn);
  const queueTransfers = useServerFn(queueDesignPacketAssetTransfersFn);
  const fetchReadiness = useServerFn(getWholeYearbookReadinessStatusFn);
  const approveGate = useServerFn(createWholeYearbookReadinessManifestFn);
  const fetchFolderScopes = useServerFn(getCanvaFolderScopeStatusFn);

  const {
    data: queueItems = [],
    isLoading: isQueueLoading,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ["designQueue", yearbookId],
    queryFn: () => fetchQueue({ data: { yearbookId } }),
  });

  const {
    data: readiness,
    isLoading: isReadinessLoading,
    refetch: refetchReadiness,
  } = useQuery({
    queryKey: ["wholeYearbookReadiness", yearbookId],
    queryFn: () => fetchReadiness({ data: { yearbookId } }),
  });

  const { data: folderScopeStatus } = useQuery({
    queryKey: ["canvaFolderScopeStatus"],
    queryFn: () => fetchFolderScopes(),
    enabled: isSuperAdmin,
  });

  const mApproveGate = useMutation({
    mutationFn: () => approveGate({ data: { yearbookId } }),
    onSuccess: (res) => {
      toast.success(
        `Whole-Yearbook Readiness Gate approved! (${res.pageCount} pages verified, Manifest v${res.version})`,
      );
      qc.invalidateQueries({ queryKey: ["wholeYearbookReadiness", yearbookId] });
      qc.invalidateQueries({ queryKey: ["designQueue", yearbookId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to approve Whole-Yearbook Readiness Gate");
    },
  });

  const mTransfer = useMutation({
    mutationFn: (snapshotId: string) => queueTransfers({ data: { snapshotId } }),
    onSuccess: (res: any) => {
      toast.success(`Queued ${res?.queuedCount || 0} verified assets for Canva transfer.`);
      qc.invalidateQueries({ queryKey: ["designQueue", yearbookId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to queue Canva asset transfer");
    },
  });

  const isLoading = isQueueLoading || isReadinessLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-6 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Layers className="size-5 text-primary" /> Design Integration & Preparation Queue
            </h2>
            <Badge
              variant="outline"
              className="text-xs bg-primary/10 text-primary border-primary/20"
            >
              Whole-Yearbook Gate
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Linear governance pipeline: Editorial Member ➔ Coordinator Approval ➔ Immutable Snapshot
            ➔ Super Admin Readiness Gate ➔ Canva Transfer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchQueue();
              refetchReadiness();
            }}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Canva Folder Scope Status Banner */}
      {isSuperAdmin && folderScopeStatus?.status === "reauthorization_required" && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-xs">
          <AlertCircle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <span className="font-semibold text-sm">
              Canva Folder Authorization Update Required
            </span>
            <p className="text-muted-foreground text-amber-800 dark:text-amber-300">
              The active Canva connection lacks new folder scopes (
              <code className="font-mono bg-muted/60 px-1 py-0.5 rounded">folder:read</code>,{" "}
              <code className="font-mono bg-muted/60 px-1 py-0.5 rounded">folder:write</code>).
              Automatic edition folder creation and asset grouping are paused until the Super Admin
              reconnects Canva.
            </p>
          </div>
        </div>
      )}

      {/* Whole-Yearbook Readiness Gate Card */}
      {readiness && (
        <div
          className={`p-6 rounded-xl border transition-all ${
            readiness.isGateApproved
              ? "bg-emerald-500/5 border-emerald-500/30"
              : readiness.isReadyForGate
                ? "bg-primary/5 border-primary/30"
                : "bg-amber-500/5 border-amber-500/30"
          }`}
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={`size-5 ${
                    readiness.isGateApproved
                      ? "text-emerald-500"
                      : readiness.isReadyForGate
                        ? "text-primary"
                        : "text-amber-500"
                  }`}
                />
                <h3 className="text-base font-bold text-foreground">
                  Whole-Yearbook Readiness Gate
                </h3>
                {readiness.isGateApproved ? (
                  <Badge className="bg-emerald-600 text-white text-xs">Gate Approved</Badge>
                ) : readiness.isManifestStale ? (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <AlertCircle className="size-3" /> Manifest Stale — Re-approval Required
                  </Badge>
                ) : readiness.isReadyForGate ? (
                  <Badge className="bg-primary text-primary-foreground text-xs">
                    Ready for Approval
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs"
                  >
                    Readiness In Progress
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {readiness.approvedPagesCount} of {readiness.expectedPageCount} pages approved by
                Coordinator.
                {readiness.preliminarySpecsConfirmed
                  ? " • Preliminary print specs confirmed."
                  : " • Preliminary print specs NOT confirmed."}
              </p>
              {readiness.isManifestStale && (
                <p className="text-xs font-semibold text-destructive pt-1">
                  A successor page snapshot was created after the manifest was approved. Super Admin
                  must re-approve the Whole-Yearbook Gate.
                </p>
              )}
              {readiness.manifestSha256 && (
                <p className="text-[11px] font-mono text-muted-foreground pt-1">
                  Active Manifest SHA-256: {readiness.manifestSha256.slice(0, 16)}...
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isSuperAdmin && (!readiness.isGateApproved || readiness.isManifestStale) && (
                <Button
                  size="sm"
                  disabled={!readiness.isReadyForGate || mApproveGate.isPending}
                  onClick={() => mApproveGate.mutate()}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ShieldCheck className="size-4" /> Approve Whole-Yearbook Gate
                </Button>
              )}
            </div>
          </div>

          {/* Unapproved Pages Warning if any */}
          {readiness.unapprovedPages.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/60 text-xs space-y-2">
              <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="size-4" /> {readiness.unapprovedPages.length} pages pending
                Coordinator approval:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {readiness.unapprovedPages.map((p) => (
                  <span
                    key={p.physical_index}
                    className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 text-[11px]"
                  >
                    Page {p.physical_index} ({p.display_page_label})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Queue Items */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2 text-sm">
          <RefreshCw className="size-4 animate-spin text-primary" /> Loading Design Integration
          Queue...
        </div>
      ) : queueItems.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-border rounded-xl bg-card/50 space-y-3">
          <FileCheck className="size-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold text-foreground">
            No Approved Packets in Design Queue
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Pages appear here once Editorial Members finalize preparation and the Coordinator
            authorizes the page snapshot.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {queueItems.map((item: any) => (
            <div
              key={item.snapshot_id || item.page_id}
              className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold">
                    Page {item.physical_index} • {item.display_page_label}
                  </span>
                  <h4 className="text-sm font-bold text-foreground line-clamp-1 mt-0.5">
                    {item.title || `Page ${item.physical_index}`}
                  </h4>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  v{item.version}
                </Badge>
              </div>

              <div className="text-xs space-y-1.5 text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Coordinator Approval</span>
                  {item.coordinator_approved ? (
                    <Badge className="bg-emerald-600 text-white text-[10px]">Approved</Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-500 text-[10px]">
                      Pending
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] font-mono truncate text-muted-foreground/70">
                  SHA: {item.snapshot_sha256 ? `${item.snapshot_sha256.slice(0, 16)}...` : "—"}
                </p>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!readiness?.isGateApproved || mTransfer.isPending}
                  onClick={() => mTransfer.mutate(item.snapshot_id)}
                  className="w-full text-xs gap-1.5 h-8"
                  title={
                    !readiness?.isGateApproved
                      ? "Whole-Yearbook Readiness Gate must be approved by Super Admin first"
                      : "Transfer verified assets to Canva"
                  }
                >
                  <Send className="size-3" /> Transfer to Canva
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
