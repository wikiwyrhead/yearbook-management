import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { ChevronLeft, Trash2, UserPlus, BookCheck, Plus } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCanvaManager } from "@/components/yearbook/design/AdminCanvaManager";
import { LayoutWorkspace } from "@/components/yearbook/LayoutWorkspace";
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
import { EditorialTeamTab } from "@/components/yearbook/EditorialTeamTab";
import { TabErrorBoundary } from "@/components/ui/TabErrorBoundary";
import {
  getYearbook,
  addMember,
  removeMember,
  getProofs,
  getCorrections,
} from "@/lib/yearbook.functions";

const PDFProofViewer = React.lazy(() =>
  import("@/components/yearbook/production/PDFProofViewer").then((m) => ({
    default: m.PDFProofViewer,
  })),
);

import { StudentPortal } from "@/components/yearbook/student/StudentPortal";
import { StaffWorkbench } from "@/components/yearbook/staff/StaffWorkbench";
import { getStorageUrl } from "@/lib/storage/storage-url";

export const Route = createFileRoute("/_authenticated/yearbooks/$yearbookId")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { tab?: string | undefined } => {
    const tab = typeof search["tab"] === "string" ? (search["tab"] as string) : undefined;
    return tab ? { tab } : {};
  },
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
  const search = Route.useSearch();
  const { user } = useAuth();
  const resolvedTab = search?.tab === "layout" ? "design" : search?.tab || "ladder";
  const [cockpitTab, setCockpitTab] = useState(resolvedTab);

  useEffect(() => {
    const nextTab = search?.tab === "layout" ? "design" : search?.tab;
    if (nextTab && nextTab !== cockpitTab) {
      setCockpitTab(nextTab);
    }
  }, [search?.tab]);
  const fetchYb = useServerFn(getYearbook);
  const qc = useQueryClient();
  const key = ["yearbook", yearbookId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => fetchYb({ data: { yearbookId } }),
    retry: false,
  });
  const fetchProofs = useServerFn(getProofs);
  const fetchCorrections = useServerFn(getCorrections);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeProofId, setActiveProofId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const { data: proofs } = useQuery({
    queryKey: ["proofs", yearbookId],
    queryFn: () => fetchProofs({ data: { yearbookId } }),
    enabled: !!data && viewerOpen,
  });

  const { data: corrections } = useQuery({
    queryKey: ["corrections", yearbookId],
    queryFn: () => fetchCorrections({ data: { yearbookId } }),
    enabled: !!data && viewerOpen,
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

  const isSuperAdmin = data.myRoles.includes("super_admin");
  const isCoordinator = data.myRoles.includes("coordinator");
  const isStaff =
    data.myRoles.includes("staff") ||
    data.myRoles.includes("member") ||
    data.myRoles.includes("editorial_member");
  const isStudentOnly =
    (data.myRoles.includes("student") || data.myRoles.includes("student_contributor")) &&
    !isCoordinator &&
    !isSuperAdmin &&
    !isStaff;
  const isStaffOnly = isStaff && !isCoordinator && !isSuperAdmin;

  // 1. DEDICATED STUDENT PORTAL
  if (isStudentOnly) {
    return (
      <AppShell>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="size-4" /> Control center
        </Link>
        <StudentPortal
          yearbookId={yearbookId}
          studentId={data.myStudentId}
          yearbookTitle={yb.title}
          yearbookYear={yb.year}
          schoolName={yb.schools?.name ?? null}
          theme={yb.theme}
          userEmail={(user as any)?.email}
          userName={(user as any)?.full_name || (user as any)?.name}
        />
      </AppShell>
    );
  }

  const activeProof = proofs?.find((p: any) => p.id === activeProofId);
  const activeProofPath = activeProof?.storage_path || activeProof?.pdf_storage_path || "";

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Control center
        </Link>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-full">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {yb.schools?.name}
            </p>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-foreground break-words">
              {yb.title || `${yb.year} Yearbook`}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {yb.year}
              {yb.theme ? ` · ${yb.theme}` : ""}
              {yb.deadline ? ` · deadline ${yb.deadline}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            {(data.myRoles.length ? data.myRoles : ["viewer"]).map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {r === "staff" ? "Staff/Member" : r.replace("_", " ")}
              </Badge>
            ))}
          </div>
        </div>

      {/* 2. DEDICATED STAFF WORKBENCH */}
      {isStaffOnly ? (
        <Tabs
          defaultValue={
            search?.tab === "design" || search?.tab === "layout" ? "design" : "workbench"
          }
          className="mt-8"
        >
          <TabsList className="w-full justify-start overflow-x-auto no-scrollbar scroll-smooth h-auto p-1.5 flex flex-nowrap gap-1">
            <TabsTrigger value="workbench" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">My Workbench</TabsTrigger>
            <TabsTrigger value="design" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">Layout & Proofing</TabsTrigger>
            <TabsTrigger value="assets" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">Asset Library</TabsTrigger>
          </TabsList>

          <TabsContent value="workbench" className="mt-6">
            <StaffWorkbench
              yearbookId={yearbookId}
              userId={user?.id ?? ""}
              sections={data.sections}
              statuses={data.statuses as never}
              pageTypes={data.pageTypes}
            />
          </TabsContent>

          <TabsContent value="design" className="mt-6">
            <LayoutWorkspace
              yearbookId={yearbookId}
              canManage={data.canManage}
              canEdit={data.canEdit}
              canGenerateProof={data.canGenerateProof}
            />
          </TabsContent>

          <TabsContent value="assets" className="mt-6">
            <AssetLibrary
              yearbookId={yearbookId}
              canEdit={data.canEdit}
              studentId={data.myStudentId ?? undefined}
            />
          </TabsContent>
        </Tabs>
      ) : (
        /* 3. FULL COORDINATOR / SUPER ADMIN COCKPIT */
        <Tabs value={cockpitTab} onValueChange={setCockpitTab} className="mt-8">
          <TabsList className="w-full justify-start overflow-x-auto no-scrollbar scroll-smooth h-auto p-1.5 flex flex-nowrap gap-1">
            <TabsTrigger value="ladder" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">Page ladder</TabsTrigger>
            <TabsTrigger value="design" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">
              {user?.roles?.includes("super_admin") ? "Design Integration" : "Layout & Proofing"}
            </TabsTrigger>
            <TabsTrigger value="proofreading" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium gap-1.5">
              <BookCheck className="size-4" /> Proofreading
            </TabsTrigger>
            <TabsTrigger value="assets" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">Assets</TabsTrigger>
            <TabsTrigger value="people" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">People</TabsTrigger>
            <TabsTrigger value="production" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">Production</TabsTrigger>
            <TabsTrigger value="storage" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">Storage</TabsTrigger>
            <TabsTrigger value="team" className="min-h-[44px] shrink-0 text-xs sm:text-sm font-medium">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="ladder" className="mt-6">
            {cockpitTab === "ladder" && (
              <TabErrorBoundary tabName="Page Ladder">
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
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="design" className="mt-6">
            {cockpitTab === "design" && (
              <TabErrorBoundary tabName="Layout Workspace">
                {user?.roles?.includes("super_admin") ? (
                  <AdminCanvaManager yearbookId={yearbookId} />
                ) : (
                  <LayoutWorkspace
                    yearbookId={yearbookId}
                    canManage={data.canManage}
                    canEdit={data.canEdit}
                    canGenerateProof={data.canGenerateProof}
                  />
                )}
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="proofreading" className="mt-6">
            {cockpitTab === "proofreading" && (
              <TabErrorBoundary tabName="Proofreading Center">
                <ProofreadingCenter
                  yearbookId={yearbookId}
                  canManage={data.canManage}
                  onViewProof={handleViewProof}
                />
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="assets" className="mt-6">
            {cockpitTab === "assets" && (
              <TabErrorBoundary tabName="Asset Library">
                <AssetLibrary
                  yearbookId={yearbookId}
                  canEdit={data.canEdit}
                  studentId={data.myStudentId ?? undefined}
                />
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="storage" className="mt-6">
            {cockpitTab === "storage" && (
              <TabErrorBoundary tabName="Storage Settings">
                <StorageTab
                  yearbookId={yearbookId}
                  centerId={data.yearbook.school_id || (data.yearbook as any).center_id}
                  canManage={data.canManage}
                />
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="production" className="mt-6">
            {cockpitTab === "production" && (
              <TabErrorBoundary tabName="Production Dashboard">
                <ProductionDashboard yearbookId={yearbookId} canManage={data.canManage} />
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="people" className="mt-6">
            {cockpitTab === "people" && (
              <TabErrorBoundary tabName="People & Roles">
                <PeopleTab yearbookId={yearbookId} canEdit={data.canEdit} />
              </TabErrorBoundary>
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            {cockpitTab === "team" && (
              <TabErrorBoundary tabName="Editorial Team">
                <EditorialTeamTab
                  yearbookId={yearbookId}
                  isSuperAdmin={isSuperAdmin}
                  canManage={data.canManage}
                  pages={(data.sections ?? []).flatMap((s: any) => s.pages ?? [])}
                  sections={data.sections as any}
                />
              </TabErrorBoundary>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden bg-background">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>PDF Proof Viewer</DialogTitle>
          </DialogHeader>
          <div className="h-[80vh]">
            {viewerOpen && activeProofId && (
              <React.Suspense
                fallback={<div className="p-10 text-center">Loading proof viewer...</div>}
              >
                <PDFProofViewer
                  yearbookId={yearbookId}
                  proofUrl={getStorageUrl(`proofs/${activeProofId}.pdf`)}
                  initialPage={1}
                  onAddCorrection={async (c) => {
                    toast.success("Correction added");
                    qc.invalidateQueries({ queryKey: ["corrections", yearbookId] });
                  }}
                  corrections={corrections ?? []}
                />
              </React.Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </AppShell>
  );
}
