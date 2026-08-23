import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Cloud, RefreshCw, Trash2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getMyStorageConnections,
  startOAuthFlow,
  disconnectMyStorage,
} from "@/lib/storage.functions";

export function MemberConnections() {
  const fetchMyStorage = useServerFn(getMyStorageConnections);
  const startOAuth = useServerFn(startOAuthFlow);
  const disconnect = useServerFn(disconnectMyStorage);
  const qc = useQueryClient();

  const { data: connections, isLoading } = useQuery({
    queryKey: ["my-storage"],
    queryFn: () => fetchMyStorage(),
  });

  const mutationStartOAuth = useMutation({
    mutationFn: async (provider: "google_drive" | "box") => {
      const res = await startOAuth({ data: { provider, scope: "member" } });
      if (!res?.url) throw new Error("No authorization URL returned.");
      window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationDisconnect = useMutation({
    mutationFn: (provider: "google_drive" | "box") => disconnect({ data: { provider } }),
    onSuccess: () => {
      toast.success("Connection removed");
      qc.invalidateQueries({ queryKey: ["my-storage"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return <div className="p-4 text-center text-muted-foreground">Loading your connections...</div>;

  const conn = connections?.find((c) => c.provider === "google_drive");
  const status = conn?.status || "disconnected";

  return (
    <div className="space-y-4">
      <div className="plate p-4 bg-muted/20 border-dashed mb-4">
        <div className="flex gap-3">
          <Info className="size-4 text-accent mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider">
              Member Import Sources
            </h4>
            <p className="text-[11px] text-muted-foreground mt-1">
              Connect your personal Google Drive to import photos directly into this yearbook. These
              connections are strictly <strong>IMPORT-ONLY</strong> and are not shared with other
              members.
            </p>
          </div>
        </div>
      </div>

      <div className="plate p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-full">
            <Cloud className="size-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Google Drive</h3>
              {conn && (
                <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4">
                  Import Only
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {status === "connected" ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="size-3" />
                  Connected as {conn?.account_email || "Personal Account"}
                </span>
              ) : status === "needs_reauthorization" ? (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertCircle className="size-3" />
                  Reauthorization Required
                </span>
              ) : status === "error" ? (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="size-3" />
                  {conn?.last_error || "Connection Error"}
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
              size="sm"
              onClick={() => mutationStartOAuth.mutate("google_drive")}
              disabled={mutationStartOAuth.isPending}
            >
              Connect
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => mutationStartOAuth.mutate("google_drive")}
                title="Reconnect"
              >
                <RefreshCw className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => mutationDisconnect.mutate("google_drive")}
                title="Disconnect"
              >
                <Trash2 className="size-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
