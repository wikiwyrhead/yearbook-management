import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  ExternalLink,
  ListOrdered,
  UserPlus,
  ImageIcon,
  CheckCircle2,
  Search,
  AlertCircle,
  Columns,
  List,
  Sparkles,
  Layers,
  BookOpen,
  Eye,
  PenTool,
  Clock,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLadder,
  createPages,
  updatePage,
  deletePage,
  reorderPages,
  renumberPages,
  assignPages,
  unassignPage,
  saveRequirement,
  deleteRequirement,
  getAssets,
  associateAssetToPage,
} from "@/lib/yearbook.functions";

type Lookup = { id: string; name: string; color?: string };
type Member = {
  user_id: string;
  role: string;
  profile: { full_name: string | null; email: string | null } | null;
};

// Realistic section accent color palette
const SECTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Opening: {
    bg: "bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-500/30",
  },
  "Senior Portraits": {
    bg: "bg-indigo-500/10",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-500/30",
  },
  "Student Life": {
    bg: "bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-500/30",
  },
  "Academics & CTE": {
    bg: "bg-purple-500/10",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-500/30",
  },
  "Athletics & Sports": {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500/30",
  },
  "Clubs & Orgs": {
    bg: "bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-500/30",
  },
  "Performing Arts": {
    bg: "bg-pink-500/10",
    text: "text-pink-700 dark:text-pink-300",
    border: "border-pink-500/30",
  },
  "Graduation & Ads": {
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-500/30",
  },
};

function getSectionStyle(sectionName?: string) {
  if (!sectionName)
    return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  for (const [key, style] of Object.entries(SECTION_COLORS)) {
    if (sectionName.toLowerCase().includes(key.toLowerCase())) return style;
  }
  return { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20" };
}

import { PagePreparationPacketDrawer } from "./preparation/PagePreparationPacketDrawer";

interface LadderTabProps {
  yearbookId: string;
  sections: Lookup[];
  pageTypes: Lookup[];
  statuses: (Lookup & { color: string })[];
  members: Member[];
  canEdit: boolean;
  canManage: boolean;
  userId: string;
}

export function LadderTab({
  yearbookId,
  sections,
  pageTypes,
  statuses,
  members,
  canEdit,
  canManage,
  userId,
}: LadderTabProps) {
  const fetchLadder = useServerFn(getLadder);
  const qc = useQueryClient();
  const key = ["ladder", yearbookId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => fetchLadder({ data: { yearbookId } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const [fSection, setFSection] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"spread" | "list">("spread");
  const [currentPage, setCurrentPage] = useState(1);
  const [openPage, setOpenPage] = useState<string | null>(null);
  const [packetPageId, setPacketPageId] = useState<string | null>(null);

  const doUpdate = useServerFn(updatePage);
  const doDelete = useServerFn(deletePage);
  const doReorder = useServerFn(reorderPages);
  const doRenumber = useServerFn(renumberPages);
  const doUnassign = useServerFn(unassignPage);

  const mUpdate = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) => doUpdate({ data: v }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const pages = data?.pages ?? [];
  const nameOf = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.profile?.full_name || m?.profile?.email || "Unknown";
  };

  const statusById = Object.fromEntries(statuses.map((s) => [s.id, s]));
  const sectionById = Object.fromEntries(sections.map((s) => [s.id, s]));

  const filtered = useMemo(
    () =>
      pages.filter((p: any) => {
        if (fSection !== "all" && p.section_id !== fSection) return false;
        if (fStatus !== "all" && p.status_id !== fStatus) return false;
        if (fAssignee !== "all") {
          const as = (data?.assignments ?? []).filter((a: any) => a.page_id === p.id);
          if (!as.some((a: any) => a.user_id === fAssignee)) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = (p.title || "").toLowerCase().includes(q);
          const matchesNum = String(p.page_number || "").includes(q);
          const sec = p.section_id ? sectionById[p.section_id] : undefined;
          const matchesSec = (sec?.name || "").toLowerCase().includes(q);
          if (!matchesTitle && !matchesNum && !matchesSec) return false;
        }
        return true;
      }),
    [pages, fSection, fStatus, fAssignee, searchQuery, data, sectionById],
  );

  // Group pages into 2-page spreads
  const spreads = useMemo(() => {
    const res: Array<{ left?: any; right?: any; spreadIndex: number; title: string }> = [];
    if (filtered.length === 0) return res;

    for (let i = 0; i < filtered.length; i += 2) {
      const left = filtered[i];
      const right = filtered[i + 1];
      const spreadIndex = Math.floor(i / 2) + 1;
      const leftSec = left?.section_id ? sectionById[left.section_id]?.name : "";
      const rightSec = right?.section_id ? sectionById[right.section_id]?.name : "";
      const title = leftSec || rightSec || `Spread ${spreadIndex}`;
      res.push({ left, right, spreadIndex, title });
    }
    return res;
  }, [filtered, sectionById]);

  const PAGE_SIZE = viewMode === "spread" ? 6 : 14;
  const totalPages =
    viewMode === "spread"
      ? Math.ceil(spreads.length / PAGE_SIZE) || 1
      : Math.ceil(filtered.length / PAGE_SIZE) || 1;

  const paginatedSpreads = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return spreads.slice(start, start + PAGE_SIZE);
  }, [spreads, currentPage, PAGE_SIZE]);

  const paginatedPages = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage, PAGE_SIZE]);

  function move(pageId: string, dir: -1 | 1) {
    const ids = (pages as any[]).map((p: any) => p.id);
    const i = ids.indexOf(pageId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    doReorder({ data: { orderedIds: ids } })
      .then(refresh)
      .catch((e: Error) => toast.error(e.message));
  }

  // Summary Metrics
  const totalCount = pages.length;
  const inLayoutCount = pages.filter(
    (p: any) => p.status_id && statusById[p.status_id]?.name?.includes("Layout"),
  ).length;
  const approvedCount = pages.filter(
    (p: any) => p.status_id && statusById[p.status_id]?.name?.includes("Approv"),
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Controls & View Toggle Bar */}
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search ladder pages"
                placeholder="Search ladder (e.g. Page 12, Basketball)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 h-9 text-xs"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/40 shrink-0">
              <Button
                size="sm"
                variant={viewMode === "spread" ? "default" : "ghost"}
                className="h-8 text-xs gap-1.5 px-3"
                onClick={() => {
                  setViewMode("spread");
                  setCurrentPage(1);
                }}
              >
                <Columns className="size-3.5" />
                2-Page Spreads
              </Button>
              <Button
                size="sm"
                variant={viewMode === "list" ? "default" : "ghost"}
                className="h-8 text-xs gap-1.5 px-3"
                onClick={() => {
                  setViewMode("list");
                  setCurrentPage(1);
                }}
              >
                <List className="size-3.5" />
                Compact Ladder
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <AssignRangeDialog yearbookId={yearbookId} members={members} onDone={refresh} />
                <AddPagesDialog
                  yearbookId={yearbookId}
                  sections={sections}
                  pageTypes={pageTypes}
                  onDone={refresh}
                />
              </>
            )}
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() =>
                  doRenumber({ data: { yearbookId, startAt: 1 } })
                    .then(() => {
                      toast.success("Pages renumbered sequentially from 1");
                      refresh();
                    })
                    .catch((e: Error) => toast.error(e.message))
                }
              >
                <ListOrdered className="size-3.5 mr-1" /> Renumber
              </Button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border text-xs">
          <FilterSelect
            label="Section"
            value={fSection}
            onChange={(v) => {
              setFSection(v);
              setCurrentPage(1);
            }}
            options={sections}
          />
          <FilterSelect
            label="Status"
            value={fStatus}
            onChange={(v) => {
              setFStatus(v);
              setCurrentPage(1);
            }}
            options={statuses}
          />
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground font-semibold">Assignee</Label>
            <Select
              value={fAssignee}
              onValueChange={(v) => {
                setFAssignee(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger
                className="w-44 h-8 text-xs"
                aria-label="Filter ladder by assigned staff member"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="text-xs">
                    {nameOf(m.user_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick Filter Reset */}
          {(fSection !== "all" || fStatus !== "all" || fAssignee !== "all" || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground self-end"
              onClick={() => {
                setFSection("all");
                setFStatus("all");
                setFAssignee("all");
                setSearchQuery("");
                setCurrentPage(1);
              }}
            >
              Reset Filters
            </Button>
          )}

          {/* Status Counts Pill Bar */}
          <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0">
            {statuses.map((s) => {
              const count = (pages as any[]).filter((p: any) => p.status_id === s.id).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Filter by status ${s.name} (${count} pages)`}
                  onClick={() => {
                    setFStatus(fStatus === s.id ? "all" : s.id);
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 min-h-[30px] rounded-full border text-xs transition-colors ${
                    fStatus === s.id
                      ? "border-primary bg-primary/10 font-bold text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color || "#3b82f6" }}
                  />
                  <span>
                    {s.name} ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Viewport */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-border bg-card/40">
          <BookOpen className="size-10 mx-auto mb-2 text-muted-foreground/40" />
          <h3 className="font-display text-base font-semibold">
            No pages match your active filters
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Try clearing search keywords or selecting a different section.
          </p>
        </div>
      ) : viewMode === "spread" ? (
        /* 1. VISUAL 2-PAGE FACING SPREAD VIEW */
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedSpreads.map((spread) => {
            const leftSec = spread.left?.section_id
              ? sectionById[spread.left.section_id]
              : undefined;
            const rightSec = spread.right?.section_id
              ? sectionById[spread.right.section_id]
              : undefined;
            const sectionStyle = getSectionStyle(leftSec?.name || rightSec?.name);

            return (
              <div
                key={`spread-${spread.spreadIndex}`}
                className="rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
              >
                {/* Spread Header */}
                <div
                  className={`px-3 py-2 border-b flex items-center justify-between ${sectionStyle.bg}`}
                >
                  <span
                    className={`text-xs font-semibold ${sectionStyle.text} flex items-center gap-1.5`}
                  >
                    <Layers className="size-3.5" />
                    {leftSec?.name || rightSec?.name || "General Spread"}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Spread #{spread.spreadIndex}
                  </span>
                </div>

                {/* Facing Pages Realistic Mockup */}
                <div className="p-3 bg-muted/20 grid grid-cols-1 sm:grid-cols-2 gap-2 relative">
                  {/* Center Spine Crease Line */}
                  <div className="hidden sm:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-border/80 shadow-sm z-10 pointer-events-none" />

                  {/* Left Page Card */}
                  {spread.left ? (
                    <PageTile
                      page={spread.left}
                      positionLabel="Left (Even)"
                      statusById={statusById}
                      sectionById={sectionById}
                      data={data}
                      userId={userId}
                      canEdit={canEdit}
                      onOpen={() => setOpenPage(spread.left.id)}
                      onStatusChange={(statusId) =>
                        mUpdate.mutate({ id: spread.left.id, patch: { status_id: statusId } })
                      }
                    />
                  ) : (
                    <div className="p-4 rounded border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                      Blank Page
                    </div>
                  )}

                  {/* Right Page Card */}
                  {spread.right ? (
                    <PageTile
                      page={spread.right}
                      positionLabel="Right (Odd)"
                      statusById={statusById}
                      sectionById={sectionById}
                      data={data}
                      userId={userId}
                      canEdit={canEdit}
                      onOpen={() => setOpenPage(spread.right.id)}
                      onStatusChange={(statusId) =>
                        mUpdate.mutate({ id: spread.right.id, patch: { status_id: statusId } })
                      }
                    />
                  ) : (
                    <div className="p-4 rounded border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                      Inside Back Cover
                    </div>
                  )}
                </div>

                {/* Spread Footer Bar */}
                <div className="px-3 py-2 bg-card border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Pages {spread.left?.page_number ?? "—"} &amp; {spread.right?.page_number ?? "—"}
                  </span>
                  <span
                    className="flex items-center gap-1 text-primary font-medium hover:underline cursor-pointer"
                    onClick={() => setOpenPage(spread.left?.id || spread.right?.id)}
                  >
                    <Eye className="size-3" /> Inspect Spread
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 2. COMPACT LADDER LIST MODE */
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {paginatedPages.map((p: any) => {
            const st = p.status_id ? statusById[p.status_id] : undefined;
            const sec = p.section_id ? sectionById[p.section_id] : undefined;
            const reqs = (data?.requirements ?? []).filter((r: any) => r.page_id === p.id);
            const need = reqs.reduce((a: number, r: any) => a + r.needed, 0);
            const have = reqs.reduce((a: number, r: any) => a + r.have, 0);
            const as = (data?.assignments ?? []).filter((a: any) => a.page_id === p.id);
            const mine = as.some((a: any) => a.user_id === userId);

            return (
              <div
                key={p.id}
                className={`flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-muted/30 ${mine ? "bg-primary/5" : ""}`}
                style={{ borderLeft: `4px solid ${st?.color ?? "var(--border)"}` }}
              >
                <span className="w-10 text-center font-display font-bold text-base text-foreground">
                  {p.page_number ?? "—"}
                </span>

                <div className="min-w-52 flex-1">
                  <button
                    className="text-left font-semibold text-foreground hover:text-primary transition-colors text-sm"
                    onClick={() => setOpenPage(p.id)}
                  >
                    {p.title || `Page ${p.page_number || "Untitled"}`}
                  </button>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sec?.name ?? "No Section"}
                    {p.description ? ` · ${p.description}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${
                      need > 0 && have >= need
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                        : need > 0
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                          : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {have}/{need || 0} assets linked
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {as.map((a: any) => (
                    <Badge
                      key={a.id}
                      variant="secondary"
                      className="text-[10px] gap-1 pl-2 pr-1 py-0.5"
                    >
                      {a.kind === "designer" ? "🎨" : "✏️"} {nameOf(a.user_id)}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            doUnassign({ data: { id: a.id } })
                              .then(refresh)
                              .catch((e: Error) => toast.error(e.message))
                          }
                          aria-label={`Remove assignment for ${nameOf(a.user_id)}`}
                          className="hover:text-destructive ml-1 min-w-[24px] min-h-[24px] inline-flex items-center justify-center rounded-sm hover:bg-destructive/10"
                        >
                          ×
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>

                <select
                  value={p.status_id ?? ""}
                  onChange={(e) =>
                    mUpdate.mutate({ id: p.id, patch: { status_id: e.target.value } })
                  }
                  disabled={!canEdit}
                  aria-label="Page status"
                  className="h-8 w-40 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                >
                  <option value="" disabled>
                    Status
                  </option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {canEdit && (
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move page up"
                      className="size-7"
                      onClick={() => move(p.id, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move page down"
                      className="size-7"
                      onClick={() => move(p.id, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete page"
                        className="size-7 text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          doDelete({ data: { id: p.id } })
                            .then(refresh)
                            .catch((e: Error) => toast.error(e.message))
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(
              currentPage * PAGE_SIZE,
              viewMode === "spread" ? spreads.length : filtered.length,
            )}{" "}
            of {viewMode === "spread" ? `${spreads.length} spreads` : `${filtered.length} pages`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs font-semibold px-2">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Page Detailed Dialog */}
      {openPage && (
        <PageDialog
          page={(pages as any[]).find((p: any) => p.id === openPage) as any}
          requirements={((data?.requirements as any[]) ?? []).filter(
            (r: any) => r.page_id === openPage,
          )}
          sections={sections}
          pageTypes={pageTypes}
          yearbookId={yearbookId}
          canEdit={canEdit}
          onClose={() => setOpenPage(null)}
          onDone={refresh}
          onOpenPacket={(id: string) => setPacketPageId(id)}
        />
      )}

      {/* Page Preparation Packet Drawer */}
      <PagePreparationPacketDrawer
        isOpen={!!packetPageId}
        onClose={() => setPacketPageId(null)}
        pageId={packetPageId}
      />
    </div>
  );
}

/* ---------------- Visual Page Tile for Spreads ---------------- */

function PageTile({
  page,
  positionLabel,
  statusById,
  sectionById,
  data,
  userId,
  canEdit,
  onOpen,
  onStatusChange,
}: {
  page: any;
  positionLabel: string;
  statusById: Record<string, any>;
  sectionById: Record<string, any>;
  data: any;
  userId: string;
  canEdit: boolean;
  onOpen: () => void;
  onStatusChange: (statusId: string) => void;
}) {
  const st = page.status_id ? statusById[page.status_id] : undefined;
  const sec = page.section_id ? sectionById[page.section_id] : undefined;
  const reqs = (data?.requirements ?? []).filter((r: any) => r.page_id === page.id);
  const need = reqs.reduce((a: number, r: any) => a + r.needed, 0);
  const have = reqs.reduce((a: number, r: any) => a + r.have, 0);

  return (
    <div
      onClick={onOpen}
      className="p-3 rounded-lg bg-background border border-border shadow-2xs hover:border-primary/60 transition-all cursor-pointer flex flex-col justify-between space-y-2 group"
    >
      <div>
        <div className="flex items-center justify-between gap-1">
          <span className="size-6 rounded-md bg-muted flex items-center justify-center font-display font-bold text-xs text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            {page.page_number ?? "—"}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            {positionLabel}
          </span>
        </div>

        <h4 className="text-xs font-bold text-foreground mt-2 truncate group-hover:text-primary transition-colors">
          {page.title || `Page ${page.page_number || "Untitled"}`}
        </h4>
        <p className="text-[11px] text-muted-foreground truncate">{sec?.name || "No section"}</p>
      </div>

      <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground font-medium">
          {have}/{need || 0} Assets
        </span>
        {st && (
          <span className="px-1.5 py-0.5 rounded font-semibold flex items-center gap-1 border border-border bg-muted/60 text-foreground">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: st.color || "#3b82f6" }}
            />
            {st.name}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- Filter Select Dropdown ---------------- */

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Lookup[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground font-semibold">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-40 h-8 text-xs" aria-label={`Filter ladder by ${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All {label}s</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ---------------- Add Pages Dialog ---------------- */

function AddPagesDialog({
  yearbookId,
  sections,
  pageTypes,
  onDone,
}: {
  yearbookId: string;
  sections: Lookup[];
  pageTypes: Lookup[];
  onDone: () => void;
}) {
  const create = useServerFn(createPages);
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [count, setCount] = useState(2);
  const [title, setTitle] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 text-xs gap-1.5">
          <Plus className="size-3.5" /> Add Pages
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Pages to Ladder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="page-count-input">Page Count (Spreads are added in pairs)</Label>
            <Input
              id="page-count-input"
              aria-label="Page count"
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Section Category</Label>
            <Select {...(sectionId ? { value: sectionId } : {})} onValueChange={setSectionId}>
              <SelectTrigger aria-label="Select Section Category">
                <SelectValue placeholder="Select Section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Page Layout Type</Label>
            <Select {...(typeId ? { value: typeId } : {})} onValueChange={setTypeId}>
              <SelectTrigger aria-label="Select Page Layout Type">
                <SelectValue placeholder="Standard Spread" />
              </SelectTrigger>
              <SelectContent>
                {pageTypes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spread-title-input">Spread Title / Feature Name</Label>
            <Input
              id="spread-title-input"
              aria-label="Spread Title or Feature Name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Varsity Basketball Championship"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              create({
                data: {
                  yearbookId,
                  count,
                  sectionId: sectionId || null,
                  pageTypeId: typeId || null,
                  title,
                },
              })
                .then(() => {
                  setOpen(false);
                  onDone();
                })
                .catch((e: Error) => toast.error(e.message))
            }
          >
            Add to Page Ladder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Assign Range Dialog ---------------- */

function AssignRangeDialog({
  yearbookId,
  members,
  onDone,
}: {
  yearbookId: string;
  members: Member[];
  onDone: () => void;
}) {
  const assign = useServerFn(assignPages);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2);
  const [uid, setUid] = useState<string>("");
  const [kind, setKind] = useState<"designer" | "proofreader">("designer");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
          <UserPlus className="size-3.5" /> Assign Spread Range
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Staff to Page Spread Range</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Assign staff members to layout drafting or proofreading responsibilities.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from-page-input">From Page</Label>
              <Input
                id="from-page-input"
                aria-label="Starting page number"
                type="number"
                value={from}
                onChange={(e) => setFrom(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-page-input">To Page</Label>
              <Input
                id="to-page-input"
                aria-label="Ending page number"
                type="number"
                value={to}
                onChange={(e) => setTo(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Staff Member</Label>
            <Select {...(uid ? { value: uid } : {})} onValueChange={setUid}>
              <SelectTrigger aria-label="Select staff member for assignment">
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.profile?.full_name || m.profile?.email} · {m.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assignment Role</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "designer" | "proofreader")}>
              <SelectTrigger aria-label="Select assignment responsibility role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="designer">Designer / Layout Drafter</SelectItem>
                <SelectItem value="proofreader">Copy &amp; Photo Proofreader</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!uid) {
                toast.error("Pick a staff member");
                return;
              }
              assign({
                data: { yearbookId, fromPosition: from, toPosition: to, userId: uid, kind },
              })
                .then((r) => {
                  toast.success(`Assigned ${r.assigned} pages to ${kind}`);
                  setOpen(false);
                  onDone();
                })
                .catch((e: Error) => toast.error(e.message));
            }}
          >
            Confirm Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PageRow = {
  id: string;
  title: string | null;
  description: string | null;
  section_id: string | null;
  page_type_id: string | null;
  page_number: number | null;
  required_assets: string | null;
  notes: string | null;
  blocking_reason: string | null;
  canva_design_id: string | null;
  canva_design_url: string | null;
  design_status: string | null;
};

/* ---------------- Detailed Page Inspection Dialog ---------------- */

function PageDialog({
  page,
  requirements,
  sections,
  pageTypes,
  yearbookId,
  canEdit,
  onClose,
  onDone,
  onOpenPacket,
}: {
  page: PageRow;
  requirements: { id: string; label: string; needed: number; have: number }[];
  sections: Lookup[];
  pageTypes: Lookup[];
  yearbookId: string;
  canEdit: boolean;
  onClose: () => void;
  onDone: () => void;
  onOpenPacket?: (pageId: string) => void;
}) {
  const doUpdate = useServerFn(updatePage);
  const doSaveReq = useServerFn(saveRequirement);
  const doDelReq = useServerFn(deleteRequirement);
  const [form, setForm] = useState(page);
  const [newLabel, setNewLabel] = useState("");
  const [newNeeded, setNewNeeded] = useState(1);

  const set = (k: keyof PageRow, v: string | number | null) => setForm((f) => ({ ...f, [k]: v }));

  const fetchAssets = useServerFn(getAssets);
  const associate = useServerFn(associateAssetToPage);
  const [assetSearch, setAssetSearch] = useState("");

  const { data: assets } = useQuery({
    queryKey: ["assets", yearbookId, assetSearch],
    queryFn: () =>
      fetchAssets({ data: { yearbookId, filters: { search: assetSearch || undefined } } }),
    enabled: !!page?.id,
  });

  if (!page) return null;

  const handleLink = async (requirementId: string, assetId: string) => {
    try {
      await associate({ data: { pageId: page.id, requirementId, assetId } });
      toast.success("Asset linked to requirement");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              Page {page.page_number ?? ""} — {page.title || "Untitled Spread"}
            </DialogTitle>
            {onOpenPacket && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenPacket(page.id);
                  onClose();
                }}
                className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
              >
                <FileText className="size-3.5" /> Preparation Packet
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
          <div className="space-y-4">
            <h3 className="font-display font-bold text-lg">Spread Specifications</h3>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Page Title</Label>
                  <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Printed Page Number</Label>
                  <Input
                    type="number"
                    value={form.page_number ?? ""}
                    onChange={(e) =>
                      set("page_number", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Section Category</Label>
                  <Select
                    {...(form.section_id ? { value: form.section_id } : {})}
                    onValueChange={(v) => set("section_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Layout Type</Label>
                  <Select
                    {...(form.page_type_id ? { value: form.page_type_id } : {})}
                    onValueChange={(v) => set("page_type_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Standard" />
                    </SelectTrigger>
                    <SelectContent>
                      {pageTypes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description / Spread Notes</Label>
                <Textarea
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Outline topics, interviewees, or photo requirements..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Pre-flight Blocking Reasons</Label>
                <Input
                  value={form.blocking_reason ?? ""}
                  onChange={(e) => set("blocking_reason", e.target.value)}
                  placeholder="e.g. Missing varsity team caption, low-res portrait"
                />
              </div>
            </div>
          </div>

          {/* Asset & Requirement Section */}
          <div className="space-y-6">
            <h3 className="font-display font-bold text-lg">Photo Assets &amp; Requirements</h3>

            <div className="rounded-xl border p-4 space-y-4 bg-muted/20">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ImageIcon className="size-4 text-primary" /> Asset Linker
              </h4>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search assets by file name..."
                  className="pl-8 h-8 text-xs"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                />
              </div>

              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                {assets?.map((asset: any) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between gap-3 p-2 bg-background rounded-lg border border-border group"
                  >
                    <div className="flex items-center gap-3 truncate">
                      {asset.asset_type === "photo" && asset.storage_path ? (
                        <img
                          src={asset.storage_path}
                          className="size-9 rounded object-cover"
                          alt=""
                        />
                      ) : (
                        <div className="size-9 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="size-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="truncate">
                        <p className="text-xs font-medium truncate">{asset.file_name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {asset.status || "Ready"}
                        </p>
                      </div>
                    </div>

                    <Select onValueChange={(rid) => handleLink(rid, asset.id)}>
                      <SelectTrigger
                        aria-label="Link asset to photo requirement"
                        className="w-[110px] h-7 text-[10px]"
                      >
                        <SelectValue placeholder="Link asset..." />
                      </SelectTrigger>
                      <SelectContent>
                        {requirements.map((r) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {r.label} ({r.have}/{r.needed})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Requirements List */}
            <div className="rounded-xl border p-4 space-y-3 bg-card">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Required Photo Slots
              </h4>
              <div className="space-y-2">
                {requirements.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border border-border text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {r.have >= r.needed ? (
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <div className="size-4 rounded-full border-2 border-amber-500" />
                      )}
                      <span className="font-semibold text-foreground">{r.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">
                        {r.have} / {r.needed}
                      </span>
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete requirement ${r.label}`}
                          className="size-6 text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            doDelReq({ data: { id: r.id } })
                              .then(onDone)
                              .catch((err: Error) => toast.error(err.message))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {requirements.length === 0 && (
                  <p className="text-xs text-muted-foreground italic text-center py-2">
                    No photo requirements specified yet.
                  </p>
                )}

                {canEdit && (
                  <div className="pt-2 border-t flex gap-2">
                    <Input
                      aria-label="New requirement label"
                      placeholder="e.g. Varsity Team Captain Portrait"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      aria-label="Needed photo count"
                      className="w-16 h-8 text-xs"
                      type="number"
                      value={newNeeded}
                      onChange={(e) => setNewNeeded(Number(e.target.value))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs shrink-0"
                      onClick={() => {
                        if (!newLabel.trim()) return;
                        doSaveReq({
                          data: {
                            pageId: page.id,
                            yearbookId,
                            label: newLabel.trim(),
                            needed: newNeeded,
                            have: 0,
                            position: requirements.length + 1,
                          },
                        })
                          .then(() => {
                            setNewLabel("");
                            onDone();
                          })
                          .catch((err: Error) => toast.error(err.message));
                      }}
                    >
                      Add Slot
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 border-t pt-4">
          <Button
            disabled={!canEdit}
            onClick={() =>
              doUpdate({
                data: {
                  id: page.id,
                  patch: {
                    title: form.title,
                    description: form.description,
                    section_id: form.section_id,
                    page_type_id: form.page_type_id,
                    page_number: form.page_number,
                    required_assets: form.required_assets,
                    notes: form.notes,
                    blocking_reason: form.blocking_reason,
                    canva_design_id: form.canva_design_id,
                    canva_design_url: form.canva_design_url,
                  },
                },
              })
                .then(() => {
                  toast.success("Spread details saved");
                  onDone();
                  onClose();
                })
                .catch((e: Error) => toast.error(e.message))
            }
          >
            Save Spread Details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
