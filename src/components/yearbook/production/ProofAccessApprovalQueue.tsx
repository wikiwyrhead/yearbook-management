import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, ShieldCheck, Clock, UserCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { reviewProofAccessRequestFn } from "@/lib/production.functions";

interface ProofAccessApprovalQueueProps {
  proofId?: string;
  yearbookId: string;
}

export function ProofAccessApprovalQueue({ proofId, yearbookId }: ProofAccessApprovalQueueProps) {
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewProofAccessRequestFn);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["proofAccessRequests", yearbookId, proofId],
    queryFn: async () => {
      const res = await fetch(`/api/storage/proof-requests?yearbookId=${yearbookId}`).catch(() => null);
      if (res && res.ok) return await res.json();
      return [];
    },
  });

  const mReview = useMutation({
    mutationFn: async ({ requestId, decision }: { requestId: string; decision: "approved" | "rejected" }) => {
      return await reviewFn({ data: { requestId, decision } });
    },
    onSuccess: (_, vars) => {
      toast.success(`Request ${vars.decision === "approved" ? "approved" : "rejected"} successfully`);
      qc.invalidateQueries({ queryKey: ["proofAccessRequests"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to process request decision");
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading access request queue...</div>;
  }

  const pendingRequests = requests.filter((r: any) => r.status === "pending");

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-amber-500" />
          <h3 className="text-sm font-bold text-foreground">Pending Proof Access Requests ({pendingRequests.length})</h3>
        </div>
        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/20 bg-amber-500/10">
          Super Admin Authorization Required
        </Badge>
      </div>

      <div className="divide-y divide-border/60">
        {pendingRequests.map((req: any) => (
          <div key={req.id} className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{req.target_user_name || req.target_user_id}</span>
                <Badge variant="secondary" className="text-[10px] font-mono capitalize">
                  Scope: {req.scope}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{req.reason}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 text-rose-500 hover:text-rose-600 gap-1"
                onClick={() => mReview.mutate({ requestId: req.id, decision: "rejected" })}
                disabled={mReview.isPending}
              >
                <X className="size-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                variant="default"
                className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                onClick={() => mReview.mutate({ requestId: req.id, decision: "approved" })}
                disabled={mReview.isPending}
              >
                <Check className="size-3.5" /> Approve Grant
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
