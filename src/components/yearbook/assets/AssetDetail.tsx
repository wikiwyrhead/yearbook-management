import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { 
  Download, 
  History, 
  FileText, 
  User, 
  Calendar, 
  Info,
  CheckCircle2,
  Clock,
  ExternalLink
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { getAssetDetails, updateAssetStatus } from "@/lib/yearbook.functions";

export function AssetDetail({ 
  assetId, 
  canEdit, 
  onClose, 
  onUpdate 
}: { 
  assetId: string; 
  canEdit: boolean;
  onClose: () => void; 
  onUpdate: () => void;
}) {
  const fetchDetails = useServerFn(getAssetDetails);
  const updateStatus = useServerFn(updateAssetStatus);
  const qc = useQueryClient();
  
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["asset-details", assetId],
    queryFn: () => fetchDetails({ data: { assetId } })
  });


  const handleStatusUpdate = async (status: string) => {
    try {
      await updateStatus({ data: { assetId, status: status as any, notes: notes || undefined } });
      toast.success(`Status set to ${status}`);
      onUpdate();
      qc.invalidateQueries({ queryKey: ["asset-details", assetId] });
      setNotes("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading || !data) return null;

  const { asset, history, auditLogs } = data;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      approved: "success",
      rejected: "destructive",
      replacement_required: "warning",
      under_review: "secondary",
      uploaded: "outline"
    };
    
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="truncate">{asset.file_name}</DialogTitle>
            {getStatusBadge(asset.status)}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          {/* Preview Section */}
          <div className="space-y-4">
            <div className="aspect-square bg-muted rounded-lg border flex items-center justify-center overflow-hidden">
              {asset.asset_type === 'photo' ? (
                <img 
                  src={asset.storage_path} 
                  alt={asset.file_name} 
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                  <FileText className="size-20" />
                  <span className="text-xl font-bold uppercase">{asset.file_type?.split('/')[1] || asset.asset_type}</span>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" asChild>
                <a href={asset.storage_path} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 size-4" /> View Original
                </a>
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <a href={asset.storage_path} download={asset.file_name}>
                  <Download className="mr-2 size-4" /> Download
                </a>
              </Button>
            </div>
          </div>

          {/* Details Section */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="size-3" /> Uploaded by
                  </Label>
                  <p className="text-sm font-medium">{asset.uploaded_by_profile?.full_name || 'System'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-3" /> Upload Date
                  </Label>
                  <p className="text-sm font-medium">{new Date(asset.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="size-3" /> Associated Records
                </Label>
                <div className="flex flex-wrap gap-2">
                   {asset.student && <Badge variant="secondary">Student: {asset.student.first_name} {asset.student.last_name}</Badge>}
                   {asset.category && <Badge variant="secondary">Category: {asset.category}</Badge>}
                   {asset.pages?.map((p: any) => (
                     <Badge key={p.page.id} variant="secondary">Page {p.page.page_number}</Badge>
                   ))}
                   {!asset.student && !asset.category && (asset.pages?.length ?? 0) === 0 && (
                     <p className="text-xs text-muted-foreground italic">No associations</p>
                   )}
                </div>
              </div>

              {canEdit && (
                <div className="space-y-3 pt-4 bg-muted/30 p-4 rounded-lg">
                  <Label className="text-sm font-medium">Review Decision</Label>
                  <Textarea 
                    placeholder="Add review notes (optional)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleStatusUpdate('approved')}>
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleStatusUpdate('rejected')}>
                      Reject
                    </Button>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleStatusUpdate('replacement_required')}>
                      Replacement Required
                    </Button>
                  </div>
                </div>
              )}

            </div>

            <Separator />

            {/* Audit Log / History */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground flex items-center gap-1 uppercase tracking-wider font-bold">
                <History className="size-3" /> Activity History
              </Label>
              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="text-xs flex gap-2">
                    <div className="mt-0.5">
                       {log.action === 'uploaded' && <CheckCircle2 className="size-3 text-green-500" />}
                       {log.action === 'status_changed' && <Clock className="size-3 text-blue-500" />}
                       {log.action === 'replaced' && <History className="size-3 text-amber-500" />}
                    </div>
                    <div className="flex-1">
                      <p>
                        <span className="font-bold">{log.performed_by_profile?.full_name}</span>
                        {' '}
                        {log.action.replace('_', ' ')}
                        {log.new_status && <span> to <span className="font-bold">{log.new_status}</span></span>}
                      </p>
                      {log.metadata?.notes && <p className="text-muted-foreground italic mt-1">"{log.metadata.notes}"</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
