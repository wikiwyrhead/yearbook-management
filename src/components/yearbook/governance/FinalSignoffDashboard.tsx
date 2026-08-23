import React, { useState } from "react";
import { 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Send, 
  FileCheck, 
  Lock, 
  AlertCircle,
  KeyRound
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export interface SignatoryStatus {
  role: "editor_in_chief" | "coordinator" | "principal" | "school_director";
  roleTitle: string;
  designatedUserName: string;
  designatedUserEmail: string;
  decision: "approved" | "approved_with_notes" | "changes_requested" | "pending";
  notes?: string | null;
  decidedAt?: string | null;
}

interface FinalSignoffDashboardProps {
  proofId: string;
  roundName: string;
  checksumSha256: string;
  proofVersionStatus: string;
  signatories: SignatoryStatus[];
  isSuperAdmin: boolean;
  currentUserRole?: string;
  onSign?: (decision: "approved" | "approved_with_notes" | "changes_requested", notes?: string) => Promise<void>;
  onSendReminders?: () => Promise<{ dispatched: number }>;
  onEmergencyOverride?: (writtenJustification: string) => Promise<void>;
}

export function FinalSignoffDashboard({
  proofId,
  roundName,
  checksumSha256,
  proofVersionStatus,
  signatories,
  isSuperAdmin,
  currentUserRole,
  onSign,
  onSendReminders,
  onEmergencyOverride,
}: FinalSignoffDashboardProps) {
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overrideJustification, setOverrideJustification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signNotes, setSignNotes] = useState("");

  const allApproved = signatories.every((s) => s.decision === "approved" || s.decision === "approved_with_notes");
  const hasBlockers = signatories.some((s) => s.decision === "changes_requested");

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 space-y-6 shadow-xl">
      {/* Header & Checksum Binding */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
            <h3 className="text-base font-bold text-zinc-100">
              Institutional Governance & Final Approval
            </h3>
            <Badge variant="outline" className="text-xs font-mono border-zinc-700 text-zinc-300">
              {roundName}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400">
            Final release to print is cryptographically bound to the candidate PDF SHA-256 checksum.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900/90 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs">
          <span className="text-zinc-500 font-mono">SHA-256:</span>
          <span className="font-mono text-zinc-300 font-bold tracking-wider">
            {checksumSha256 ? `${checksumSha256.slice(0, 16)}...` : "CALCULATING"}
          </span>
        </div>
      </div>

      {/* 4 Signatories Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {signatories.map((sig) => {
          const isApproved = sig.decision === "approved" || sig.decision === "approved_with_notes";
          const isChanges = sig.decision === "changes_requested";

          return (
            <div 
              key={sig.role}
              className={`p-4 rounded-lg border transition-all ${
                isApproved 
                  ? "bg-emerald-950/20 border-emerald-800/60" 
                  : isChanges 
                  ? "bg-rose-950/20 border-rose-800/60" 
                  : "bg-zinc-900/40 border-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] uppercase font-bold tracking-wider text-zinc-400">
                    {sig.roleTitle}
                  </span>
                  <p className="text-sm font-semibold text-zinc-200">{sig.designatedUserName}</p>
                  <p className="text-xs text-zinc-500">{sig.designatedUserEmail}</p>
                </div>
                <Badge 
                  className={
                    isApproved ? "bg-emerald-600 text-white" :
                    isChanges ? "bg-rose-600 text-white" :
                    "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }
                >
                  {isApproved ? "APPROVED" : isChanges ? "CHANGES REQUESTED" : "PENDING"}
                </Badge>
              </div>

              {sig.notes && (
                <div className="mt-2 text-xs text-zinc-300 italic bg-zinc-950/50 p-2 rounded border border-zinc-800/80">
                  "{sig.notes}"
                </div>
              )}

              {sig.decidedAt && (
                <p className="text-[10px] text-zinc-500 mt-2">
                  Signed: {new Date(sig.decidedAt).toLocaleString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2">
          {onSendReminders && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSendReminders}
              className="text-xs gap-1.5 border-zinc-700 text-zinc-300 hover:text-white"
            >
              <Send className="h-3.5 w-3.5" />
              Dispatch 24h Reminders
            </Button>
          )}

          {isSuperAdmin && !allApproved && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsOverrideOpen(true)}
              className="text-xs gap-1.5 bg-rose-900/80 hover:bg-rose-800 text-white"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Emergency Release Override
            </Button>
          )}
        </div>

        {/* Current User Sign Action */}
        {onSign && (
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onSign("changes_requested", signNotes)}
              className="text-xs"
            >
              Request Changes
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => onSign("approved", signNotes)}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Sign & Approve Candidate
            </Button>
          </div>
        )}
      </div>

      {/* Emergency Release Override Dialog */}
      <Dialog open={isOverrideOpen} onOpenChange={setIsOverrideOpen}>
        <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Super Admin Emergency Release Override
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              This action bypasses missing institutional signatures and marks the candidate release as 'released_for_production'. A permanent, immutable security audit record will be logged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-xs font-semibold text-zinc-300">
              Mandatory Written Justification (minimum 25 characters):
            </label>
            <textarea
              value={overrideJustification}
              onChange={(e) => setOverrideJustification(e.target.value)}
              placeholder="State the formal commercial or deadline justification for this emergency release..."
              rows={3}
              className="w-full text-xs bg-zinc-900 border border-zinc-800 rounded p-2.5 text-zinc-200 focus:outline-none focus:border-rose-500"
            />
            <span className="text-[11px] text-zinc-500">
              {overrideJustification.length} / 25 characters minimum
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsOverrideOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={overrideJustification.trim().length < 25 || isSubmitting}
              onClick={async () => {
                if (!onEmergencyOverride) return;
                setIsSubmitting(true);
                try {
                  await onEmergencyOverride(overrideJustification);
                  setIsOverrideOpen(false);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="text-xs bg-rose-600 hover:bg-rose-700"
            >
              Authorize Emergency Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
