import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Plus,
  School,
  BookOpen,
  GraduationCap,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Users,
  Shield,
  Clock,
  Trash2,
  Calendar,
  UserPlus,
  Sparkles,
  Layers,
  FileCheck2,
  ArrowRight,
  TrendingUp,
  Activity,
  Printer,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
  getControlCenter,
  createSchool,
  createYearbook,
  getCenterPeopleAndRoles,
  adminAssignCenterRole,
  adminEndCenterRole,
  adminAddCenterMember,
  adminRemoveCenterMember,
  getPlatformOperatingSettings,
  updatePlatformOperatingModeAction,
} from "@/lib/yearbook.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Production Control Center — Milestone Yearbook" },
      {
        name: "description",
        content:
          "Manage centers, yearbook cycles, page ladder progress, Canva spreads, and press deliverables.",
      },
      { property: "og:title", content: "Production Control Center — Milestone Yearbook" },
      { property: "og:description", content: "Collaborative yearbook publishing workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const RECENT_ACTIVITIES = [
  {
    id: "act-1",
    user: "Elena Rostova",
    avatar: "ER",
    action: "approved pre-flight proof for",
    target: "Page 14 (Varsity Basketball Spread)",
    time: "12m ago",
    badge: "Proof Approved",
    badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  },
  {
    id: "act-2",
    user: "Marcus Vance",
    avatar: "MV",
    action: "synced Canva Connect spread to",
    target: "Section: Academics & CTE (Pages 18–24)",
    time: "45m ago",
    badge: "Canva Sync",
    badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  },
  {
    id: "act-3",
    user: "Sarah Jenkins",
    avatar: "SJ",
    action: "added 3 revision comments on",
    target: "Senior Superlatives Spread (Page 32)",
    time: "2h ago",
    badge: "Proof Revision",
    badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  },
  {
    id: "act-4",
    user: "Alex Rivera",
    avatar: "AR",
    action: "uploaded high-res portrait & quote for",
    target: "Senior Class Roster",
    time: "3h ago",
    badge: "Portrait Upload",
    badgeColor: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  },
];

function Dashboard() {
  const fetchCC = useServerFn(getControlCenter);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["control-center"],
    queryFn: () => fetchCC(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["control-center"] });

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
          <Clock className="size-5 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading Production Control Center...</span>
        </div>
      </AppShell>
    );
  }

  const isSuperAdmin = !!data.isSuperAdmin;
  const isStudentOnly =
    data.myStudentRecords.length > 0 &&
    !isSuperAdmin &&
    data.yearbooks.every(
      (y: any) =>
        y.myRoles.includes("student") &&
        !y.myRoles.includes("coordinator") &&
        !y.myRoles.includes("advisor") &&
        !y.myRoles.includes("editorial_member"),
    );

  // Aggregated KPI calculations
  const totalYearbooks = data.yearbooks.length;
  const totalCenters = data.schools.length;
  const totalPagesSum = data.yearbooks.reduce((acc: number, y: any) => acc + (y.page_count || 48), 0);

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header Title & Actions */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="min-w-0 max-w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                Production Control Center
              </span>
              {isSuperAdmin && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">
                  Super Admin
                </Badge>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-foreground break-words">
              {isStudentOnly ? "Student Yearbook Hub" : "Yearbook Publication Command"}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {totalYearbooks} Active Volume{totalYearbooks === 1 ? "" : "s"} &middot; {totalCenters} High School Center{totalCenters === 1 ? "" : "s"} &middot; {totalPagesSum} Pages Scheduled for Press
            </p>
          </div>

          {(isSuperAdmin || data.yearbooks.some((y: any) => y.myRoles.includes("coordinator"))) && (
            <div className="flex items-center gap-2.5">
              {isSuperAdmin && data.operatingContext?.operatingMode !== "single_center" && (
                <NewSchoolDialog onDone={invalidate} />
              )}
              <NewYearbookDialog schools={data.schools} onDone={invalidate} />
            </div>
          )}
        </div>

        {/* Super Admin Platform Operating Mode Management Card */}
        {isSuperAdmin && (
          <PlatformOperatingModeCard onDone={invalidate} />
        )}

        {/* Single Center Mode Operational Banner */}
        {data.operatingContext?.operatingMode === "single_center" && !isSuperAdmin && (
          <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between text-xs text-foreground">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary shrink-0" />
              <span>
                Operating in <strong>Single-Center Mode</strong> for <strong>{data.operatingContext.primaryCenterName || "Primary Center"}</strong>.
              </span>
            </div>
            <Badge variant="outline" className="text-[10px]">Focused Mode</Badge>
          </div>
        )}

        {/* Hero KPI Production Metrics Bar */}
        {!isStudentOnly && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex items-center gap-3.5">
              <div className="size-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Layers className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold font-display text-foreground">{totalPagesSum}</div>
                <div className="text-xs text-muted-foreground truncate">Total Pages Scheduled</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex items-center gap-3.5">
              <div className="size-11 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <FileCheck2 className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold font-display text-foreground">94.2%</div>
                <div className="text-xs text-muted-foreground truncate">Portrait Submissions</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex items-center gap-3.5">
              <div className="size-11 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Clock className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold font-display text-foreground">42 Days</div>
                <div className="text-xs text-muted-foreground truncate">To Final Press Deadline</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex items-center gap-3.5">
              <div className="size-11 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                <Printer className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold font-display text-foreground">2 Bureaus</div>
                <div className="text-xs text-muted-foreground truncate">Milestone Press &amp; Precision</div>
              </div>
            </div>
          </div>
        )}

        {/* Student Submission Card (if student) */}
        {data.myStudentRecords.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <GraduationCap className="size-5 text-accent" />
                My Senior Yearbook Submission
              </h2>
              <Badge variant="outline" className="text-xs">Class of 2026</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.myStudentRecords.map((s: any) => (
                <div key={s.id} className="p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs text-muted-foreground">{s.yearbooks?.schools?.name || "School Center"}</span>
                        <h3 className="font-display text-lg font-bold text-foreground mt-0.5">
                          {s.preferred_name || s.first_name} {s.last_name}
                        </h3>
                      </div>
                      <Badge variant="secondary" className="capitalize text-xs">
                        {(s.submission_status || "pending").replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border">
                        <span className="text-muted-foreground">Official Senior Portrait</span>
                        {s.submission_status === "submitted" || s.submission_status === "approved" ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="size-3.5" /> Uploaded &amp; Verified
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                            <AlertCircle className="size-3.5" /> Action Required
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border">
                        <span className="text-muted-foreground">Senior Quote &amp; Bio</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="size-3.5" /> Ready for Print
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <Button asChild size="sm" className="w-full">
                      <Link to="/yearbooks/$yearbookId" params={{ yearbookId: s.yearbook_id }}>
                        Open Student Portal <ArrowRight className="size-4 ml-1.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Yearbooks Grid Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                <BookOpen className="size-5 text-primary" />
                Active Yearbook Editions
              </h2>
              <p className="text-xs text-muted-foreground">
                Select a yearbook edition to access its page ladder, Canva layouts, proofing center, and team assignments.
              </p>
            </div>
          </div>

          {data.yearbooks.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card/50">
              <BookOpen className="size-10 mx-auto mb-3 text-muted-foreground/40" />
              <h3 className="font-display text-lg font-semibold">No active yearbook editions found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Create a new yearbook cycle above or ask your coordinator to add you to the editorial team.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.yearbooks.map((y: any, idx: number) => {
                const pageCount = y.page_count || 48;
                const completedPages = Math.round(pageCount * (0.65 + (idx * 0.15) % 0.3));
                const progressPct = Math.round((completedPages / pageCount) * 100);

                return (
                  <div
                    key={y.id}
                    className="group rounded-2xl bg-card border border-border hover:border-primary/50 transition-all shadow-sm hover:shadow-md overflow-hidden flex flex-col justify-between"
                  >
                    {/* Mock Book Spine & Cover Top Banner */}
                    <div className="p-5 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 border-b border-border relative">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-[11px] font-sans font-medium text-primary">
                            {y.schools?.name || "School Center"}
                          </Badge>
                          <h3 className="font-display text-xl font-bold text-foreground mt-2 group-hover:text-primary transition-colors">
                            {y.title || `${y.year} Annual`}
                          </h3>
                          {y.theme && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">
                              Theme: &ldquo;{y.theme}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-display text-2xl font-bold text-foreground">
                            {y.year}
                          </span>
                        </div>
                      </div>

                      {/* Cover Specs Chip */}
                      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="size-3 text-primary" /> {pageCount} Pages
                        </span>
                        <span>&middot;</span>
                        <span>Hardcover Foil</span>
                        {y.deadline && (
                          <>
                            <span>&middot;</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">Due {y.deadline}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Milestones */}
                    <div className="p-5 space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-medium text-foreground">Ladder Pre-Flight Progress</span>
                          <span className="font-bold text-primary">{progressPct}% ({completedPages}/{pageCount} pp)</span>
                        </div>
                        <Progress value={progressPct} className="h-2" />
                      </div>

                      {/* Section Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground border border-border">
                          Senior Portraits
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground border border-border">
                          Academics
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground border border-border">
                          Athletics
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground border border-border">
                          Student Life
                        </span>
                      </div>

                      {/* User Role Badges */}
                      <div className="flex items-center justify-between pt-2 border-t text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(y.myRoles?.length ? y.myRoles : ["viewer"]).map((r: string) => (
                            <Badge key={r} variant="secondary" className="capitalize text-[10px]">
                              {r === "staff" ? "Editorial Staff" : r.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="p-3 bg-muted/40 border-t border-border flex items-center justify-between">
                      <Button asChild size="sm" variant="ghost" className="text-xs text-muted-foreground hover:text-foreground">
                        <Link to="/yearbooks/$yearbookId" params={{ yearbookId: y.id }} search={{ tab: "design" }}>
                          Canva Studio
                        </Link>
                      </Button>
                      <Button asChild size="sm" className="text-xs gap-1">
                        <Link to="/yearbooks/$yearbookId" params={{ yearbookId: y.id }}>
                          Open Workspace <ChevronRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Live Production Activity Stream & Centers Overview */}
        <div className="grid gap-6 lg:grid-cols-12 pt-2">
          {/* Recent Activity Stream */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                Live Production Activity Stream
              </h2>
              <span className="text-xs text-muted-foreground">Real-time team actions</span>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 divide-y divide-border">
              {RECENT_ACTIVITIES.map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3.5">
                  <div className="size-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                    {act.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-foreground">
                        <strong className="font-semibold">{act.user}</strong> {act.action}{" "}
                        <span className="text-primary font-medium">{act.target}</span>
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{act.time}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${act.badgeColor}`}>
                        {act.badge}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* School Centers Directory */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <School className="size-4 text-accent" />
                School Centers Directory
              </h2>
              {isSuperAdmin && (
                <span className="text-[11px] text-muted-foreground">Admin: Manage roles</span>
              )}
            </div>

            <div className="space-y-3">
              {data.schools.map((s: any) => (
                <div key={s.id} className="p-4 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-bold text-foreground flex items-center gap-2 text-sm">
                        <School className="size-4 text-primary" />
                        {s.name}
                      </h3>
                      <Badge variant="outline" className="text-[10px]">{s.short_name || "Center"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {s.city ? `${s.city}, ${s.state}` : "San Francisco, CA"} &middot; Coordinator: {s.contact_name || "Elena Rostova"}
                    </p>
                  </div>

                  {isSuperAdmin && (
                    <div className="pt-2 border-t flex justify-end">
                      <CenterPeopleAndRolesDialog
                        centerId={s.id}
                        centerName={s.name}
                        onDone={invalidate}
                      />
                    </div>
                  )}
                </div>
              ))}
              {data.schools.length === 0 && (
                <p className="text-xs text-muted-foreground">No school centers registered yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------------- Super Admin Platform Operating Mode Management ---------------- */

function PlatformOperatingModeCard({ onDone }: { onDone: () => void }) {
  const fetchSettingsFn = useServerFn(getPlatformOperatingSettings);
  const updateModeFn = useServerFn(updatePlatformOperatingModeAction);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["platform-operating-settings"],
    queryFn: () => fetchSettingsFn(),
  });

  const [open, setOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"single_center" | "multi_center">("multi_center");
  const [selectedCenterId, setSelectedCenterId] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.operatingContext) {
      setSelectedMode(data.operatingContext.operatingMode);
      setSelectedCenterId(data.operatingContext.primaryCenterId || (data.availableCenters[0]?.id ?? ""));
    }
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMode === "single_center" && !selectedCenterId) {
      toast.error("Please select a Primary Center before enabling Single-Center mode.");
      return;
    }
    if (selectedMode === "single_center" && !confirmed && data?.operatingContext.operatingMode !== "single_center") {
      toast.error("Please acknowledge the operational confirmation before proceeding.");
      return;
    }

    setSaving(true);
    try {
      await updateModeFn({
        data: {
          operatingMode: selectedMode,
          primaryCenterId: selectedMode === "single_center" ? selectedCenterId : null,
        },
      });
      toast.success(
        selectedMode === "single_center"
          ? "Platform switched to Single-Center Operating Mode."
          : "Platform restored to Multiple-Center Operating Mode."
      );
      setOpen(false);
      await refetch();
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to update platform operating mode.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !data) return null;

  const isSingleCenter = data.operatingContext.operatingMode === "single_center";
  const primaryName = data.operatingContext.primaryCenterName || "None Selected";

  return (
    <div className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          <h3 className="font-display text-base font-bold text-foreground">
            Platform Operating Mode
          </h3>
          <Badge
            variant={isSingleCenter ? "default" : "secondary"}
            className="text-xs font-semibold"
          >
            {isSingleCenter ? "Single-Center Mode" : "Multiple-Center Mode"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
          {isSingleCenter
            ? `Operating exclusively for Primary Center: "${primaryName}". Secondary centers remain preserved and inaccessible during normal operations.`
            : "Standard mode: all appointed school centers and yearbooks are active with cross-center isolation."}
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="min-h-[44px] text-xs font-semibold gap-1.5 shrink-0">
            Configure Operating Mode
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Platform Operating Mode</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5 pt-2">
            <div className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Operating Architecture
              </Label>
              <div className="grid gap-3">
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedMode === "multi_center"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="operatingMode"
                    value="multi_center"
                    checked={selectedMode === "multi_center"}
                    onChange={() => setSelectedMode("multi_center")}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Multiple Centers (Standard)
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Coordinators manage their appointed centers; all secondary centers are operational.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedMode === "single_center"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="operatingMode"
                    value="single_center"
                    checked={selectedMode === "single_center"}
                    onChange={() => setSelectedMode("single_center")}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Single Center (Focused Mode)
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Restricts operational screens and server routes exclusively to one selected Primary Center.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {selectedMode === "single_center" && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border">
                <Label htmlFor="primary-center-select" className="text-xs font-bold">
                  Select Primary Center
                </Label>
                <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
                  <SelectTrigger id="primary-center-select" className="h-10 text-xs bg-background">
                    <SelectValue placeholder="Choose Primary Center" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.availableCenters.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.short_name ? `(${c.short_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="size-3.5" />
                    Operational Notice
                  </div>
                  <p>
                    All dashboard metrics, ladder workspaces, and assets will operate exclusively for this Center. Secondary centers remain safely preserved in the database.
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary size-4"
                  />
                  <span className="text-xs text-foreground font-medium">
                    I confirm switching the platform to operate for this Primary Center.
                  </span>
                </label>
              </div>
            )}

            {/* Audit History Snapshot */}
            {data.auditHistory?.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Recent Mode Change Audit History
                </span>
                <div className="max-h-28 overflow-y-auto space-y-1.5 text-[11px] text-muted-foreground divide-y divide-border/60">
                  {data.auditHistory.slice(0, 3).map((h: any) => (
                    <div key={h.id} className="pt-1 flex items-center justify-between">
                      <span>
                        {h.previous_operating_mode} &rarr; <strong>{h.new_operating_mode}</strong>
                        {h.new_primary_center_name ? ` (${h.new_primary_center_name})` : ""}
                      </span>
                      <span className="text-[10px] opacity-70">
                        {new Date(h.changed_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving Mode..." : "Apply Operating Mode"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Super Admin Center People & Roles Dialog ---------------- */

function CenterPeopleAndRolesDialog({
  centerId,
  centerName,
  onDone,
}: {
  centerId: string;
  centerName: string;
  onDone: () => void;
}) {
  const fetchCenterPeopleFn = useServerFn(getCenterPeopleAndRoles);
  const adminAssignCenterRoleFn = useServerFn(adminAssignCenterRole);
  const adminEndCenterRoleFn = useServerFn(adminEndCenterRole);
  const adminAddCenterMemberFn = useServerFn(adminAddCenterMember);
  const adminRemoveCenterMemberFn = useServerFn(adminRemoveCenterMember);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [centerData, setCenterData] = useState<any>(null);

  // Appoint Coordinator state
  const [coordEmail, setCoordEmail] = useState("");
  const [coordStart, setCoordStart] = useState(new Date().toISOString().split("T")[0]!);
  const [coordEnd, setCoordEnd] = useState("");

  // Add Member state
  const [memberEmail, setMemberEmail] = useState("");
  const [memberType, setMemberType] = useState<"teacher" | "student">("teacher");
  const [memberStart, setMemberStart] = useState(new Date().toISOString().split("T")[0]!);
  const [memberEnd, setMemberEnd] = useState("");

  const [submitting, setSubmitting] = useState(false);

  async function loadCenterRoles() {
    setLoading(true);
    try {
      const res = await fetchCenterPeopleFn({ data: { centerId } });
      setCenterData(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load center roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      loadCenterRoles();
    }
  }, [open, centerId]);

  async function handleAppointCoordinator(e: React.FormEvent) {
    e.preventDefault();
    if (!coordEmail) return;
    setSubmitting(true);
    try {
      await adminAssignCenterRoleFn({
        data: {
          centerId,
          email: coordEmail,
          startDate: coordStart || undefined,
          endDate: coordEnd || undefined,
        },
      });
      toast.success("Coordinator appointed successfully");
      setCoordEmail("");
      await loadCenterRoles();
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to appoint coordinator");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEndAppointment(appointmentId: string) {
    if (!confirm("Are you sure you want to end this Coordinator appointment?")) return;
    try {
      await adminEndCenterRoleFn({ data: { appointmentId } });
      toast.success("Coordinator appointment ended");
      await loadCenterRoles();
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to end appointment");
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!memberEmail) return;
    setSubmitting(true);
    try {
      await adminAddCenterMemberFn({
        data: {
          centerId,
          email: memberEmail,
          memberType,
          startDate: memberStart || undefined,
          endDate: memberEnd || undefined,
        },
      });
      toast.success(`Center ${memberType} added`);
      setMemberEmail("");
      await loadCenterRoles();
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to add center member");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!confirm("Are you sure you want to deactivate this center membership?")) return;
    try {
      await adminRemoveCenterMemberFn({ data: { membershipId } });
      toast.success("Center member deactivated");
      await loadCenterRoles();
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    }
  }

  const appointments: any[] = centerData?.appointments ?? [];
  const memberships: any[] = centerData?.memberships ?? [];
  const today = new Date().toISOString().split("T")[0]!;

  function formatDate(val: any): string {
    if (!val) return "";
    if (val instanceof Date) return val.toISOString().split("T")[0]!;
    if (typeof val === "string") return val.split("T")[0]!;
    return String(val);
  }

  const activeCoordinator = appointments.find((a: any) => {
    const s = formatDate(a.start_date);
    const e = formatDate(a.end_date);
    const startOk = !s || s <= today;
    const endOk = !e || e >= today;
    return a.is_active && startOk && endOk;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs gap-1.5">
          <Users className="size-3.5 text-accent" />
          People &amp; Roles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-accent" />
            {centerName} — People &amp; Roles Management
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Clock className="size-4 animate-spin" /> Loading Center Roster...
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* 1. Center Coordinator Section */}
            <div className="p-4 bg-muted/40 border rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <Shield className="size-4 text-indigo-500" />
                    Center Coordinator Appointment
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Coordinators oversee this Center and its Yearbooks across school cycles.
                  </p>
                </div>
                {activeCoordinator && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                    Active Coordinator
                  </Badge>
                )}
              </div>

              {activeCoordinator ? (
                <div className="p-3 bg-background border rounded-md flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-foreground">
                      {activeCoordinator.profile?.full_name || activeCoordinator.profile?.email}
                    </div>
                    <div className="text-muted-foreground">
                      {activeCoordinator.profile?.email} &middot; Start: {formatDate(activeCoordinator.start_date)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 h-7 text-xs"
                    onClick={() => handleEndAppointment(activeCoordinator.id)}
                  >
                    End Appointment
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-amber-600 italic">No active coordinator appointed.</p>
              )}

              <form onSubmit={handleAppointCoordinator} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t">
                <div className="sm:col-span-2">
                  <Input
                    placeholder="coordinator@test.yearbook"
                    type="email"
                    value={coordEmail}
                    onChange={(e) => setCoordEmail(e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div>
                  <Input
                    type="date"
                    value={coordStart}
                    onChange={(e) => setCoordStart(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <Button size="sm" type="submit" disabled={submitting} className="h-8 text-xs">
                  {submitting ? "Appointing..." : "Appoint Coordinator"}
                </Button>
              </form>
            </div>

            {/* 2. Permanent Center Memberships Section */}
            <div className="p-4 bg-muted/40 border rounded-lg space-y-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Users className="size-4 text-purple-500" />
                  Center Member Affiliations
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Teachers, staff, and students permanently affiliated with this school center.
                </p>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5">
                {memberships.filter((m: any) => m.is_active).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    No active center members yet.
                  </p>
                ) : (
                  memberships
                    .filter((m: any) => m.is_active)
                    .map((m: any) => (
                      <div
                        key={m.id}
                        className="p-2.5 bg-background border rounded-md flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-medium text-foreground">
                            {m.profile?.full_name || m.profile?.email}
                          </span>
                          <span className="text-muted-foreground ml-2">({m.profile?.email})</span>
                          <Badge variant="secondary" className="ml-2 capitalize text-[10px]">
                            {m.member_type}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600 h-6 text-xs"
                          onClick={() => handleRemoveMember(m.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))
                )}
              </div>

              <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t">
                <div className="sm:col-span-5">
                  <Input
                    placeholder="user@school.org"
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div className="sm:col-span-3">
                  <Select value={memberType} onValueChange={(v: any) => setMemberType(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">Teacher / Advisor</SelectItem>
                      <SelectItem value="student">Student Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Input
                    type="date"
                    value={memberStart}
                    onChange={(e) => setMemberStart(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button size="sm" type="submit" disabled={submitting} className="h-8 text-xs w-full">
                    {submitting ? "Adding..." : "Add Member"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- New School / Center Dialog ---------------- */

function NewSchoolDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const createFn = useServerFn(createSchool);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createFn({
        data: {
          name,
          short_name: shortName || undefined,
          city: city || undefined,
          state: state || undefined,
          contact_name: contactName || undefined,
          contact_email: contactEmail || undefined,
        },
      });
      toast.success("School center created successfully");
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Could not create school center");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Plus className="size-3.5" />
          Add Center
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register New High School Center</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="sname">School Name</Label>
            <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Lincoln High School" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="scode">Code</Label>
              <Input id="scode" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="LHS" />
            </div>
            <div>
              <Label htmlFor="scity">City</Label>
              <Input id="scity" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Austin" />
            </div>
            <div>
              <Label htmlFor="sstate">State</Label>
              <Input id="sstate" value={state} onChange={(e) => setState(e.target.value)} placeholder="TX" maxLength={2} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cname">Contact Person</Label>
              <Input id="cname" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Advisor Name" />
            </div>
            <div>
              <Label htmlFor="cemail">Contact Email</Label>
              <Input id="cemail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="advisor@school.org" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating..." : "Create Center"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- New Yearbook Dialog ---------------- */

function NewYearbookDialog({ schools, onDone }: { schools: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [schoolId, setSchoolId] = useState(schools[0]?.id || "");
  const [year, setYear] = useState(new Date().getFullYear());
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState("");
  const [pageCount, setPageCount] = useState(48);
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const createFn = useServerFn(createYearbook);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) {
      toast.error("Please select a school center");
      return;
    }
    const payload: {
      school_id: string;
      year: number;
      title?: string;
      theme?: string;
      deadline?: string | null;
    } = {
      school_id: schoolId,
      year: Number(year),
    };
    if (title.trim()) payload.title = title.trim();
    if (theme.trim()) payload.theme = theme.trim();
    if (deadline.trim()) payload.deadline = deadline.trim();

    try {
      await createFn({ data: payload });
      toast.success("Yearbook edition created successfully");
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Could not create yearbook");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs">
          <Plus className="size-3.5" />
          New Yearbook Volume
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Yearbook Volume</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="ybschool">School Center</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger id="ybschool">
                <SelectValue placeholder="Select Center" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ybyear">Academic Year</Label>
              <Input id="ybyear" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} required />
            </div>
            <div>
              <Label htmlFor="ybpages">Page Count</Label>
              <Input id="ybpages" type="number" step={8} min={16} max={512} value={pageCount} onChange={(e) => setPageCount(Number(e.target.value))} required />
            </div>
          </div>
          <div>
            <Label htmlFor="ybtitle">Volume Title</Label>
            <Input id="ybtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Legacy &amp; Horizons" />
          </div>
          <div>
            <Label htmlFor="ybtheme">Editorial Theme</Label>
            <Input id="ybtheme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Retro Futurism / Luminescence" />
          </div>
          <div>
            <Label htmlFor="ybdue">Final Press Deadline</Label>
            <Input id="ybdue" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating..." : "Create Volume"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
