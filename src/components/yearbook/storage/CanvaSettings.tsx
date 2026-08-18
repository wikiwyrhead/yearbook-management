import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { 
  Plus, 
  Trash2, 
  RefreshCw,
  Layout,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  getCanvaConnection, 
  startCanvaOAuth,
  disconnectCanva
} from "@/lib/design.functions";

export type CanvaSettingsProps = {
  yearbookId: string;
  canManage: boolean;
};

export function CanvaSettings({ yearbookId, canManage }: CanvaSettingsProps) {
  const fetchConnection = useServerFn(getCanvaConnection);
  const startOAuth = useServerFn(startCanvaOAuth);
  const disconnect = useServerFn(disconnectCanva);
  const qc = useQueryClient();

  const { data: connection, isLoading } = useQuery({
    queryKey: ["canva-connection", yearbookId],
    queryFn: () => fetchConnection({ data: { yearbookId } }),
  });

  const mutationStartOAuth = useMutation({
    mutationFn: () => startOAuth({ data: { yearbookId } }),
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationDisconnect = useMutation({
    mutationFn: () => disconnect({ data: { yearbookId } }),
    onSuccess: () => {
      toast.success("Canva disconnected");
      qc.invalidateQueries({ queryKey: ["canva-connection", yearbookId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-4 text-muted-foreground">Checking Canva connection...</div>;

  const status = connection?.status || "disconnected";

  return (
    <div className="plate p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00C4CC]/10 rounded-lg">
            <Layout className="size-6 text-[#00C4CC]" />
          </div>
          <div>
            <h3 className="font-display text-lg leading-none">Canva Integration</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Link Canva designs to yearbook pages for seamless production.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {status === "connected" ? (
            <Badge className="bg-green-500/10 text-green-600 border-green-200">
              CONNECTED
            </Badge>
          ) : status === "needs_reauthorization" ? (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">
              REAUTHORIZATION REQUIRED
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              DISCONNECTED
            </Badge>
          )}
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            {status === "connected" ? "Connected Account" : "Canva Connection"}
          </p>
          <p className="text-xs text-muted-foreground">
            {status === "connected" 
              ? "Design sync enabled"
              : "Authorize Milestone to access your Canva designs."}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {status === "disconnected" ? (
            <Button 
              className="bg-[#00C4CC] hover:bg-[#00B4BC] text-white"
              onClick={() => mutationStartOAuth.mutate()}
              disabled={mutationStartOAuth.isPending}
            >
              Connect Canva
            </Button>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => mutationStartOAuth.mutate()}
                disabled={mutationStartOAuth.isPending}
              >
                <RefreshCw className="mr-2 size-3" /> Reconnect
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => mutationDisconnect.mutate()}
                disabled={mutationDisconnect.isPending}
              >
                <Trash2 className="mr-2 size-4" /> Disconnect
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
