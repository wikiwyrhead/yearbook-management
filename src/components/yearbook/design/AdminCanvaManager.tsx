/**
 * Super-Admin Design Provider Management Component
 * Displays live Canva platform connection status, design browser/selector,
 * page-mapping editor, and "Open in Canva" launch action.
 */
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetDesignProvider,
  adminStartCanvaOAuthFlow,
  adminDisconnectDesignProviderFlow,
  adminListExternalDesignsFlow,
  adminLinkYearbookDesignFlow,
  adminMapDesignPagesFlow,
  adminOpenExternalDesignFlow,
} from "@/lib/design.functions";
import { getLadder } from "@/lib/yearbook.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Palette,
  ExternalLink,
  RefreshCw,
  Unlink,
  CheckCircle2,
  AlertCircle,
  Layers,
  Search,
  FileText,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export function AdminCanvaManager({ yearbookId }: { yearbookId: string }) {
  const qc = useQueryClient();
  const fetchProvider = useServerFn(adminGetDesignProvider);
  const startOAuth = useServerFn(adminStartCanvaOAuthFlow);
  const disconnectProvider = useServerFn(adminDisconnectDesignProviderFlow);
  const listDesigns = useServerFn(adminListExternalDesignsFlow);
  const linkDesign = useServerFn(adminLinkYearbookDesignFlow);
  const mapPages = useServerFn(adminMapDesignPagesFlow);
  const openDesign = useServerFn(adminOpenExternalDesignFlow);
  const fetchLadder = useServerFn(getLadder);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [mappingPageId, setMappingPageId] = useState<string | null>(null);
  const [customPagesInput, setCustomPagesInput] = useState<string>("1");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // 1. Fetch Canva Connection Status
  const { data: providerData, isLoading: isLoadingConn } = useQuery({
    queryKey: ["admin-design-provider"],
    queryFn: () => fetchProvider(),
  });

  // 2. Fetch Ladder Pages
  const { data: ladderData, isLoading: isLoadingLadder } = useQuery({
    queryKey: ["ladder", yearbookId],
    queryFn: () => fetchLadder({ data: { yearbookId } }),
  });

  // 3. Fetch Designs for Picker Modal
  const {
    data: designsData,
    isLoading: isLoadingDesigns,
    refetch: refetchDesigns,
  } = useQuery({
    queryKey: ["admin-canva-designs", searchTerm],
    queryFn: () => listDesigns({ data: { search: searchTerm } }),
    enabled: pickerOpen && !!providerData?.isConnected,
  });

  // Connect OAuth Mutation
  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await startOAuth({ data: { yearbookId } });
      if (res?.authUrl) {
        window.location.href = res.authUrl;
      }
    },
    onError: (e: Error) => toast.error(e.message || "Failed to start Canva authorization"),
  });

  // Disconnect Mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await disconnectProvider();
      await qc.invalidateQueries({ queryKey: ["admin-design-provider"] });
      toast.success("Canva design provider disconnected.");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to disconnect provider"),
  });

  // Link Design Mutation
  const linkMutation = useMutation({
    mutationFn: async (designId: string) => {
      await linkDesign({ data: { yearbookId, externalDesignId: designId } });
      await qc.invalidateQueries({ queryKey: ["ladder", yearbookId] });
      await qc.invalidateQueries({ queryKey: ["admin-design-provider"] });
      setPickerOpen(false);
      toast.success("Yearbook layout design linked successfully!");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to link design"),
  });

  // Map Pages Mutation
  const mapMutation = useMutation({
    mutationFn: async ({ pageId, pages }: { pageId: string; pages: number[] }) => {
      await mapPages({ data: { yearbookId, pageId, externalPageNumbers: pages } });
      await qc.invalidateQueries({ queryKey: ["ladder", yearbookId] });
      setMappingPageId(null);
      toast.success("Layout pages mapped successfully!");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to map layout pages"),
  });

  // Open in Canva Mutation
  const openMutation = useMutation({
    mutationFn: async () => {
      const res = await openDesign({ data: { yearbookId } });
      if (res?.editUrl) {
        window.open(res.editUrl, "_blank", "noopener,noreferrer");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Could not open layout in Canva"),
  });

  const isConnected = providerData?.isConnected;
  const connection = providerData?.connection;
  const pages = ladderData?.pages || [];

  return (
    <div className="space-y-6">
      {/* 1. Administrative Platform Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl border bg-card/60 backdrop-blur shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-inner">
            <Palette className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg">Canva Integration</h2>
              <Badge
                variant="outline"
                className="text-xs bg-indigo-50/50 text-indigo-700 border-indigo-200"
              >
                <ShieldCheck className="size-3 mr-1 text-indigo-600" /> Super Admin Only
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Platform-level external design provider for yearly book layouts and proof generation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <div className="text-right mr-2 hidden sm:block">
                <div className="text-xs font-medium text-foreground flex items-center justify-end gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  {connection?.displayName || "Connected Canva Account"}
                </div>
                <div className="text-[11px] text-muted-foreground">Status: Active & Valid</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unlink className="size-3.5 mr-1.5" /> Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
            >
              <Palette className="size-4 mr-1.5" /> Connect Canva Platform
            </Button>
          )}
        </div>
      </div>

      {/* 2. Active Yearbook Design Binding Banner */}
      {isConnected && (
        <div className="p-5 rounded-xl border bg-gradient-to-br from-indigo-50/40 via-background to-purple-50/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                Yearbook Layout Binding
              </span>
              <h3 className="text-base font-semibold mt-0.5">Active Canva Book Design</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Select a Canva design to link to this Yearbook and map individual layout pages to
                Milestone spreads.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <Layers className="size-3.5 mr-1.5" /> Choose / Replace Design
              </Button>
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => openMutation.mutate()}
                disabled={openMutation.isPending}
              >
                <ExternalLink className="size-3.5 mr-1.5" /> Open in Canva
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Page Mapping Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
          <div>
            <h4 className="font-medium text-sm">Canva-to-Milestone Page Mappings</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Map each Milestone page or spread to the corresponding 1-indexed Canva design pages.
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {pages.length} Total Pages
          </Badge>
        </div>

        <div className="divide-y max-h-[500px] overflow-y-auto">
          {pages.map((p: any) => {
            const isEditing = mappingPageId === p.id;
            return (
              <div
                key={p.id}
                className="p-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-md bg-muted flex items-center justify-center font-bold text-xs">
                    {p.page_number}
                  </div>
                  <div>
                    <div className="font-medium text-xs">{p.title || `Page ${p.page_number}`}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.canva_design_id ? (
                        <span className="text-indigo-600 font-mono">Linked to Canva</span>
                      ) : (
                        <span className="text-muted-foreground">No layout mapping</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        className="w-24 h-8 text-xs"
                        placeholder="e.g. 1 or 1,2"
                        aria-label="1-indexed Canva page numbers"
                        value={customPagesInput}
                        onChange={(e) => setCustomPagesInput(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          const parsed = customPagesInput
                            .split(",")
                            .map((x) => parseInt(x.trim(), 10))
                            .filter((n) => !isNaN(n) && n > 0);
                          if (parsed.length === 0) {
                            toast.error(
                              "Please enter positive integer page numbers (e.g. 1 or 1,2).",
                            );
                            return;
                          }
                          mapMutation.mutate({ pageId: p.id, pages: parsed });
                        }}
                        disabled={mapMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={() => setMappingPageId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => {
                        setMappingPageId(p.id);
                        setCustomPagesInput(p.external_page_numbers?.join(",") || "1");
                      }}
                    >
                      {p.canva_design_id ? "Edit Mapping" : "Map Page"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Canva Design Picker Modal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="size-5 text-indigo-600" />
              Select Canva Design
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-9 text-xs"
                  aria-label="Search Canva designs by title"
                  placeholder="Search Canva designs by title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => refetchDesigns()}>
                <RefreshCw className="size-3.5 mr-1" /> Refresh
              </Button>
            </div>

            {isLoadingDesigns ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="size-5 animate-spin mx-auto mb-2 text-indigo-600" />
                Loading Canva designs...
              </div>
            ) : designsData?.designs && designsData.designs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto p-1">
                {designsData.designs.map((d: any) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-lg border hover:border-indigo-500/50 hover:bg-indigo-50/20 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="font-semibold text-xs text-foreground line-clamp-1">
                          {d.title || "Untitled Design"}
                        </h5>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {d.pageCount || 1} {d.pageCount === 1 ? "page" : "pages"}
                        </Badge>
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground mt-1">ID: {d.id}</p>
                    </div>

                    <Button
                      size="sm"
                      className="w-full mt-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => linkMutation.mutate(d.id)}
                      disabled={linkMutation.isPending}
                    >
                      Bind Design to Yearbook
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg border-dashed">
                No Canva designs found. Create a design in Canva or search with a different query.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
