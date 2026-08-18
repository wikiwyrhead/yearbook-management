import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Trash2, UserPlus, BookCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DesignWorkspace } from "@/components/yearbook/DesignWorkspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { LadderTab } from "@/components/yearbook/LadderTab";
import { PeopleTab } from "@/components/yearbook/PeopleTab";
import { AssetLibrary } from "@/components/yearbook/assets/AssetLibrary";
import { TeamInvitations } from "@/components/yearbook/TeamInvitations";
import { StorageTab } from "@/components/yearbook/StorageTab";
import { ProofreadingCenter } from "@/components/yearbook/production/ProofreadingCenter";
import { ProductionDashboard } from "@/components/yearbook/production/ProductionDashboard";
import { PDFProofViewer } from "@/components/yearbook/production/PDFProofViewer";
import { getYearbook, addMember, removeMember, getProofs, getCorrections } from "@/lib/yearbook.functions";




export const Route = createFileRoute("/_authenticated/yearbooks/$yearbookId")({
  head: () => ({
    meta: [
      { title: "Yearbook workspace — Milestone Yearbook" },
      {
        name: "description",
        content:
          "Page ladder, people, and production team for a single yearbook year, with role-based access.",
      },
      { property: "og:title", content: "Yearbook workspace — Milestone Yearbook" },
      {
        property: "og:description",
        content: "Build the page ladder, manage people and assign production roles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

const ROLES = ["coordinator", "staff", "proofreader", "corrector", "student"];

function Workspace() {
  const { yearbookId } = Route.useParams();
  const { user } = useAuth();
  const fetchYb = useServerFn(getYearbook);
  const qc = useQueryClient();
  const key = ["yearbook", yearbookId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => fetchYb({ data: { yearbookId } }),
  });
  const fetchProofs = useServerFn(getProofs);
  const fetchCorrections = useServerFn(getCorrections);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeProofId, setActiveProofId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const { data: proofs } = useQuery({
    queryKey: ['proofs', yearbookId],
    queryFn: () => fetchProofs({ data: { yearbookId } }),
    enabled: !!data
  });

  const { data: corrections } = useQuery({
    queryKey: ['corrections', yearbookId],
    queryFn: () => fetchCorrections({ data: { yearbookId } }),
    enabled: !!data
  });

  const handleViewProof = (proofId: string, pageId?: string) => {
    setActiveProofId(proofId);
    setActivePageId(pageId ?? null);
    setViewerOpen(true);
  };

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell>
        <div className="plate p-10 text-center">
          <h1 className="font-display text-2xl">You don't have access to this yearbook</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask its coordinator to add you to the team.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/dashboard">Back to control center</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const yb = data.yearbook as unknown as {
    id: string;
    year: number;
    title: string | null;
    theme: string | null;
    deadline: string | null;
    schools: { name: string } | null;
  };

  return (
    <AppShell>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Control center
      </Link>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {yb.schools?.name}
          </p>
          <h1 className="font-display text-4xl">{yb.title || `${yb.year} Yearbook`}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {yb.year}
            {yb.theme ? ` · ${yb.theme}` : ""}
            {yb.deadline ? ` · deadline ${yb.deadline}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(data.myRoles.length ? data.myRoles : ["viewer"]).map((r) => (
            <Badge key={r} variant="secondary" className="capitalize">
              {r.replace("_", " ")}
            </Badge>
          ))}
        </div>
      </div>

      <Tabs defaultValue="ladder" className="mt-8">
        <TabsList>
          <TabsTrigger value="ladder">Page ladder</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="proofreading" className="gap-2">
            <BookCheck className="size-4" /> Proofreading
          </TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>



        <TabsContent value="ladder" className="mt-6">
          <LadderTab
            yearbookId={yearbookId}
            sections={data.sections}
            pageTypes={data.pageTypes}
            statuses={data.statuses as never}
            members={data.members as never}
            canEdit={data.canEdit}
            canManage={data.canManage}
            userId={user?.id ?? ""}
          />
        </TabsContent>

        <TabsContent value="design" className="mt-6">
          <DesignWorkspace 
            yearbookId={yearbookId} 
            canEdit={data.canEdit} 
          />
        </TabsContent>

        <TabsContent value="proofreading" className="mt-6">
          <ProofreadingCenter 
            yearbookId={yearbookId}
            canManage={data.canManage}
            onViewProof={handleViewProof}
          />
        </TabsContent>


        <TabsContent value="assets" className="mt-6">
          <AssetLibrary 
            yearbookId={yearbookId} 
            canEdit={data.canEdit} 
            studentId={data.myStudentId ?? undefined} 
          />
        </TabsContent>

        <TabsContent value="storage" className="mt-6">
          <StorageTab 
            yearbookId={yearbookId}
            canManage={data.canManage}
          />
        </TabsContent>

        <TabsContent value="production" className="mt-6">
          <ProductionDashboard 
            yearbookId={yearbookId}
            canManage={data.canManage}
          />
        </TabsContent>


        <TabsContent value="people" className="mt-6">
          <PeopleTab yearbookId={yearbookId} canEdit={data.canEdit} />
        </TabsContent>


        <TabsContent value="team" className="mt-6">
          <TeamTab
            yearbookId={yearbookId}
            members={data.members as never}
            canManage={data.canManage}
            onDone={() => qc.invalidateQueries({ queryKey: key })}
          />
        </TabsContent>
      </Tabs>
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="hidden">
            <DialogTitle>PDF Proof Viewer</DialogTitle>
          </DialogHeader>
          <PDFProofViewer 
            yearbookId={yearbookId}
            proofUrl={proofs?.find((p: any) => p.id === activeProofId)?.storage_path || ''}
            initialPage={1} // In a real app, find page number from activePageId
            corrections={corrections || []}
            onAddCorrection={(p, x, y) => {
              toast.info(`Creating correction at ${Math.round(x)}%, ${Math.round(y)}% on page ${p}`);
              // Integration with createCorrection server function would go here
            }}
          />
        </DialogContent>
      </Dialog>
    </AppShell>

  );
}

type Member = {
  id: string;
  user_id: string;
  role: string;
  profile: { full_name: string | null; email: string | null } | null;
};

function TeamTab({
  yearbookId,
  members,
  canManage,
  onDone,
}: {
  yearbookId: string;
  members: Member[];
  canManage: boolean;
  onDone: () => void;
}) {
  const add = useServerFn(addMember);
  const remove = useServerFn(removeMember);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("staff");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Production team</h2>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="size-4" /> Add member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a team member</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  add({
                    data: { yearbookId, email: String(fd.get("email")), role },
                  })
                    .then(() => {
                      toast.success("Member added");
                      setOpen(false);
                      onDone();
                    })
                    .catch((err: Error) => toast.error(err.message));
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="m-email">Account email</Label>
                  <Input id="m-email" name="email" type="email" required />
                  <p className="text-xs text-muted-foreground">
                    They must have signed up already.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit">Add</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="plate mt-4 divide-y">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <p className="font-medium">{m.profile?.full_name || m.profile?.email || m.user_id}</p>
              <p className="text-xs text-muted-foreground">{m.profile?.email}</p>
            </div>
            <Badge variant="secondary" className="capitalize">
              {m.role}
            </Badge>
            {canManage && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  remove({ data: { id: m.id } })
                    .then(onDone)
                    .catch((e: Error) => toast.error(e.message))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8">
        <TeamInvitations yearbookId={yearbookId} canManage={canManage} />
      </div>

      <div className="plate mt-6 p-5">

        <h3 className="font-display text-lg">What each role can do</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Coordinator</strong> — full control: team, people,
            ladder, settings.
          </li>
          <li>
            <strong className="text-foreground">Staff</strong> — build and edit the ladder, people
            and assignments.
          </li>
          <li>
            <strong className="text-foreground">Proofreader</strong> — read the ladder and update
            pages assigned to them.
          </li>
          <li>
            <strong className="text-foreground">Corrector</strong> — read-only review access.
          </li>
          <li>
            <strong className="text-foreground">Student</strong> — sees only their own record and
            submissions.
          </li>
        </ul>
      </div>
    </div>
  );
}
