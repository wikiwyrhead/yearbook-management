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
} from "@/lib/yearbook.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Production Control Center — Milestone Yearbook" },
      {
        name: "description",
        content:
          "Every yearbook you have access to, with centers, years, your role and page ladder progress.",
      },
      { property: "og:title", content: "Production Control Center — Milestone Yearbook" },
      { property: "og:description", content: "Manage centers, yearbook years and production." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

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
        <p className="text-sm text-muted-foreground">Loading your yearbooks…</p>
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

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">
            {isStudentOnly ? "Student Yearbook Hub" : "Production Control Center"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.yearbooks.length} yearbook{data.yearbooks.length === 1 ? "" : "s"} ·{" "}
            {data.schools.length} center{data.schools.length === 1 ? "" : "s"}
            {isSuperAdmin ? " · Super Admin" : ""}
          </p>
        </div>
        {(isSuperAdmin || data.yearbooks.some((y: any) => y.myRoles.includes("coordinator"))) && (
          <div className="flex gap-2">
            {isSuperAdmin && <NewSchoolDialog onDone={invalidate} />}
            <NewYearbookDialog schools={data.schools} onDone={invalidate} />
          </div>
        )}
      </div>

      {data.myStudentRecords.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl">My Yearbook Submission</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.myStudentRecords.map((s: any) => (
              <div key={s.id} className="plate p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <GraduationCap className="size-4 text-accent" />
                    {s.preferred_name || s.first_name} {s.last_name}
                  </div>
                  <Badge variant="secondary" className="capitalize text-[10px]">
                    {(s.submission_status || "pending").replace("_", " ")}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground italic">Required Portrait</span>
                    {s.submission_status === "submitted" ? (
                      <span className="text-green-600 font-bold">✓ Uploaded</span>
                    ) : (
                      <span className="text-amber-600 font-bold">⚠ Missing</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground italic">Student Information</span>
                    <span className="text-green-600 font-bold">✓ Complete</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t flex justify-end">
                  <Button asChild size="sm" variant="default" className="w-full">
                    <Link to="/yearbooks/$yearbookId" params={{ yearbookId: s.yearbook_id }}>
                      Open Student Portal &rarr;
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Yearbooks Grid */}
      <section className="mt-8">
        <h2 className="font-display text-xl">Yearbooks</h2>
        {data.yearbooks.length === 0 ? (
          <div className="mt-3 plate p-12 text-center text-muted-foreground">
            <BookOpen className="size-8 mx-auto mb-2 opacity-50" />
            <p>No active yearbooks found.</p>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.yearbooks.map((y: any) => (
              <Link
                key={y.id}
                to="/yearbooks/$yearbookId"
                params={{ yearbookId: y.id }}
                className="plate p-5 hover:border-accent/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-accent">
                        {y.schools?.name || "Center"}
                      </div>
                      <h3 className="font-display text-lg mt-0.5">
                        {y.year} {y.title ? `— ${y.title}` : ""}
                      </h3>
                      {y.theme && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">"{y.theme}"</p>
                      )}
                    </div>
                    {y.is_locked && (
                      <Badge variant="destructive" className="text-[10px]">
                        Locked
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{y.metrics?.pageProgress || "0 / 0"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {(y.myRoles?.length ? y.myRoles : ["viewer"]).map((r: string) => (
                      <Badge key={r} variant="secondary" className="capitalize text-[10px]">
                        {r.replace("_", " ")}
                      </Badge>
                    ))}
                  </div>
                  {y.deadline && (
                    <p className="text-[10px] text-muted-foreground">Due {y.deadline}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Centers / Schools List */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Centers</h2>
          {isSuperAdmin && (
            <span className="text-xs text-muted-foreground">
              Super Admin: Manage Center appointments and permanent member affiliations
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.schools.map((s: any) => (
            <div key={s.id} className="plate p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    <School className="size-4 text-accent" />
                    {s.name}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.contact_name || "No contact"} {s.contact_email ? `· ${s.contact_email}` : ""}
                </p>
              </div>

              {isSuperAdmin && (
                <div className="mt-4 pt-3 border-t flex justify-end">
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
            <p className="text-sm text-muted-foreground">No centers yet.</p>
          )}
        </div>
      </section>
    </AppShell>
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
          People & Roles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-accent" />
            {centerName} — People & Roles Management
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
                  <Badge variant="default" className="bg-indigo-600 text-[10px]">
                    Active Appointee
                  </Badge>
                )}
              </div>

              {activeCoordinator ? (
                <div className="flex items-center justify-between p-3 bg-background border rounded-md">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-indigo-500/20 text-indigo-700 flex items-center justify-center font-bold text-xs">
                      {activeCoordinator.profile?.full_name?.charAt(0) || "C"}
                    </div>
                    <div>
                      <div className="font-semibold text-xs">
                        {activeCoordinator.profile?.full_name || "Coordinator"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {activeCoordinator.profile?.email} · Appointed{" "}
                        {formatDate(activeCoordinator.start_date) || "Start"} &rarr;{" "}
                        {formatDate(activeCoordinator.end_date) || "Open"}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleEndAppointment(activeCoordinator.id)}
                    className="h-7 text-xs"
                  >
                    End Appointment
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded border border-amber-200 dark:border-amber-800">
                  No active Coordinator appointed for this Center. Appoint one below.
                </p>
              )}

              {/* Appoint Form */}
              <form onSubmit={handleAppointCoordinator} className="pt-2 border-t space-y-3">
                <div className="text-xs font-semibold">Appoint / Replace Coordinator</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Input
                    placeholder="Coordinator Email"
                    type="email"
                    value={coordEmail}
                    onChange={(e) => setCoordEmail(e.target.value)}
                    required
                    className="text-xs h-8"
                  />
                  <Input
                    type="date"
                    value={coordStart}
                    onChange={(e) => setCoordStart(e.target.value)}
                    required
                    className="text-xs h-8"
                  />
                  <Input
                    type="date"
                    placeholder="Optional End Date"
                    value={coordEnd}
                    onChange={(e) => setCoordEnd(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting || !coordEmail}
                    className="h-8 text-xs"
                  >
                    {submitting ? "Appointing..." : "Appoint Coordinator"}
                  </Button>
                </div>
              </form>
            </div>

            {/* 2. Permanent Center Members (Teachers & Students) */}
            <div className="p-4 bg-muted/40 border rounded-lg space-y-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Users className="size-4 text-emerald-500" />
                  Center Member Affiliations (Teachers & Students)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permanent Center members who can be assigned to annual Yearbooks as Advisors or
                  Editorial Members.
                </p>
              </div>

              {/* Add Member Form */}
              <form
                onSubmit={handleAddMember}
                className="space-y-3 p-3 bg-background border rounded-md"
              >
                <div className="text-xs font-semibold flex items-center gap-1">
                  <UserPlus className="size-3.5 text-accent" /> Add Center Member
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <Input
                    placeholder="User Email"
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    required
                    className="text-xs h-8"
                  />
                  <Select
                    value={memberType}
                    onValueChange={(v: "teacher" | "student") => setMemberType(v)}
                  >
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">Teacher / Faculty</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={memberStart}
                    onChange={(e) => setMemberStart(e.target.value)}
                    className="text-xs h-8"
                  />
                  <Input
                    type="date"
                    placeholder="End Date"
                    value={memberEnd}
                    onChange={(e) => setMemberEnd(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting || !memberEmail}
                    className="h-8 text-xs"
                  >
                    {submitting ? "Adding..." : "Add Member"}
                  </Button>
                </div>
              </form>

              {/* Members Table */}
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Person</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Active Dates</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {memberships.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          No members in this center yet.
                        </td>
                      </tr>
                    ) : (
                      memberships.map((m: any) => {
                        const startStr = formatDate(m.start_date);
                        const endStr = formatDate(m.end_date);
                        const isExpired = !!(endStr && endStr < today);
                        const isFuture = !!(startStr && startStr > today);
                        const isActive = m.is_active && !isExpired && !isFuture;

                        return (
                          <tr key={m.id} className="hover:bg-muted/50">
                            <td className="py-2 px-3 font-medium">
                              {m.profile?.full_name || m.profile?.email}
                              <div className="text-[10px] text-muted-foreground">
                                {m.profile?.email}
                              </div>
                            </td>
                            <td className="py-2 px-3 capitalize">{m.member_type}</td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {startStr || "Start"} &rarr; {endStr || "Open"}
                            </td>
                            <td className="py-2 px-3">
                              {isActive ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-emerald-500/10 text-emerald-600"
                                >
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Inactive
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {m.is_active && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveMember(m.id)}
                                  className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSchoolDialog({ onDone }: { onDone: () => void }) {
  const create = useServerFn(createSchool);
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => create({ data: values }),
    onSuccess: () => {
      toast.success("Center created");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" /> Center
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Center</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            mutation.mutate(Object.fromEntries(fd.entries()));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Center name</Label>
            <Input id="s-name" name="name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-short">Short name</Label>
              <Input id="s-short" name="short_name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-logo">Logo URL</Label>
              <Input id="s-logo" name="logo_url" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-address">Address</Label>
            <Input id="s-address" name="address" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-cn">Contact</Label>
              <Input id="s-cn" name="contact_name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-ce">Email</Label>
              <Input id="s-ce" name="contact_email" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-cp">Phone</Label>
              <Input id="s-cp" name="contact_phone" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-notes">Notes / defaults</Label>
            <Textarea id="s-notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              Create Center
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewYearbookDialog({
  schools,
  onDone,
}: {
  schools: { id: string; name: string }[];
  onDone: () => void;
}) {
  const create = useServerFn(createYearbook);
  const [open, setOpen] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const mutation = useMutation({
    mutationFn: (values: {
      school_id: string;
      year: number;
      title?: string;
      theme?: string;
      deadline?: string | null;
    }) => create({ data: values }),
    onSuccess: () => {
      toast.success("Yearbook year created");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={schools.length === 0}>
          <Plus className="size-4" /> Yearbook year
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New yearbook year</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (!schoolId) {
              toast.error("Pick a center");
              return;
            }
            mutation.mutate({
              school_id: schoolId,
              year: Number(fd.get("year")),
              title: String(fd.get("title") || ""),
              theme: String(fd.get("theme") || ""),
              deadline: String(fd.get("deadline") || "") || null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>Center</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger>
                <SelectValue placeholder="Select center" />
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
            <div className="space-y-1.5">
              <Label htmlFor="y-year">Year</Label>
              <Input
                id="y-year"
                name="year"
                type="number"
                defaultValue={new Date().getFullYear() + 1}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="y-deadline">Deadline</Label>
              <Input id="y-deadline" name="deadline" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="y-title">Title</Label>
            <Input id="y-title" name="title" placeholder="e.g. Horizons 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="y-theme">Theme</Label>
            <Input id="y-theme" name="theme" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              Create year
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
