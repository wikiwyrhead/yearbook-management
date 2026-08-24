import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { KeyRound, ShieldAlert } from "lucide-react";
import { requestProofAccessGrantFn } from "@/lib/production.functions";

interface ProofAccessRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proofId: string;
  yearbookId: string;
  usersList?: Array<{ id: string; full_name: string; email: string }>;
  pagesList?: Array<{ id: string; physical_index: number; title: string }>;
}

export function ProofAccessRequestModal({
  open,
  onOpenChange,
  proofId,
  yearbookId,
  usersList = [],
  pagesList = [],
}: ProofAccessRequestModalProps) {
  const qc = useQueryClient();
  const requestFn = useServerFn(requestProofAccessGrantFn);

  const [targetUserId, setTargetUserId] = useState("");
  const [scope, setScope] = useState<"page" | "section" | "edition">("page");
  const [targetPageId, setTargetPageId] = useState("");
  const [reason, setReason] = useState("");
  const [dueAt, setDueAt] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!targetUserId) throw new Error("Please select a target user");
      if (!reason) throw new Error("Please provide a reason for the access grant");
      return await requestFn({
        data: {
          proofId,
          yearbookId,
          targetUserId,
          scope,
          targetPageId: scope === "page" ? targetPageId : undefined,
          reason,
          dueAt: dueAt || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Proof access grant request submitted for Super Admin review");
      qc.invalidateQueries({ queryKey: ["proofAccessRequests", proofId] });
      onOpenChange(false);
      setTargetUserId("");
      setReason("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit proof access request");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <KeyRound className="size-5 text-primary" /> Request Proof Access Grant
          </DialogTitle>
          <DialogDescription>
            Submit an access request for an external guest, teacher, or specialist reviewer. All grants require Super Admin authorization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="targetUser">Reviewer Account</Label>
            <Select value={targetUserId} onValueChange={setTargetUserId}>
              <SelectTrigger id="targetUser">
                <SelectValue placeholder="Select member or reviewer..." />
              </SelectTrigger>
              <SelectContent>
                {usersList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope">Access Scope</Label>
            <Select value={scope} onValueChange={(val: any) => setScope(val)}>
              <SelectTrigger id="scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="page">Specific Page (Page-Scoped)</SelectItem>
                <SelectItem value="section">Specific Section (Section-Scoped)</SelectItem>
                <SelectItem value="edition">Full Yearbook Edition (Whole-Book)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "page" && (
            <div className="space-y-2">
              <Label htmlFor="targetPage">Target Page</Label>
              <Select value={targetPageId} onValueChange={setTargetPageId}>
                <SelectTrigger id="targetPage">
                  <SelectValue placeholder="Select page..." />
                </SelectTrigger>
                <SelectContent>
                  {pagesList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      Page {p.physical_index}: {p.title || `Page ${p.physical_index}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Reason / Verification Scope</Label>
            <Textarea
              id="reason"
              placeholder="e.g. Faculty advisor verifying club awards and roster spelling..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-20 text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueAt">Access Expiry Date (Optional)</Label>
            <Input
              id="dueAt"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
