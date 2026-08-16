import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, School, BookOpen, GraduationCap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { getControlCenter, createSchool, createYearbook } from "@/lib/yearbook.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Production Control Center — Milestone Yearbook" },
      {
        name: "description",
        content:
          "Every yearbook you have access to, with schools, years, your role and page ladder progress.",
      },
      { property: "og:title", content: "Production Control Center — Milestone Yearbook" },
      { property: "og:description", content: "Manage schools, yearbook years and production." },
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

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Production Control Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.yearbooks.length} yearbook{data.yearbooks.length === 1 ? "" : "s"} ·{" "}
            {data.schools.length} school{data.schools.length === 1 ? "" : "s"}
            {data.isSuperAdmin ? " · Super Admin" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <NewSchoolDialog onDone={invalidate} />
          <NewYearbookDialog schools={data.schools} onDone={invalidate} />
        </div>
      </div>

      {data.myStudentRecords.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl">My student profile</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.myStudentRecords.map((s) => (
              <div key={s.id} className="plate p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GraduationCap className="size-4 text-accent" />
                  {s.preferred_name || s.first_name} {s.last_name}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.grade ? `Grade ${s.grade} · ` : ""}
                  {s.student_number ? `ID ${s.student_number}` : "No student ID"}
                </p>
                <Badge className="mt-3 capitalize" variant="secondary">
                  {s.submission_status}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-xl">Yearbooks</h2>
        {data.yearbooks.length === 0 ? (
          <div className="plate mt-3 p-10 text-center">
            <BookOpen className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No yearbooks yet. Create a school, then add a year under it.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.yearbooks.map((y) => (
              <Link
                key={y.id}
                to="/yearbooks/$yearbookId"
                params={{ yearbookId: y.id }}
                className="plate block p-5 transition-shadow hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      {y.schools?.name}
                    </p>
                    <h3 className="font-display text-2xl">{y.title || `${y.year} Yearbook`}</h3>
                  </div>
                  <span className="font-display text-3xl text-accent">{y.year}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(y.myRoles.length ? y.myRoles : ["viewer"]).map((r) => (
                    <Badge key={r} variant="secondary" className="capitalize">
                      {r.replace("_", " ")}
                    </Badge>
                  ))}
                </div>
                {y.deadline && (
                  <p className="mt-3 text-xs text-muted-foreground">Deadline {y.deadline}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl">Schools</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.schools.map((s) => (
            <div key={s.id} className="plate p-4">
              <div className="flex items-center gap-2 font-medium">
                <School className="size-4 text-accent" />
                {s.name}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.contact_name || "No contact"} {s.contact_email ? `· ${s.contact_email}` : ""}
              </p>
            </div>
          ))}
          {data.schools.length === 0 && (
            <p className="text-sm text-muted-foreground">No schools yet.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function NewSchoolDialog({ onDone }: { onDone: () => void }) {
  const create = useServerFn(createSchool);
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => create({ data: values }),
    onSuccess: () => {
      toast.success("School created");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" /> School
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New school</DialogTitle>
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
            <Label htmlFor="s-name">School name</Label>
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
              Create school
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
      toast.success("Yearbook year created — you are its coordinator");
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
              toast.error("Pick a school");
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
            <Label>School</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger>
                <SelectValue placeholder="Select school" />
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
