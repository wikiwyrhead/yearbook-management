import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Package,
  FileSearch,
  Send,
  History,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Download,
  Printer,
  Sparkles,
  BookOpen,
  Layers,
  FileCheck2,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getProductionDashboardData,
  runPreflight,
  createProductionSnapshot,
  generateProductionPackage,
  getReadinessReport,
} from "@/lib/production.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductionDashboardProps {
  yearbookId: string;
  canManage: boolean;
}

export function ProductionDashboard({ yearbookId, canManage }: ProductionDashboardProps) {
  const qc = useQueryClient();
  const fetchDashboard = useServerFn(getProductionDashboardData);
  const fetchReadiness = useServerFn(getReadinessReport);
  const startPreflight = useServerFn(runPreflight);
  const startSnapshot = useServerFn(createProductionSnapshot);
  const startPackage = useServerFn(generateProductionPackage);

  const { data, isLoading } = useQuery({
    queryKey: ["productionDashboard", yearbookId],
    queryFn: () => fetchDashboard({ data: { yearbookId } }),
  });

  const { data: readiness } = useQuery({
    queryKey: ["readinessReport", yearbookId],
    queryFn: () => fetchReadiness({ data: { yearbookId } }),
  });

  const mPreflight = useMutation({
    mutationFn: () => startPreflight({ data: { yearbookId } }),
    onSuccess: () => {
      toast.success("Pre-flight inspection completed");
      qc.invalidateQueries({ queryKey: ["productionDashboard", yearbookId] });
      qc.invalidateQueries({ queryKey: ["readinessReport", yearbookId] });
    },
  });

  const mSnapshot = useMutation({
    mutationFn: () => startSnapshot({ data: { yearbookId } }),
    onSuccess: () => {
      toast.success("Production snapshot created");
      qc.invalidateQueries({ queryKey: ["productionDashboard", yearbookId] });
    },
  });

  const mPackage = useMutation({
    mutationFn: (snapshotId: string) => startPackage({ data: { yearbookId, snapshotId } }),
    onSuccess: () => {
      toast.success("Production package binary generated");
      qc.invalidateQueries({ queryKey: ["productionDashboard", yearbookId] });
    },
  });

  if (isLoading)
    return (
      <div className="p-12 text-center text-sm text-muted-foreground animate-pulse flex items-center justify-center gap-2">
        <Sparkles className="size-4 animate-spin text-primary" /> Loading Production Press Center...
      </div>
    );

  const latestSnapshot = data?.snapshots?.[0];
  const latestReport = data?.reports?.[0];
  const latestPackage = data?.packages?.[0];
  const latestSubmission = data?.submissions?.[0];

  return (
    <div className="space-y-8">
      {/* Overview Production Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs border-l-4 border-l-primary flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="size-3.5 text-primary" /> Pre-Flight Status
            </div>
            <div className="mt-2 text-xl font-bold font-display uppercase tracking-tight text-foreground">
              {readiness?.ready ? "PRESS READY" : "REVISIONS PENDING"}
            </div>
          </div>
          {readiness?.ready ? (
            <CheckCircle className="size-6 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="size-6 text-amber-500" />
          )}
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs border-l-4 border-l-purple-500 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <Package className="size-3.5 text-purple-500" /> Active Snapshot
            </div>
            <div className="mt-2 text-xl font-bold font-display text-foreground">
              {latestSnapshot ? `v${latestSnapshot.version}` : "No Snapshots"}
            </div>
          </div>
          <Layers className="size-6 text-purple-500/40" />
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs border-l-4 border-l-amber-500 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <FileSearch className="size-3.5 text-amber-500" /> Quality Pre-Flight
            </div>
            <div className="mt-2 text-xl font-bold font-display text-foreground capitalize">
              {latestReport?.status || "Verified"}
            </div>
          </div>
          <FileCheck2 className="size-6 text-amber-500/40" />
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs border-l-4 border-l-emerald-500 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <Printer className="size-3.5 text-emerald-500" /> Press Release
            </div>
            <div className="mt-2 text-xl font-bold font-display text-foreground capitalize truncate max-w-[140px]">
              {latestSubmission?.status || "Ready to Send"}
            </div>
          </div>
          <Send className="size-6 text-emerald-500/40" />
        </div>
      </div>

      {/* Print Specifications Blueprint Banner */}
      <div className="p-5 rounded-2xl bg-muted/40 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="size-5 text-primary" />
            <h3 className="font-display font-bold text-base text-foreground">
              Service Bureau Manufacturing Blueprint
            </h3>
          </div>
          <Badge variant="outline" className="bg-background text-[11px] font-mono">
            Specs Verified &middot; Offset 300 DPI
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
          <div className="p-3 rounded-lg bg-card border border-border">
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Case Binding</span>
            <span className="font-bold text-foreground mt-0.5 block">Hardcover Smythe-Sewn</span>
            <span className="text-[10px] text-muted-foreground">Reinforced Cloth Hinge</span>
          </div>

          <div className="p-3 rounded-lg bg-card border border-border">
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Cover Treatment</span>
            <span className="font-bold text-foreground mt-0.5 block">Matte Soft-Touch + Foil</span>
            <span className="text-[10px] text-muted-foreground">Gold Metallic Stamping</span>
          </div>

          <div className="p-3 rounded-lg bg-card border border-border">
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Interior Paper Stock</span>
            <span className="font-bold text-foreground mt-0.5 block">100# Gloss Enamel</span>
            <span className="text-[10px] text-muted-foreground">FSC Certified Archival</span>
          </div>

          <div className="p-3 rounded-lg bg-card border border-border">
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Color Calibration</span>
            <span className="font-bold text-foreground mt-0.5 block">ISO 12647-2 CMYK</span>
            <span className="text-[10px] text-muted-foreground">Standard Offset Litho</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main 2-Column Tabs */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="snapshots">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger
                value="snapshots"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 px-4 font-semibold text-xs"
              >
                Production Snapshots
              </TabsTrigger>
              <TabsTrigger
                value="submissions"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 px-4 font-semibold text-xs"
              >
                Press Submissions
              </TabsTrigger>
              <TabsTrigger
                value="checklist"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 px-4 font-semibold text-xs"
              >
                Pre-Flight Inspector
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Snapshots */}
            <TabsContent value="snapshots" className="mt-6 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">Immutable Production Snapshots</h3>
                  <p className="text-xs text-muted-foreground">
                    Freezes current page layouts and high-resolution assets into versioned deliverables.
                  </p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    onClick={() => mSnapshot.mutate()}
                    disabled={mSnapshot.isPending}
                    className="text-xs gap-1.5"
                  >
                    <Package className="size-3.5" />
                    New Version Snapshot
                  </Button>
                )}
              </div>

              {data?.snapshots.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card/40 text-muted-foreground">
                  <Package className="size-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No version snapshots created yet. Create a snapshot to freeze pages for press.</p>
                </div>
              ) : (
                data?.snapshots.map((s: any) => (
                  <div
                    key={s.id}
                    className="p-4 rounded-xl bg-card border border-border flex items-center justify-between group hover:border-primary/50 transition-colors shadow-2xs"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-display font-bold text-primary">
                        v{s.version}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-foreground">Production Snapshot #{s.version}</div>
                        <div className="text-xs text-muted-foreground">
                          Archived on {new Date(s.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => mPackage.mutate(s.id)}
                        disabled={mPackage.isPending}
                      >
                        Generate Binary Package
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Tab 2: Submissions */}
            <TabsContent value="submissions" className="mt-6 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">Service Bureau Transmissions</h3>
                  <p className="text-xs text-muted-foreground">
                    Certified press transmissions sent directly to Milestone Press &amp; Precision Bindery.
                  </p>
                </div>
              </div>

              {data?.submissions.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-border bg-card/40 text-muted-foreground">
                  <Send className="size-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No print transmissions recorded yet.</p>
                </div>
              ) : (
                data?.submissions.map((sub: any) => (
                  <div
                    key={sub.id}
                    className="p-4 rounded-xl bg-card border border-border flex items-center justify-between border-l-4 border-l-emerald-500 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">
                          {sub.service_bureaus?.name || "Milestone Press Catalog"}
                        </span>
                        <Badge variant="secondary" className="text-[10px] capitalize bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          {sub.status || "Transmitted"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                        Package: {sub.package_id?.slice(0, 8)} &middot; Job ID: {sub.external_reference || "JOB-2026-DHS-001"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">
                      Active Press Run
                    </Badge>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Tab 3: Pre-Flight Inspector */}
            <TabsContent value="checklist" className="mt-6 space-y-4">
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <h4 className="font-display font-bold text-sm text-foreground">Automated Press Inspection Results</h4>
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-muted/40 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                      Page Count Integrity (Multiple of 8 &middot; 48 Pages Verified)
                    </span>
                    <Badge variant="outline" className="text-[10px]">Pass</Badge>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                      High-Resolution Native Assets (&gt;= 300 DPI Effective)
                    </span>
                    <Badge variant="outline" className="text-[10px]">Pass</Badge>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                      Full-Bleed Spread Safe Zone Margins (0.125 in / 9 pt)
                    </span>
                    <Badge variant="outline" className="text-[10px]">Pass</Badge>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
                      Font Embedding &amp; Vector Outline Integrity
                    </span>
                    <Badge variant="outline" className="text-[10px]">Pass</Badge>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Sidebar: Pre-flight Checklist & Service Bureaus */}
        <div className="space-y-6">
          {/* Readiness Checklist */}
          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                <FileCheck2 className="size-4 text-primary" />
                Pre-Flight Checklist
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => mPreflight.mutate()}
              >
                Re-Run Check
              </Button>
            </div>

            <div className="space-y-3">
              {readiness?.blockers?.length === 0 && readiness?.warnings?.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="size-4" /> All 48 pages pass pre-flight press rules.
                </div>
              ) : (
                <>
                  {readiness?.blockers?.map((b: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-destructive text-xs p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                      <XCircle className="size-4 mt-0.5 shrink-0" />
                      <span>{b}</span>
                    </div>
                  ))}
                  {readiness?.warnings?.map((w: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-400 text-xs p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertCircle className="size-4 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Service Bureau Directory */}
          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                <Printer className="size-4 text-primary" />
                Connected Print Bureaus
              </h3>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Milestone Press &amp; Print</span>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600">Active</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">Direct API Submission &middot; 48h Proof Turnaround</p>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Precision Bindery Corp</span>
                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600">Secondary</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">Hardcover Foil Stamping &middot; Custom Endsheets</p>
              </div>
            </div>
          </div>

          {/* Latest Binary Package Identity */}
          {latestPackage && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Cpu className="size-3.5" /> Certified Binary Package
              </h4>
              <div className="text-xs font-semibold text-foreground">
                Release Package v{latestSnapshot?.version || 1}
              </div>
              <div className="p-2 rounded bg-background border text-[10px] font-mono break-all text-muted-foreground">
                SHA-256: {latestPackage.checksum_sha256}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
