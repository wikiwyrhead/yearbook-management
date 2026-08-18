import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { 
  Cloud, 
  ExternalLink, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Lock,
  Settings2,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  getOrganizationStorage, 
  startOAuthFlow, 
  disconnectOrganizationProvider,
  saveOrganizationConnection
} from "@/lib/storage.functions";

export function StorageSettings() {
  const fetchOrgStorage = useServerFn(getOrganizationStorage);
  const startOAuth = useServerFn(startOAuthFlow);
  const disconnect = useServerFn(disconnectOrganizationProvider);
  const save = useServerFn(saveOrganizationConnection);
  const qc = useQueryClient();

  const { data: connections, isLoading } = useQuery({
    queryKey: ["organization-storage"],
    queryFn: () => fetchOrgStorage(),
  });

  const mutationStartOAuth = useMutation({
    mutationFn: (provider: "google_drive" | "box") => 
      startOAuth({ data: { provider, scope: "organization" } }),
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationDisconnect = useMutation({
    mutationFn: (provider: "google_drive" | "box") => 
      disconnect({ data: { provider } }),
    onSuccess: () => {
      toast.success("Provider disconnected");
      qc.invalidateQueries({ queryKey: ["organization-storage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationSetActive = useMutation({
    mutationFn: (provider: "google_drive" | "box") => 
      save({ data: { provider, isDefault: true } }),
    onSuccess: () => {
      toast.success("Active storage provider updated");
      qc.invalidateQueries({ queryKey: ["organization-storage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading storage settings...</div>;

  const providers = [
    { id: "google_drive", name: "Google Drive", icon: Cloud },
    { id: "box", name: "Box", icon: Database },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl">Organization Storage</h2>
          <p className="text-sm text-muted-foreground">Manage authoritative storage for all yearbooks.</p>
        </div>
      </div>

      <div className="grid gap-4">
        {providers.map((p) => {
          const conn = connections?.find(c => c.provider === p.id);
          const isActive = conn?.is_default;
          const status = conn?.status || "disconnected";
          
          return (
            <div key={p.id} className={`plate p-5 flex items-center justify-between border-2 ${isActive ? 'border-accent' : 'border-transparent'}`}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-muted rounded-full">
                  <p.icon className={`size-6 ${isActive ? 'text-accent' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg">{p.name}</h3>
                    {isActive && (
                      <Badge variant="default" className="bg-accent text-accent-foreground text-[10px] uppercase font-bold">
                        Active Storage
                      </Badge>
                    )}
                    {!isActive && conn && (
                      <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                        Connected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {status === "connected" ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="size-3" /> 
                        Connected as {conn?.account_email || "Organization Workspace"}
                      </span>
                    ) : status === "needs_reauthorization" ? (
                      <span className="flex items-center gap-1 text-amber-600">
                        <AlertCircle className="size-3" /> 
                        Reauthorization Required
                      </span>
                    ) : status === "error" ? (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="size-3" /> 
                        {conn?.last_error || "Configuration Error"}
                      </span>
                    ) : (
                      "Not connected"
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {status === "disconnected" ? (
                  <Button 
                    onClick={() => mutationStartOAuth.mutate(p.id)}
                    disabled={mutationStartOAuth.isPending}
                  >
                    Connect {p.name}
                  </Button>
                ) : (
                  <>
                    {!isActive && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => mutationSetActive.mutate(p.id)}
                        disabled={mutationSetActive.isPending}
                      >
                        Set as Active
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => mutationStartOAuth.mutate(p.id)}
                      title="Reconnect"
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => mutationDisconnect.mutate(p.id)}
                      title="Disconnect"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="plate p-4 bg-muted/30 border-dashed">
        <div className="flex gap-3">
          <Settings2 className="size-5 text-muted-foreground mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Autoritative Selection Rule</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Only one provider can be "Active". The active provider is used for all yearbook production folders.
              Switching providers will not move existing files, but new imports and uploads will use the new active provider.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
