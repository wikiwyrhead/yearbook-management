import React, { useState, useEffect } from "react";
import { 
  X, 
  FileText, 
  Users, 
  Image as ImageIcon, 
  CheckSquare, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PreparationPacketDTO } from "@/lib/preparation/preparation.server";

interface PagePreparationPacketDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pageId: string | null;
  packetData: PreparationPacketDTO | null;
  isLoading: boolean;
  onSignOff?: (stage: string, decision: "approved" | "changes_requested", notes?: string) => Promise<void>;
}

export function PagePreparationPacketDrawer({
  isOpen,
  onClose,
  pageId,
  packetData,
  isLoading,
  onSignOff,
}: PagePreparationPacketDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "roster" | "assets" | "punchlist" | "signoffs">("overview");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !pageId) return null;

  const page = packetData?.page;
  const packet = packetData?.packet;
  const blocks = packetData?.content_blocks || [];
  const persons = packetData?.person_appearances || [];
  const assets = packetData?.asset_requirements || [];
  const checklist = packetData?.checklist_items || [];
  const reviews = packetData?.reviews || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready_for_proof":
        return <Badge className="bg-emerald-600/90 text-white">Ready for Proof</Badge>;
      case "layout_in_progress":
        return <Badge className="bg-indigo-600/90 text-white">Layout in Progress</Badge>;
      case "ready_for_layout":
        return <Badge className="bg-blue-600/90 text-white">Ready for Layout</Badge>;
      case "ready_for_editorial_review":
        return <Badge className="bg-amber-600/90 text-white">Editorial Review</Badge>;
      case "missing_content":
        return <Badge className="bg-rose-600/90 text-white">Missing Content</Badge>;
      case "gathering_content":
        return <Badge className="bg-sky-600/90 text-white">Gathering Content</Badge>;
      default:
        return <Badge variant="outline">Not Started</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
      <div 
        className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-labelledby="drawer-title"
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/60 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                Page {page?.physical_index || "—"} ({page?.display_page_label})
              </span>
              {packet && getStatusBadge(packet.prep_status)}
              {packet?.source_pdf_page && (
                <span className="text-xs text-zinc-400">
                  Source: PDF Page {packet.source_pdf_page}
                </span>
              )}
            </div>
            <h2 id="drawer-title" className="text-xl font-bold text-zinc-100 tracking-tight">
              {page?.title || "Page Preparation Packet"}
            </h2>
            <p className="text-xs text-zinc-400">
              {packet?.school_level || "Academic Spread"} • {packet?.grade_level || ""} {packet?.class_section || ""} {packet?.session_name ? `(${packet.session_name})` : ""}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Drawer Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 border-b border-zinc-800 bg-zinc-900/40">
            <TabsList className="bg-transparent h-11 p-0 gap-4">
              <TabsTrigger 
                value="overview" 
                className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 text-xs gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="roster" 
                className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 text-xs gap-1.5"
              >
                <Users className="h-3.5 w-3.5" />
                Roster ({persons.length})
              </TabsTrigger>
              <TabsTrigger 
                value="assets" 
                className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 text-xs gap-1.5"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Assets ({assets.length})
              </TabsTrigger>
              <TabsTrigger 
                value="punchlist" 
                className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 text-xs gap-1.5"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Punch List ({checklist.filter(c => !c.is_resolved).length})
              </TabsTrigger>
              <TabsTrigger 
                value="signoffs" 
                className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 text-xs gap-1.5"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Signoffs ({reviews.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 space-y-6">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Section & Layout Metadata
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500">Editorial Section:</span>
                    <p className="text-zinc-200 font-medium">{page?.section_name || "Unassigned"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Category:</span>
                    <p className="text-zinc-200 font-medium">{page?.section_category_name || "General"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Layout Type:</span>
                    <p className="text-zinc-200 font-medium">{page?.layout_type_name || "Standard Grid"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Spread Index:</span>
                    <p className="text-zinc-200 font-medium">Spread {packet?.spread_index || "1"}</p>
                  </div>
                </div>
              </div>

              {/* Text Blocks */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Extracted Body & Text Copy</h3>
                {blocks.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No text blocks extracted for this page.</p>
                ) : (
                  blocks.map((b) => (
                    <div key={b.id} className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline" className="text-zinc-400 capitalize">
                          {b.block_type.replace(/_/g, " ")}
                        </Badge>
                        <Badge className={b.is_verified ? "bg-emerald-600/80 text-white" : "bg-amber-600/80 text-white"}>
                          {b.is_verified ? "Verified Copy" : "Extracted Unverified"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {b.text_content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Roster Tab */}
            <TabsContent value="roster" className="m-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Student & Subject Appearances</h3>
                <span className="text-xs text-zinc-400">{persons.length} recorded subjects</span>
              </div>
              {persons.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-zinc-800 rounded-lg">
                  <Users className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
                  <p className="text-xs text-zinc-400">No individual portrait subjects appearing on this spread.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {persons.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-zinc-500 w-5">{idx + 1}.</span>
                        <div>
                          <p className="text-xs font-medium text-zinc-200">{p.display_name_snapshot}</p>
                          {p.academic_honor && (
                            <p className="text-[11px] text-amber-400 font-semibold">{p.academic_honor}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className={p.is_verified ? "text-emerald-400 border-emerald-800" : "text-amber-400 border-amber-800"}>
                        {p.is_verified ? "Verified" : "Unverified"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Assets Tab */}
            <TabsContent value="assets" className="m-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Required High-Resolution Assets</h3>
                <span className="text-xs text-zinc-400">{assets.length} items</span>
              </div>
              {assets.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-zinc-800 rounded-lg">
                  <ImageIcon className="h-8 w-8 mx-auto text-zinc-600 mb-2" />
                  <p className="text-xs text-zinc-400">No explicit asset requirements registered for this spread.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assets.map((a) => (
                    <div key={a.id} className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">{a.label}</span>
                        <Badge 
                          className={
                            a.status === "verified" ? "bg-emerald-600 text-white" :
                            a.status === "received" ? "bg-blue-600 text-white" :
                            "bg-rose-600/80 text-white"
                          }
                        >
                          {a.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-normal">{a.specification}</p>
                      {a.is_reference_only && (
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-400/90 pt-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>PDF reference photo attached; original 300 DPI studio portrait required.</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Punch List Tab */}
            <TabsContent value="punchlist" className="m-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Pre-Flight Missing Content Punch List</h3>
                <span className="text-xs text-zinc-400">{checklist.length} items</span>
              </div>
              <div className="space-y-2">
                {checklist.map((c) => (
                  <div 
                    key={c.id} 
                    className={`p-3 rounded-lg border flex items-start gap-3 transition-colors ${
                      c.is_resolved 
                        ? "bg-zinc-950/40 border-zinc-800/60 opacity-60" 
                        : "bg-zinc-900/40 border-zinc-800"
                    }`}
                  >
                    <div className="pt-0.5">
                      {c.is_resolved ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-400" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-200">{c.description}</span>
                        <Badge variant="outline" className="text-[10px] uppercase text-zinc-400">
                          {c.category.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Signoffs Tab */}
            <TabsContent value="signoffs" className="m-0 space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Stage Review & Audit Trail</h3>
                {reviews.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No formal stage reviews recorded yet for this page.</p>
                ) : (
                  <div className="space-y-2">
                    {reviews.map((r) => (
                      <div key={r.id} className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-zinc-200 capitalize">
                            {r.stage.replace(/_/g, " ")} Review
                          </span>
                          <Badge className={r.decision === "approved" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}>
                            {r.decision.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-zinc-400">By {r.reviewer_name} • {new Date(r.created_at).toLocaleString()}</p>
                        {r.notes && <p className="text-xs text-zinc-300 italic pt-1">"{r.notes}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stage Action Form */}
              {onSignOff && (
                <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-200">Submit Editorial Stage Signoff</h4>
                  <textarea 
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Enter review feedback or approval notes..."
                    rows={2}
                    className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                  <div className="flex justify-end gap-2">
                    <Button 
                      size="sm" 
                      variant="destructive"
                      disabled={isSubmitting}
                      onClick={async () => {
                        setIsSubmitting(true);
                        try {
                          await onSignOff("editor_in_chief", "changes_requested", reviewNotes);
                          setReviewNotes("");
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="text-xs h-8"
                    >
                      Request Changes
                    </Button>
                    <Button 
                      size="sm" 
                      variant="default"
                      disabled={isSubmitting}
                      onClick={async () => {
                        setIsSubmitting(true);
                        try {
                          await onSignOff("editor_in_chief", "approved", reviewNotes);
                          setReviewNotes("");
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Approve Page Stage
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
