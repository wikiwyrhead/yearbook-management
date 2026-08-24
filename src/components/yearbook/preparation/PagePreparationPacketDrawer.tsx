import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  Sparkles,
  Save,
  Send,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getPagePreparationPacketFn,
  updatePagePreparationPacketFn,
  signOffPreparationStageFn,
  createDesignPacketSnapshotFn,
} from "@/lib/preparation.functions";
import type { PreparationPacketDTO } from "@/lib/preparation/preparation.server";

interface PagePreparationPacketDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pageId: string | null;
  packetData?: PreparationPacketDTO | null;
  isLoading?: boolean;
  onSignOff?: (
    stage: string,
    decision: "approved" | "changes_requested",
    notes?: string,
  ) => Promise<void>;
}

export function PagePreparationPacketDrawer({
  isOpen,
  onClose,
  pageId,
}: PagePreparationPacketDrawerProps) {
  const qc = useQueryClient();
  const fetchPacket = useServerFn(getPagePreparationPacketFn);
  const updatePacket = useServerFn(updatePagePreparationPacketFn);
  const signOffStage = useServerFn(signOffPreparationStageFn);
  const createSnapshot = useServerFn(createDesignPacketSnapshotFn);

  const [activeTab, setActiveTab] = useState<
    "overview" | "roster" | "assets" | "punchlist" | "signoffs"
  >("overview");
  const [reviewNotes, setReviewNotes] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCaptions, setEditCaptions] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: fetchedData, isLoading } = useQuery({
    queryKey: ["pagePreparationPacket", pageId],
    queryFn: () => fetchPacket({ data: { pageId: pageId! } }),
    enabled: isOpen && !!pageId,
  });

  const packetData = fetchedData;

  React.useEffect(() => {
    if (packetData) {
      setEditTitle(packetData.page?.title || "");
      setEditCaptions(packetData.packet?.captions_and_credits || "");
    }
  }, [packetData]);

  const mUpdate = useMutation({
    mutationFn: async () => {
      if (!pageId) return;
      await updatePacket({
        data: {
          pageId,
          updates: {
            title: editTitle,
            captions_and_credits: editCaptions,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Page preparation packet updated successfully");
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["pagePreparationPacket", pageId] });
      qc.invalidateQueries({ queryKey: ["ladder"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update preparation packet");
    },
  });

  const mSignOff = useMutation({
    mutationFn: async ({
      stage,
      decision,
      notes,
    }: {
      stage:
        | "editorial_member"
        | "editor_in_chief"
        | "coordinator"
        | "principal"
        | "school_director"
        | "super_admin";
      decision: "approved" | "changes_requested";
      notes?: string;
    }) => {
      if (!pageId || !packetData) return;
      await signOffStage({
        data: {
          yearbookId: packetData.page.yearbook_id,
          pageId,
          scope: "page",
          stage,
          decision,
          notes,
        },
      });
      if (decision === "approved" && (stage === "coordinator" || stage === "editor_in_chief")) {
        await createSnapshot({ data: { pageId } });
      }
    },
    onSuccess: () => {
      toast.success("Stage review recorded successfully");
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: ["pagePreparationPacket", pageId] });
      qc.invalidateQueries({ queryKey: ["designQueue"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit stage review");
    },
  });

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
                Page {page?.physical_index || "—"} ({page?.display_page_label || ""})
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
              {packet?.school_level || "Academic Spread"} • {packet?.grade_level || ""}{" "}
              {packet?.class_section || ""} {packet?.session_name ? `(${packet.session_name})` : ""}
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
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="flex-1 flex flex-col overflow-hidden"
        >
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
                Punch List ({checklist.filter((c) => !c.is_resolved).length})
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

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-zinc-400 flex items-center justify-center gap-2">
                <Sparkles className="size-4 animate-spin text-primary" /> Loading page preparation
                packet...
              </div>
            ) : (
              <>
                {/* Overview Tab */}
                <TabsContent value="overview" className="m-0 space-y-6">
                  {/* Page Title & Status Box */}
                  <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-200">Page Information</h3>
                      {!isEditing ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsEditing(true)}
                          className="text-xs h-7"
                        >
                          Edit Content
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditing(false)}
                            className="text-xs h-7"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => mUpdate.mutate()}
                            disabled={mUpdate.isPending}
                            className="text-xs h-7 gap-1"
                          >
                            <Save className="size-3" /> Save
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-zinc-400 font-medium">Page Title</label>
                        {isEditing ? (
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="mt-1 text-xs bg-zinc-950 border-zinc-800 text-zinc-100"
                          />
                        ) : (
                          <p className="text-sm font-medium text-zinc-200 mt-0.5">
                            {page?.title || "Untitled Page"}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                          <span className="text-zinc-500">Category</span>
                          <p className="font-medium text-zinc-300 mt-0.5">
                            {page?.section_category_name || "General"}
                          </p>
                        </div>
                        <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                          <span className="text-zinc-500">Layout Type</span>
                          <p className="font-medium text-zinc-300 mt-0.5">
                            {page?.layout_type_name || "Standard"}
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-zinc-400 font-medium">
                          Captions & Credits
                        </label>
                        {isEditing ? (
                          <Textarea
                            value={editCaptions}
                            onChange={(e) => setEditCaptions(e.target.value)}
                            rows={3}
                            className="mt-1 text-xs bg-zinc-950 border-zinc-800 text-zinc-100"
                          />
                        ) : (
                          <p className="text-xs text-zinc-300 bg-zinc-950 p-3 rounded border border-zinc-800/80 whitespace-pre-wrap mt-1">
                            {packet?.captions_and_credits ||
                              "No captions or photo credits added yet."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Text Content Blocks */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-200">
                      Editorial Text Blocks ({blocks.length})
                    </h3>
                    {blocks.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">
                        No structured text blocks added.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {blocks.map((b) => (
                          <div
                            key={b.id}
                            className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono text-[10px] uppercase text-zinc-400">
                                {b.block_type.replace(/_/g, " ")}
                              </span>
                              {b.is_verified && (
                                <Badge className="text-[10px] bg-emerald-600/80">Verified</Badge>
                              )}
                            </div>
                            <p className="text-xs text-zinc-200 whitespace-pre-wrap">
                              {b.text_content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Roster Tab */}
                <TabsContent value="roster" className="m-0 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Person Appearances ({persons.length})
                  </h3>
                  {persons.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">
                      No roster subjects tagged on this page.
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                      {persons.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <p className="font-medium text-zinc-200">{p.display_name_snapshot}</p>
                            {p.academic_honor && (
                              <p className="text-[11px] text-amber-400">{p.academic_honor}</p>
                            )}
                            {p.quoted_text && (
                              <p className="text-[11px] text-zinc-400 italic mt-0.5">
                                "{p.quoted_text}"
                              </p>
                            )}
                          </div>
                          {p.is_verified ? (
                            <Badge className="bg-emerald-600 text-white text-[10px]">
                              Verified
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-zinc-700 text-zinc-400"
                            >
                              Unverified
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Assets Tab */}
                <TabsContent value="assets" className="m-0 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Asset Requirements ({assets.length})
                  </h3>
                  {assets.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">
                      No asset requirements declared for this page.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {assets.map((a) => (
                        <div
                          key={a.id}
                          className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-[10px] uppercase text-zinc-400">
                              {a.asset_type}
                            </span>
                            <Badge
                              className={
                                a.status === "verified"
                                  ? "bg-emerald-600 text-white text-[10px]"
                                  : "bg-zinc-800 text-zinc-400 text-[10px]"
                              }
                            >
                              {a.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs font-semibold text-zinc-200">{a.label}</p>
                          {a.specification && (
                            <p className="text-[11px] text-zinc-400">{a.specification}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Punchlist Tab */}
                <TabsContent value="punchlist" className="m-0 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Missing Content Punch List ({checklist.length})
                  </h3>
                  {checklist.length === 0 ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="size-4" /> All content items resolved!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {checklist.map((c) => (
                        <div
                          key={c.id}
                          className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 flex items-start gap-3"
                        >
                          <div className="mt-0.5">
                            {c.is_resolved ? (
                              <CheckCircle2 className="size-4 text-emerald-400" />
                            ) : (
                              <AlertCircle className="size-4 text-amber-400" />
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-200">
                                {c.description}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase text-zinc-400"
                              >
                                {c.category.replace(/_/g, " ")}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Signoffs Tab */}
                <TabsContent value="signoffs" className="m-0 space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-200">
                      Stage Review & Audit Trail
                    </h3>
                    {reviews.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic">
                        No formal stage reviews recorded yet for this page.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {reviews.map((r) => (
                          <div
                            key={r.id}
                            className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-zinc-200 capitalize">
                                {r.stage.replace(/_/g, " ")} Review
                              </span>
                              <Badge
                                className={
                                  r.decision === "approved"
                                    ? "bg-emerald-600 text-white"
                                    : "bg-rose-600 text-white"
                                }
                              >
                                {r.decision.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-zinc-400">
                              By {r.reviewer_name} • {new Date(r.created_at).toLocaleString()}
                            </p>
                            {r.notes && (
                              <p className="text-xs text-zinc-300 italic pt-1">"{r.notes}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stage Action Form */}
                  <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-3">
                    <h4 className="text-xs font-semibold text-zinc-200">
                      Submit Editorial Stage Signoff
                    </h4>
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
                        disabled={mSignOff.isPending}
                        onClick={() =>
                          mSignOff.mutate({
                            stage: "coordinator",
                            decision: "changes_requested",
                            notes: reviewNotes,
                          })
                        }
                        className="text-xs h-8"
                      >
                        Request Changes
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={mSignOff.isPending}
                        onClick={() =>
                          mSignOff.mutate({
                            stage: "coordinator",
                            decision: "approved",
                            notes: reviewNotes,
                          })
                        }
                        className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Approve for Design
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
