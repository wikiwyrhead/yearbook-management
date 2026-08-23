import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Palette,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Upload,
  ListChecks,
  MessageSquare,
  Sparkles,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  getLadder,
  updatePage,
  updateCorrectionStatus,
  getCorrections,
  getAssets,
} from "@/lib/yearbook.functions";
import { BulkUpload } from "../assets/BulkUpload";

interface StaffWorkbenchProps {
  yearbookId: string;
  userId: string;
  sections: Array<{ id: string; name: string; color?: string }>;
  statuses: Array<{ id: string; name: string; color: string; is_terminal?: boolean }>;
  pageTypes: Array<{ id: string; name: string }>;
  onOpenAssetLibrary?: () => void;
  onOpenProofing?: () => void;
}

export function StaffWorkbench({
  yearbookId,
  userId,
  sections,
  statuses,
  pageTypes,
  onOpenAssetLibrary,
  onOpenProofing,
}: StaffWorkbenchProps) {
  const qc = useQueryClient();
  const fetchLadder = useServerFn(getLadder);
  const fetchCorrections = useServerFn(getCorrections);
  const doUpdatePage = useServerFn(updatePage);
  const doUpdateCorrection = useServerFn(updateCorrectionStatus);

  const key = ["ladder", yearbookId];
  const { data: ladderData, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchLadder({ data: { yearbookId } }),
  });

  const { data: correctionsData } = useQuery({
    queryKey: ["corrections", yearbookId],
    queryFn: () => fetchCorrections({ data: { yearbookId } }),
  });

  const allPages = ladderData?.pages ?? [];
  const allAssignments = ladderData?.assignments ?? [];
  const allRequirements = ladderData?.requirements ?? [];
  const allCorrections = correctionsData ?? [];

  // Filter pages assigned to current user
  const myAssignedPageIds = useMemo(() => {
    return new Set(
      (allAssignments as any[]).filter((a: any) => a.user_id === userId).map((a: any) => a.page_id),
    );
  }, [allAssignments, userId]);

  const myPages = useMemo(() => {
    // If the user has explicitly assigned pages, show them; otherwise show all pages for general staff
    if (myAssignedPageIds.size > 0) {
      return (allPages as any[]).filter((p: any) => myAssignedPageIds.has(p.id));
    }
    return allPages as any[];
  }, [allPages, myAssignedPageIds]);

  const myRequirements = useMemo(() => {
    const pageIdSet = new Set((myPages as any[]).map((p: any) => p.id));
    return (allRequirements as any[]).filter((r: any) => pageIdSet.has(r.page_id));
  }, [allRequirements, myPages]);

  const myCorrections = useMemo(() => {
    const pageIdSet = new Set((myPages as any[]).map((p: any) => p.id));
    return allCorrections.filter((c: any) => pageIdSet.has(c.page_id));
  }, [allCorrections, myPages]);

  const totalReqNeeded = (myRequirements as any[]).reduce(
    (sum: number, r: any) => sum + (r.needed || 0),
    0,
  );
  const totalReqHave = (myRequirements as any[]).reduce(
    (sum: number, r: any) => sum + (r.have || 0),
    0,
  );
  const openCorrections = myCorrections.filter((c: any) => c.status !== "resolved");

  const mUpdateStatus = useMutation({
    mutationFn: (v: { id: string; statusId: string }) =>
      doUpdatePage({ data: { id: v.id, patch: { status_id: v.statusId } } }),
    onSuccess: () => {
      toast.success("Page status updated");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mResolveCorrection = useMutation({
    mutationFn: (correctionId: string) =>
      doUpdateCorrection({ data: { correctionId, status: "resolved" } }),
    onSuccess: () => {
      toast.success("Correction marked as resolved");
      qc.invalidateQueries({ queryKey: ["corrections", yearbookId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        <p>Loading your assigned workspace…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Workbench Header Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="plate p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>My Assigned Spreads</span>
            <Layers className="size-4 text-primary" />
          </div>
          <p className="text-3xl font-display font-bold">{myPages.length}</p>
          <p className="text-[11px] text-muted-foreground">
            {myAssignedPageIds.size > 0
              ? "Directly assigned to you"
              : "All available project pages"}
          </p>
        </div>

        <div className="plate p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Photo Assets Needed</span>
            <ListChecks className="size-4 text-blue-500" />
          </div>
          <p className="text-3xl font-display font-bold">
            {totalReqHave}{" "}
            <span className="text-lg font-normal text-muted-foreground">/ {totalReqNeeded}</span>
          </p>
          <Progress
            aria-label="Photo assets requirement progress"
            value={totalReqNeeded > 0 ? Math.min(100, (totalReqHave / totalReqNeeded) * 100) : 100}
            className="h-1.5"
          />
        </div>

        <div className="plate p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Open Revisions / Fixes</span>
            <MessageSquare className="size-4 text-amber-500" />
          </div>
          <p className="text-3xl font-display font-bold text-amber-600 dark:text-amber-400">
            {openCorrections.length}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Feedback from coordinator & proofreaders
          </p>
        </div>

        <div className="plate p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
            <span>Quick Actions</span>
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="pt-2 flex gap-2">
            <BulkUpload
              yearbookId={yearbookId}
              label="Upload Assets"
              onDone={() => qc.invalidateQueries({ queryKey: key })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Assigned Pages Grid */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Palette className="size-5 text-primary" /> My Spreads & Layouts
              </h2>
              <p className="text-xs text-muted-foreground">
                Build, review requirements, and update page statuses
              </p>
            </div>
            <Badge variant="outline">{myPages.length} Pages</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(myPages as any[]).map((p: any) => {
              const sec = sections.find((s: any) => s.id === p.section_id);
              const stat = statuses.find((s: any) => s.id === p.status_id);
              const pReqs = (allRequirements as any[]).filter((r: any) => r.page_id === p.id);
              const pCorrs = allCorrections.filter(
                (c: any) => c.page_id === p.id && c.status !== "resolved",
              );

              return (
                <div
                  key={p.id}
                  className="plate p-4 space-y-3 flex flex-col justify-between border hover:border-primary/50 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold bg-muted px-2 py-0.5 rounded">
                          p.{p.page_number}
                        </span>
                        {sec && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded text-white"
                            style={{ backgroundColor: sec.color || "#3b82f6" }}
                          >
                            {sec.name}
                          </span>
                        )}
                      </div>

                      {stat && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] capitalize"
                          style={{
                            backgroundColor: `${stat.color}15`,
                            color: stat.color,
                            borderColor: `${stat.color}30`,
                          }}
                        >
                          {stat.name}
                        </Badge>
                      )}
                    </div>

                    <h3 className="font-display font-semibold text-base leading-tight truncate">
                      {p.title || `Page ${p.page_number}`}
                    </h3>

                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                    )}
                  </div>

                  {/* Requirements Progress */}
                  {pReqs.length > 0 && (
                    <div className="space-y-1 bg-muted/40 p-2 rounded text-xs">
                      <span className="font-medium text-[11px] text-muted-foreground">
                        Required Photos:
                      </span>
                      {pReqs.map((r: any) => (
                        <div key={r.id} className="flex items-center justify-between text-[11px]">
                          <span className="truncate">{r.label}</span>
                          <span
                            className={
                              r.have >= r.needed
                                ? "text-green-600 font-bold"
                                : "text-amber-600 font-bold"
                            }
                          >
                            {r.have}/{r.needed}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Open Corrections Alert */}
                  {pCorrs.length > 0 && (
                    <div className="bg-destructive/10 text-destructive p-2 rounded text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1 font-medium">
                        <AlertCircle className="size-3" /> {pCorrs.length} Open Revision
                        {pCorrs.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs h-8 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20"
                      onClick={() => {
                        if (onOpenAssetLibrary) onOpenAssetLibrary();
                        else toast.info(`Ready to layout Page ${p.page_number}`);
                      }}
                    >
                      <Palette className="size-3 mr-1" /> Layout Assets
                    </Button>

                    {/* Quick status cycle */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8"
                      onClick={() => {
                        if (statuses.length === 0) return;
                        const currentIdx = statuses.findIndex((s) => s.id === p.status_id);
                        const nextIdx = (currentIdx + 1) % statuses.length;
                        if (statuses[nextIdx]) {
                          mUpdateStatus.mutate({ id: p.id, statusId: statuses[nextIdx].id });
                        }
                      }}
                    >
                      Next Status →
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar: Revisions to Fix & Asset Checklist */}
        <div className="lg:col-span-4 space-y-6">
          {/* Active Corrections Panel */}
          <div className="plate p-5 space-y-4">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <MessageSquare className="size-4 text-amber-500" /> Revisions to Fix (
              {openCorrections.length})
            </h3>

            {openCorrections.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-xs italic">
                <CheckCircle2 className="size-6 text-green-500 mx-auto mb-1.5" />
                No open corrections on your assigned pages!
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {openCorrections.map((corr: any) => (
                  <div key={corr.id} className="p-3 rounded-lg border bg-card space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        Page {corr.page_number || "General"}
                      </Badge>
                      <Badge variant="secondary" className="capitalize text-[10px]">
                        {corr.priority || "Normal"}
                      </Badge>
                    </div>
                    <p className="font-medium text-foreground">{corr.title}</p>
                    <p className="text-muted-foreground">{corr.description}</p>
                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs bg-green-500/10 text-green-600 hover:bg-green-500/20"
                        onClick={() => mResolveCorrection.mutate(corr.id)}
                      >
                        <CheckCircle2 className="size-3 mr-1" /> Mark Resolved
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Requirements Checklist Panel */}
          <div className="plate p-5 space-y-4">
            <h3 className="font-display font-bold text-base flex items-center gap-2">
              <ListChecks className="size-4 text-primary" /> Photos Needed Checklist
            </h3>

            {myRequirements.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center italic">
                No specific photo requirements assigned yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {(myRequirements as any[]).map((r: any) => {
                  const isDone = r.have >= r.needed;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2 rounded bg-muted/40 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isDone ? (
                          <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                        ) : (
                          <Clock className="size-4 text-amber-500 shrink-0" />
                        )}
                        <span className="truncate">{r.label}</span>
                      </div>
                      <span className="font-mono font-bold shrink-0 ml-2">
                        {r.have}/{r.needed}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
