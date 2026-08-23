/**
 * Generic Milestone Layout & Proofing Workspace Component
 * Displayed for Coordinators, Editorial Members, Faculty Advisors, and Students.
 * Completely sanitized: ZERO Canva logos, names, design IDs, edit URLs, or tokens.
 */
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getYearbookLayout, requestLayoutProof, sendAssetToLayout } from "@/lib/design.functions";
import { getProofs, getCorrections } from "@/lib/yearbook.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Layers,
  FileCheck,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  MessageSquarePlus,
  Send,
} from "lucide-react";
import { toast } from "sonner";

export function LayoutWorkspace({
  yearbookId,
  canManage,
  canEdit,
  canGenerateProof = false,
}: {
  yearbookId: string;
  canManage: boolean;
  canEdit: boolean;
  canGenerateProof?: boolean;
}) {
  const qc = useQueryClient();
  const fetchLayout = useServerFn(getYearbookLayout);
  const triggerProof = useServerFn(requestLayoutProof);
  const fetchProofs = useServerFn(getProofs);
  const fetchCorrections = useServerFn(getCorrections);

  const [selectedPage, setSelectedPage] = useState<any | null>(null);

  // 1. Fetch Sanitized Layout Status
  const {
    data: layoutData,
    isLoading: isLoadingLayout,
    refetch: refetchLayout,
  } = useQuery({
    queryKey: ["layout-status", yearbookId],
    queryFn: () => fetchLayout({ data: { yearbookId } }),
  });

  // 2. Fetch Proofs for this Yearbook
  const { data: proofsData } = useQuery({
    queryKey: ["proofs", yearbookId],
    queryFn: () => fetchProofs({ data: { yearbookId } }),
  });

  // 3. Fetch Corrections
  const { data: correctionsData } = useQuery({
    queryKey: ["corrections", yearbookId],
    queryFn: () => fetchCorrections({ data: { yearbookId } }),
  });

  // Proof Generation Mutation
  const proofMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await triggerProof({ data: { yearbookId, pageId } });
      await qc.invalidateQueries({ queryKey: ["proofs", yearbookId] });
      await qc.invalidateQueries({ queryKey: ["layout-status", yearbookId] });
      toast.success(
        res.isCached
          ? "Retrieved existing layout proof."
          : "Generated updated layout proof successfully!",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Failed to generate layout proof"),
  });

  const assignedPages = layoutData?.assignedPages || [];
  const hasActiveLayout = layoutData?.hasActiveLayout;

  return (
    <div className="space-y-6">
      {/* 1. Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Layers className="size-6" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">Layout & Proofing</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review current layout proofs, request updated page drafts, and track proofreading
              corrections.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchLayout()}
            disabled={isLoadingLayout}
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${isLoadingLayout ? "animate-spin" : ""}`} />{" "}
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. Layout Status Overview Banner */}
      <div className="p-4 rounded-xl border bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={hasActiveLayout ? "secondary" : "outline"} className="text-xs">
            {hasActiveLayout ? (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="size-3" /> Layout Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-3" /> Layout Pending
              </span>
            )}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {assignedPages.length} {assignedPages.length === 1 ? "page" : "pages"} available in your
            workspace
          </span>
        </div>
      </div>

      {/* 3. Assigned Pages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assignedPages.map((p) => {
          return (
            <div
              key={p.pageId}
              className="p-4 rounded-xl border bg-card hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="size-7 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                      {p.pageNumber}
                    </span>
                    <h4 className="font-semibold text-sm line-clamp-1">
                      {p.title || `Page ${p.pageNumber}`}
                    </h4>
                  </div>
                  <Badge variant={p.isMapped ? "secondary" : "outline"} className="text-[10px]">
                    {p.isMapped ? `Layout Ready` : "No Mapping"}
                  </Badge>
                </div>

                <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                  <FileText className="size-3.5" />
                  <span>
                    {p.mappedLayoutPages.length > 0
                      ? `Mapped to Layout Page(s) ${p.mappedLayoutPages.join(", ")}`
                      : "Layout page assignment pending"}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => setSelectedPage(p)}
                >
                  View Details & Proofs
                </Button>
                {canGenerateProof && p.isMapped && (
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => proofMutation.mutate(p.pageId)}
                    disabled={proofMutation.isPending}
                  >
                    <FileCheck className="size-3.5 mr-1" /> Generate Proof
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Page Detail & Proofing Dialog */}
      {selectedPage && (
        <Dialog open={!!selectedPage} onOpenChange={() => setSelectedPage(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="size-7 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                  {selectedPage.pageNumber}
                </span>
                {selectedPage.title || `Page ${selectedPage.pageNumber}`}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 my-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/30 border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Layout Status:</span>
                  <span className="font-medium">
                    {selectedPage.isMapped ? "Layout Ready" : "Pending"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Layout Pages:</span>
                  <span className="font-mono">
                    {selectedPage.mappedLayoutPages.length > 0
                      ? selectedPage.mappedLayoutPages.join(", ")
                      : "Unassigned"}
                  </span>
                </div>
              </div>

              {canGenerateProof && selectedPage.isMapped && (
                <Button
                  className="w-full text-xs"
                  onClick={() => proofMutation.mutate(selectedPage.pageId)}
                  disabled={proofMutation.isPending}
                >
                  <FileCheck className="size-3.5 mr-1.5" /> Request Updated Proof
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
