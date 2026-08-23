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
      toast.success("Preflight check completed");
      qc.invalidateQueries({ queryKey: ["productionDashboard", yearbookId] });
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
      toast.success("Production package generated");
      qc.invalidateQueries({ queryKey: ["productionDashboard", yearbookId] });
    },
  });

  if (isLoading)
    return <div className="p-12 text-center animate-pulse">Loading production data...</div>;

  const latestSnapshot = data?.snapshots?.[0];
  const latestReport = data?.reports?.[0];
  const latestPackage = data?.packages?.[0];
  const latestSubmission = data?.submissions?.[0];

  return (
    <div className="space-y-8">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="plate p-4 border-l-4 border-blue-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase">
            <ShieldCheck className="size-3" /> Readiness
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xl font-display uppercase tracking-tight">
              {readiness?.ready ? "READY" : "NOT READY"}
            </span>
            {readiness?.ready ? (
              <CheckCircle className="size-5 text-green-500" />
            ) : (
              <XCircle className="size-5 text-destructive" />
            )}
          </div>
        </div>

        <div className="plate p-4 border-l-4 border-purple-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase">
            <Package className="size-3" /> Snapshot
          </div>
          <div className="mt-2">
            <span className="text-xl font-display uppercase tracking-tight">
              {latestSnapshot ? `#${latestSnapshot.version}` : "NONE"}
            </span>
          </div>
        </div>

        <div className="plate p-4 border-l-4 border-amber-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase">
            <FileSearch className="size-3" /> Preflight
          </div>
          <div className="mt-2">
            <span className="text-xl font-display uppercase tracking-tight">
              {latestReport?.status || "PENDING"}
            </span>
          </div>
        </div>

        <div className="plate p-4 border-l-4 border-green-500">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase">
            <Send className="size-3" /> Submission
          </div>
          <div className="mt-2">
            <span className="text-xl font-display uppercase tracking-tight truncate max-w-full block">
              {latestSubmission?.status || "NONE"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="snapshots">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger
                value="snapshots"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 px-4"
              >
                Snapshots
              </TabsTrigger>
              <TabsTrigger
                value="submissions"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 px-4"
              >
                Submissions
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2 px-4"
              >
                Audit Log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="snapshots" className="mt-6 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-display text-lg">Production Snapshots</h3>
                {canManage && (
                  <Button
                    size="sm"
                    onClick={() => mSnapshot.mutate()}
                    disabled={!readiness?.ready || mSnapshot.isPending}
                  >
                    New Snapshot
                  </Button>
                )}
              </div>

              {data?.snapshots.length === 0 ? (
                <div className="plate p-12 text-center text-muted-foreground">
                  No snapshots created yet. Ensure yearbook is ready before creating a snapshot.
                </div>
              ) : (
                data?.snapshots.map((s: any) => (
                  <div
                    key={s.id}
                    className="plate p-4 flex items-center justify-between group hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-full bg-muted flex items-center justify-center font-display text-primary">
                        {s.version}
                      </div>
                      <div>
                        <div className="font-medium text-sm">Snapshot #{s.version}</div>
                        <div className="text-xs text-muted-foreground">
                          Created {new Date(s.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => mPackage.mutate(s.id)}
                        disabled={mPackage.isPending}
                      >
                        Bundle Package
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View Details <ArrowRight className="size-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="submissions" className="mt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-display text-lg">Service Bureau Submissions</h3>
                {canManage && (
                  <Button size="sm" variant="outline" disabled={!latestPackage}>
                    New Submission
                  </Button>
                )}
              </div>
              {data?.submissions.length === 0 ? (
                <div className="plate p-12 text-center text-muted-foreground">
                  No submissions recorded.
                </div>
              ) : (
                data?.submissions.map((sub: any) => (
                  <div
                    key={sub.id}
                    className="plate p-4 flex items-center justify-between border-l-4 border-green-500"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {sub.service_bureaus?.name || "Unknown Bureau"}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {sub.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Package: {sub.package_id.slice(0, 8)} · Ref:{" "}
                        {sub.external_reference || "N/A"}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      Manage
                    </Button>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <div className="plate divide-y">
                {/* Audit log entries would go here, fetched via a separate function or part of dashboard data */}
                <div className="p-3 text-sm text-muted-foreground text-center">
                  Audit log integrated with production activity.
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          {/* Readiness Blockers/Warnings */}
          <div className="plate overflow-hidden">
            <div className="p-3 bg-muted/50 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium">Production Checklist</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => mPreflight.mutate()}
              >
                Refresh
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {readiness?.blockers.length === 0 && readiness?.warnings.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle className="size-4" /> All checks passed.
                </div>
              ) : (
                <>
                  {readiness?.blockers.map((b: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-destructive text-sm">
                      <XCircle className="size-4 mt-0.5 flex-shrink-0" />
                      <span>{b}</span>
                    </div>
                  ))}
                  {readiness?.warnings.map((w: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-amber-600 text-sm">
                      <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Service Bureau Info */}
          <div className="plate overflow-hidden">
            <div className="p-3 bg-muted/50 border-b">
              <h3 className="text-sm font-medium">Active Service Bureaus</h3>
            </div>
            <div className="p-4 space-y-3">
              {data?.serviceBureaus.map((sb: any) => (
                <div key={sb.id} className="text-sm border-b pb-2 last:border-0">
                  <div className="font-medium">{sb.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Method: {sb.submission_method}
                  </div>
                </div>
              ))}
              {canManage && (
                <Button variant="link" size="sm" className="px-0 h-auto text-xs text-primary">
                  Manage Service Bureaus <Settings className="size-3 ml-1" />
                </Button>
              )}
            </div>
          </div>

          {/* Latest Package Checksum */}
          {latestPackage && (
            <div className="plate p-4 bg-primary/5 border-primary/20">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                Latest Package Identity
              </h4>
              <div className="flex items-center gap-2 mb-3">
                <Download className="size-4 text-primary" />
                <span className="text-sm font-medium truncate">
                  Package v{latestSnapshot?.version}
                </span>
              </div>
              <div className="bg-white/80 rounded p-2 border text-[10px] font-mono break-all text-muted-foreground">
                SHA-256: {latestPackage.checksum_sha256}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
