import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ExternalLink, 
  Settings, 
  FileText, 
  Image as ImageIcon,
  ChevronRight,
  Filter,
  RefreshCw,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getLadder,
  updateDesignStatus,
  connectCanvaDesign,
  createProof,
  getProofs
} from "@/lib/yearbook.functions";
import { ProofUploadDialog } from "./ProofUploadDialog";

type DesignStatus = 'waiting_for_assets' | 'ready_for_design' | 'designing' | 'complete' | 'needs_review' | 'ready_for_proof';

const STATUS_CONFIG: Record<DesignStatus, { label: string, color: string, icon: any }> = {
  waiting_for_assets: { label: 'Waiting for Assets', color: 'bg-muted text-muted-foreground', icon: Clock },
  ready_for_design: { label: 'Ready for Design', color: 'bg-blue-500/10 text-blue-500', icon: CheckCircle2 },
  designing: { label: 'Designing', color: 'bg-amber-500/10 text-amber-500', icon: RefreshCw },
  complete: { label: 'Design Complete', color: 'bg-green-500/10 text-green-500', icon: CheckCircle2 },
  needs_review: { label: 'Needs Review', color: 'bg-destructive/10 text-destructive', icon: AlertCircle },
  ready_for_proof: { label: 'Ready for Proof', color: 'bg-indigo-500/10 text-indigo-500', icon: FileText },
};

export function DesignWorkspace({ 
  yearbookId, 
  canEdit 
}: { 
  yearbookId: string;
  canEdit: boolean;
}) {
  const fetchLadder = useServerFn(getLadder);
  const qc = useQueryClient();
  const key = ["ladder", yearbookId];
  
  const { data, isLoading } = useQuery({ 
    queryKey: key, 
    queryFn: () => fetchLadder({ data: { yearbookId } }) 
  });

  const [filter, setFilter] = useState<string>("all");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const pages = useMemo(() => {
    const list = data?.pages ?? [];
    if (filter === "all") return list;
    if (filter === "ready") {
        return list.filter(p => {
            const reqs = (data?.requirements ?? []).filter(r => r.page_id === p.id);
            const totalNeeded = reqs.reduce((a, r) => a + r.needed, 0);
            const totalHave = reqs.reduce((a, r) => a + r.have, 0);
            return totalNeeded > 0 && totalHave >= totalNeeded;
        });
    }
    return list.filter(p => (p as any).design_status === filter);
  }, [data, filter]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading production ladder...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">Production & Design</h2>
          <p className="text-sm text-muted-foreground">Manage Canva connections and design readiness.</p>
        </div>
        
        <div className="flex gap-2">
            <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-48">
                    <Filter className="mr-2 size-4" />
                    <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Pages</SelectItem>
                    <SelectItem value="ready">Ready for Design</SelectItem>
                    <SelectItem value="waiting_for_assets">Waiting for Assets</SelectItem>
                    <SelectItem value="designing">Designing</SelectItem>
                    <SelectItem value="complete">Design Complete</SelectItem>
                    <SelectItem value="needs_review">Needs Review</SelectItem>
                </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: key })}>
                <RefreshCw className="size-4" />
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {pages.map((page) => (
          <PageProductionCard 
            key={page.id} 
            page={page as any} 
            requirements={(data?.requirements ?? []).filter(r => r.page_id === page.id)}
            onSelect={() => setSelectedPageId(page.id)}
          />
        ))}
      </div>

      {selectedPageId && (
        <DesignDetailDialog 
          yearbookId={yearbookId}
          pageId={selectedPageId}
          onClose={() => setSelectedPageId(null)}
          onUpdate={() => qc.invalidateQueries({ queryKey: key })}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

function PageProductionCard({ page, requirements, onSelect }: { 
    page: any, 
    requirements: any[],
    onSelect: () => void 
}) {
  const totalNeeded = requirements.reduce((a, r) => a + r.needed, 0);
  const totalHave = requirements.reduce((a, r) => a + r.have, 0);
  const progress = totalNeeded > 0 ? Math.round((totalHave / totalNeeded) * 100) : 0;
  
  const statusKey = (page.design_status || 'waiting_for_assets') as DesignStatus;
  const status = STATUS_CONFIG[statusKey];
  const Icon = status.icon;

  return (
    <div 
      className="plate flex flex-col p-4 transition-all hover:ring-2 hover:ring-primary/20 cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">
            Page {page.page_number}
          </span>
          <h3 className="font-display text-lg leading-tight mt-0.5">{page.title || 'Untitled Page'}</h3>
        </div>
        <Badge className={`${status.color} border-none`}>
          <Icon className="mr-1 size-3" />
          {status.label}
        </Badge>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Assets: {totalHave} / {totalNeeded}</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      <div className="mt-auto pt-4 flex items-center justify-between">
        <div className="flex gap-1">
            {page.canva_design_id ? (
                <Badge variant="outline" className="text-[10px] py-0 bg-blue-500/5 text-blue-600 border-blue-200">
                    CANVA LINKED
                </Badge>
            ) : (
                <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                    NO DESIGN
                </Badge>
            )}
        </div>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
            Manage <ChevronRight className="ml-1 size-3" />
        </Button>
      </div>
    </div>
  );
}

function DesignDetailDialog({ yearbookId, pageId, onClose, onUpdate, canEdit }: {
  yearbookId: string;
  pageId: string;
  onClose: () => void;
  onUpdate: () => void;
  canEdit: boolean;
}) {
  const fetchLadder = useServerFn(getLadder);
  const fetchProofs = useServerFn(getProofs);
  const updateStatus = useServerFn(updateDesignStatus);
  const connectCanva = useServerFn(connectCanvaDesign);
  const createProofVersion = useServerFn(createProof);

  const { data: ladderData } = useQuery({ 
    queryKey: ["ladder", yearbookId], 
    queryFn: () => fetchLadder({ data: { yearbookId } }) 
  });
  
  const { data: proofs } = useQuery({
    queryKey: ["proofs", yearbookId, pageId],
    queryFn: () => fetchProofs({ data: { yearbookId, pageId } })
  });

  const page = ladderData?.pages.find(p => p.id === pageId) as any;
  const requirements = (ladderData?.requirements ?? []).filter(r => r.page_id === pageId);
  
  const [canvaId, setCanvaId] = useState(page?.canva_design_id || "");
  const [isLinking, setIsLinking] = useState(false);

  const handleUpdateStatus = async (status: string) => {
    try {
      await updateStatus({ data: { pageId, status } });
      toast.success(`Status updated to ${status}`);
      onUpdate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleLinkCanva = async () => {
    if (!canvaId) return;
    setIsLinking(true);
    try {
      await connectCanva({ data: { pageId, canvaDesignId: canvaId } });
      toast.success("Canva design linked");
      onUpdate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLinking(false);
    }
  };

  if (!page) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Page {page.page_number}</span>
            <Badge className={`${STATUS_CONFIG[(page.design_status || 'waiting_for_assets') as DesignStatus].color} border-none`}>
              {STATUS_CONFIG[(page.design_status || 'waiting_for_assets') as DesignStatus].label}
            </Badge>
          </div>
          <DialogTitle className="font-display text-3xl">{page.title || 'Untitled Page'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Requirements & Assets</h4>
              <div className="space-y-3">
                {requirements.map((req) => (
                  <div key={req.id} className="plate p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{req.label}</p>
                      <p className="text-xs text-muted-foreground">{req.have} of {req.needed} approved assets</p>
                    </div>
                    {req.have >= req.needed ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : (
                      <Clock className="size-5 text-muted-foreground/30" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Design Workflow</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <Button 
                    key={key}
                    size="sm"
                    variant={page.design_status === key ? "default" : "outline"}
                    className="text-xs"
                    onClick={() => handleUpdateStatus(key)}
                    disabled={!canEdit}
                  >
                    {config.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Canva Integration</h4>
              <div className="plate p-4 space-y-4">
                {page.canva_design_url ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-tighter">Connected Design</p>
                        <p className="font-medium">{page.canva_design_name || 'Design linked'}</p>
                      </div>
                      <Button size="icon" variant="ghost" asChild>
                        <a href={page.canva_design_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground italic">
                        <RefreshCw className="size-3" />
                        Last synced: {page.canva_synced_at ? new Date(page.canva_synced_at).toLocaleString() : 'Never'}
                    </div>
                    <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setCanvaId("")}>
                      Change Connection
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Canva Design ID</Label>
                      <Input 
                        placeholder="e.g. DAGF..." 
                        value={canvaId}
                        onChange={(e) => setCanvaId(e.target.value)}
                      />
                    </div>
                    <Button 
                      className="w-full bg-[#00C4CC] hover:bg-[#00B4BC] text-white" 
                      onClick={handleLinkCanva}
                      disabled={!canvaId || isLinking}
                    >
                      {isLinking ? "Linking..." : "Connect Canva Design"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Proofing History</h4>
              <div className="plate p-4 space-y-4">
                {proofs && proofs.length > 0 ? (
                  <div className="divide-y">
                    {proofs.map((proof: any) => (
                      <div key={proof.id} className="py-2 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">Version {proof.version}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(proof.created_at).toLocaleDateString()}</p>
                        </div>
                        <Button size="icon" variant="ghost" asChild>
                          <a href={proof.storage_path} target="_blank" rel="noreferrer">
                            <FileText className="size-4" />
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4 italic">No proofs generated yet.</p>
                )}
                
                <Separator />
                
                <ProofUploadDialog 
                  yearbookId={yearbookId}
                  pageIds={[pageId]}
                  onDone={onUpdate}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close Production View</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
