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

export function LadderTab({
  yearbookId,
  sections,
  pageTypes,
  statuses,
  members,
  canEdit,
  canManage,
  userId,
}: {
  yearbookId: string;
  sections: Lookup[];
  pageTypes: Lookup[];
  statuses: (Lookup & { color: string })[];
  members: Member[];
  canEdit: boolean;
  canManage: boolean;
  userId: string;
}) {
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
  const [currentPage, setCurrentPage] = useState(1);
  const [openPage, setOpenPage] = useState<string | null>(null);

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

  const filtered = useMemo(
    () =>
      pages.filter((p: any) => {
        if (fSection !== "all" && p.section_id !== fSection) return false;
        if (fStatus !== "all" && p.status_id !== fStatus) return false;
        if (fAssignee !== "all") {
          const as = (data?.assignments ?? []).filter((a: any) => a.page_id === p.id);
          if (!as.some((a: any) => a.user_id === fAssignee)) return false;
        }
        return true;
      }),
    [pages, fSection, fStatus, fAssignee, data],
  );

  const PAGE_SIZE = 12;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const statusById = Object.fromEntries(statuses.map((s) => [s.id, s]));
  const sectionById = Object.fromEntries(sections.map((s) => [s.id, s]));

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

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect label="Section" value={fSection} onChange={setFSection} options={sections} />
        <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={statuses} />
        <div className="space-y-1.5">
          <Label className="text-xs">Assignee</Label>
          <Select value={fAssignee} onValueChange={setFAssignee}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {nameOf(m.user_id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
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
              onClick={() =>
                doRenumber({ data: { yearbookId, startAt: 1 } })
                  .then(() => {
                    toast.success("Pages renumbered from 1");
                    refresh();
                  })
                  .catch((e: Error) => toast.error(e.message))
              }
            >
              <ListOrdered className="size-4" /> Renumber
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {statuses.map((s) => {
          const count = (pages as any[]).filter((p: any) => p.status_id === s.id).length;
          return (
            <span
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name} · {count}
            </span>
          );
        })}
      </div>

      <div className="plate mt-4 divide-y overflow-hidden">
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No pages match. Add pages to start building the ladder.
          </p>
        )}
        {paginated.map((p: any) => {
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
              className={`flex flex-wrap items-center gap-3 p-3 ${mine ? "bg-accent/10" : ""}`}
              style={{ borderLeft: `4px solid ${st?.color ?? "transparent"}` }}
            >
              <span className="w-10 text-center font-display text-lg">{p.page_number ?? "—"}</span>
              <div className="min-w-52 flex-1">
                <button
                  className="text-left font-medium hover:underline"
                  onClick={() => setOpenPage(p.id)}
                >
                  {p.title || "Untitled page"}
                </button>
                <p className="text-xs text-muted-foreground">
                  {sec?.name ?? "No section"}
                  {p.description ? ` · ${p.description}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={
                    need > 0 && have < need
                      ? "rounded bg-destructive/10 px-2 py-1 text-destructive"
                      : "rounded bg-muted px-2 py-1 text-muted-foreground"
                  }
                >
                  {have}/{need} assets
                </span>
                {p.blocking_reason && (
                  <span className="rounded bg-destructive/10 px-2 py-1 text-destructive">
                    {p.blocking_reason}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {as.map((a: any) => (
                  <Badge key={a.id} variant="secondary" className="gap-1">
                    {a.kind === "designer" ? "D" : "P"}: {nameOf(a.user_id)}
                    {canEdit && (
                      <button
                        onClick={() =>
                          doUnassign({ data: { id: a.id } })
                            .then(refresh)
                            .catch((e: Error) => toast.error(e.message))
                        }
                        aria-label="Remove assignment"
                      >
                        ×
                      </button>
                    )}
                  </Badge>
                ))}
              </div>

              <select
                value={p.status_id ?? ""}
                onChange={(e) => mUpdate.mutate({ id: p.id, patch: { status_id: e.target.value } })}
                disabled={!canEdit}
                aria-label="Page status"
                className="h-8 w-44 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring font-medium"
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
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => move(p.id, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => move(p.id, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  {canManage && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        doDelete({ data: { id: p.id } })
                          .then(refresh)
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 bg-muted/20 border-t">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} pages
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
              <span className="text-xs font-medium px-2">
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
      </div>

      {openPage && (
        <PageDialog
          key={openPage}
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
        />
      )}
    </div>
  );
}

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
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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
  const [count, setCount] = useState(1);
  const [title, setTitle] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Pages
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add pages</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>How many</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Section</Label>
            <Select {...(sectionId ? { value: sectionId } : {})} onValueChange={setSectionId}>
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
            <Label>Page type</Label>
            <Select {...(typeId ? { value: typeId } : {})} onValueChange={setTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="No type" />
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
            <Label>Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
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
            Add to ladder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [to, setTo] = useState(1);
  const [uid, setUid] = useState<string>("");
  const [kind, setKind] = useState<"designer" | "proofreader">("designer");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="size-4" /> Assign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a page range</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Range uses ladder position (order), not printed page number.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From position</Label>
              <Input type="number" value={from} onChange={(e) => setFrom(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>To position</Label>
              <Input type="number" value={to} onChange={(e) => setTo(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Person</Label>
            <Select {...(uid ? { value: uid } : {})} onValueChange={setUid}>
              <SelectTrigger>
                <SelectValue placeholder="Select member" />
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
            <Label>As</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "designer" | "proofreader")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="proofreader">Proofreader</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!uid) {
                toast.error("Pick a person");
                return;
              }
              assign({
                data: { yearbookId, fromPosition: from, toPosition: to, userId: uid, kind },
              })
                .then((r) => {
                  toast.success(`Assigned ${r.assigned} pages`);
                  setOpen(false);
                  onDone();
                })
                .catch((e: Error) => toast.error(e.message));
            }}
          >
            Assign
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

function PageDialog({
  page,
  requirements,
  sections,
  pageTypes,
  yearbookId,
  canEdit,
  onClose,
  onDone,
}: {
  page: PageRow;
  requirements: { id: string; label: string; needed: number; have: number }[];
  sections: Lookup[];
  pageTypes: Lookup[];
  yearbookId: string;
  canEdit: boolean;
  onClose: () => void;
  onDone: () => void;
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
    enabled: !!page.id,
  });

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
          <DialogTitle>
            Page {page.page_number ?? ""} - {page.title || "Untitled"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="font-display text-lg">Page Details</h3>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Printed page number</Label>
                  <Input
                    type="number"
                    value={form.page_number ?? ""}
                    onChange={(e) =>
                      set("page_number", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Section</Label>
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
                  <Label>Page type</Label>
                  <Select
                    {...(form.page_type_id ? { value: form.page_type_id } : {})}
                    onValueChange={(v) => set("page_type_id", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No type" />
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
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Required assets</Label>
                <Textarea
                  rows={2}
                  value={form.required_assets ?? ""}
                  onChange={(e) => set("required_assets", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Blocking reason</Label>
                <Input
                  value={form.blocking_reason ?? ""}
                  onChange={(e) => set("blocking_reason", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Asset Section */}
          <div className="space-y-6">
            <h3 className="font-display text-lg">Requirements & Assets</h3>

            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ImageIcon className="size-4" /> Asset Linker
              </h4>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search assets to link..."
                  className="pl-8"
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                {assets?.map((asset: any) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between gap-3 p-2 bg-muted/30 rounded-lg group"
                  >
                    <div className="flex items-center gap-3 truncate">
                      {asset.asset_type === "photo" ? (
                        <img src={asset.storage_path} className="size-10 rounded object-cover" />
                      ) : (
                        <div className="size-10 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="size-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="truncate">
                        <p className="text-xs font-medium truncate">{asset.file_name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {asset.status}
                        </p>
                      </div>
                    </div>

                    <Select onValueChange={(rid) => handleLink(rid, asset.id)}>
                      <SelectTrigger className="w-[120px] h-8 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
                        <SelectValue placeholder="Link to..." />
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

            <div className="rounded-md border p-4">
              <h4 className="font-display text-lg">Active Requirements</h4>
              <div className="mt-4 space-y-3">
                {requirements.map((r) => (
                  <div
                    key={r.id}
                    className="space-y-2 bg-muted/20 p-3 rounded-lg border border-border/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {r.have >= r.needed ? (
                          <CheckCircle2 className="size-4 text-green-500" />
                        ) : (
                          <div className="size-4 rounded-full border-2 border-muted" />
                        )}
                        <span className="text-sm font-medium">{r.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">
                          {r.have} / {r.needed}
                        </span>
                        {canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6"
                            onClick={() =>
                              doDelReq({ data: { id: r.id } })
                                .then(onDone)
                                .catch((err: Error) => toast.error(err.message))
                            }
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {requirements.length === 0 && (
                  <p className="text-xs text-muted-foreground italic text-center py-4">
                    No requirements yet — e.g. “8 portraits”, “1 class photo”.
                  </p>
                )}

                {canEdit && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                        Add new requirement
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Label (e.g. Portrait)"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Input
                          className="w-16 h-8 text-xs"
                          type="number"
                          value={newNeeded}
                          onChange={(e) => setNewNeeded(Number(e.target.value))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs px-2"
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
                          Add
                        </Button>
                      </div>
                    </div>
                  </>
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
                  toast.success("Page saved");
                  onDone();
                  onClose();
                })
                .catch((e: Error) => toast.error(e.message))
            }
          >
            Save all changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
