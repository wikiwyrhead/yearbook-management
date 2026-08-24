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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getYearbookPreparationBookMap,
  createDesignPacketSnapshot,
  recordDesignPacketReview,
  getDesignQueue,
  queueDesignPacketAssetTransfers,
} from "@/lib/preparation/preparation.server";

interface DesignQueueTabProps {
  yearbookId: string;
  isSuperAdmin?: boolean;
}

export function DesignQueueTab({ yearbookId, isSuperAdmin = false }: DesignQueueTabProps) {
  const qc = useQueryClient();
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  // In TanStack Start client components, we query the design queue endpoint
  const { data: queueItems = [], isLoading, refetch } = useQuery({
    queryKey: ["designQueue", yearbookId],
    queryFn: async () => {
      // In SSR/client, we can call server function or fetch
      const res = await fetch(`/api/preparation/yearbooks/${yearbookId}/design-queue`).catch(() => null);
      if (res && res.ok) return await res.json();
      return [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-6 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Layers className="size-5 text-primary" /> Design Integration & Preparation Queue
            </h2>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
              Phase B Authoritative
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Linear governance pipeline: Editorial Member ➔ EIC Review ➔ Coordinator Approval ➔ Immutable Snapshot ➔ Design Queue.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="size-3.5" /> Refresh Queue
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2 text-sm">
          <RefreshCw className="size-4 animate-spin text-primary" /> Loading Design Integration Queue...
        </div>
      ) : queueItems.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-border rounded-xl bg-card/50 space-y-3">
          <FileCheck className="size-10 text-muted-foreground mx-auto" />
          <h3 className="text-base font-semibold text-foreground">No Approved Packets in Design Queue</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Pages appear here once Editorial Members finalize preparation, EIC submits positive review, and Coordinator authorizes layout generation.
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
                    {item.page_title || `Page ${item.physical_index}`}
                  </h4>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  v{item.version || 1}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg font-mono">
                <div className="flex justify-between">
                  <span>Category:</span>
                  <span className="text-foreground font-semibold">{item.section_category_name || "General"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Layout:</span>
                  <span className="text-foreground">{item.layout_type_name || "Standard"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Snapshot SHA:</span>
                  <span className="text-foreground truncate max-w-[140px]">{item.snapshot_sha256?.slice(0, 12)}...</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                  <CheckCircle2 className="size-4" /> Ready for Design
                </div>

                {isSuperAdmin && (
                  <Button size="sm" variant="default" className="text-xs gap-1.5 h-8">
                    <Send className="size-3.5" /> Transfer to Canva
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
