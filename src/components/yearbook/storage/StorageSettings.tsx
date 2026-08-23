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
  Database,
  FolderTree,
  Folder,
  Upload,
  Check,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  getCenterStorage,
  getOrganizationStorage,
  getYearbookStorage,
  startOAuthFlow,
  disconnectCenterStorageConnection,
  disconnectOrganizationProvider,
  saveOrganizationConnection,
  setupYearbookDriveFolders,
  setCenterDriveRootFolder,
  runStorageUploadVerification,
} from "@/lib/storage.functions";

export type StorageSettingsProps = {
  centerId?: string | undefined;
  yearbookId?: string | undefined;
};

export function StorageSettings({ centerId, yearbookId }: StorageSettingsProps) {
  const fetchCenterStorage = useServerFn(getCenterStorage);
  const fetchOrgStorage = useServerFn(getOrganizationStorage);
  const fetchYbStorage = useServerFn(getYearbookStorage);
  const startOAuth = useServerFn(startOAuthFlow);
  const disconnectCenter = useServerFn(disconnectCenterStorageConnection);
  const disconnectOrg = useServerFn(disconnectOrganizationProvider);
  const setupFolders = useServerFn(setupYearbookDriveFolders);
  const setRootFolder = useServerFn(setCenterDriveRootFolder);
  const verifyUpload = useServerFn(runStorageUploadVerification);
  const qc = useQueryClient();

  const isCenterMode = Boolean(centerId);
  const [customFolderId, setCustomFolderId] = useState("");
  const [testResult, setTestResult] = useState<{
    fileName?: string;
    downloadVerified?: boolean;
    timestamp?: string;
  } | null>(null);

  const { data: connections, isLoading } = useQuery({
    queryKey: isCenterMode ? ["center-storage", centerId] : ["organization-storage"],
    queryFn: () =>
      isCenterMode && centerId ? fetchCenterStorage({ data: { centerId } }) : fetchOrgStorage(),
  });

  const { data: ybConfig } = useQuery({
    queryKey: ["yearbook-storage", yearbookId],
    queryFn: () => (yearbookId ? fetchYbStorage({ data: { yearbookId } }) : null),
    enabled: Boolean(yearbookId),
  });

  const mutationStartOAuth = useMutation({
    mutationFn: (provider: "google_drive" | "box") =>
      startOAuth({
        data: {
          provider,
          scope: isCenterMode ? "center" : "organization",
          centerId: centerId || undefined,
          yearbookId: yearbookId || undefined,
        },
      }),
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationDisconnect = useMutation({
    mutationFn: (provider: "google_drive" | "box") =>
      isCenterMode && centerId
        ? disconnectCenter({ data: { centerId, provider } })
        : disconnectOrg({ data: { provider } }),
    onSuccess: () => {
      toast.success("Storage provider disconnected");
      qc.invalidateQueries({
        queryKey: isCenterMode ? ["center-storage", centerId] : ["organization-storage"],
      });
      qc.invalidateQueries({ queryKey: ["yearbook-storage", yearbookId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationSetupFolders = useMutation({
    mutationFn: () => {
      if (!yearbookId || !centerId) throw new Error("Missing yearbook or center ID");
      return setupFolders({ data: { yearbookId, centerId } });
    },
    onSuccess: () => {
      toast.success("Yearbook Google Drive folders created successfully!");
      qc.invalidateQueries({ queryKey: ["yearbook-storage", yearbookId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationSetRootFolder = useMutation({
    mutationFn: (folderId: string) => {
      if (!yearbookId || !centerId) throw new Error("Missing yearbook or center ID");
      return setRootFolder({ data: { centerId, yearbookId, folderId } });
    },
    onSuccess: (res) => {
      toast.success(`Authoritative root set: "${res.folderInfo?.name || "Folder"}"!`);
      setCustomFolderId("");
      qc.invalidateQueries({ queryKey: ["center-storage", centerId] });
      qc.invalidateQueries({ queryKey: ["yearbook-storage", yearbookId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutationVerifyUpload = useMutation({
    mutationFn: () => {
      if (!yearbookId || !centerId) throw new Error("Missing yearbook or center ID");
      return verifyUpload({ data: { centerId, yearbookId } });
    },
    onSuccess: (res) => {
      toast.success("Test upload and download verified successfully!");
      setTestResult({
        fileName: res.uploadedFile?.name,
        downloadVerified: res.downloadVerified,
        timestamp: new Date().toLocaleTimeString(),
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return <div className="p-8 text-center text-muted-foreground">Loading storage settings...</div>;

  const providers = [{ id: "google_drive", name: "Google Drive", icon: Cloud }] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl">
            {isCenterMode ? "Center Storage Connection" : "Organization Storage"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isCenterMode
              ? "Scoped Google Drive integration for this Center. Backed assets are managed securely via Milestone."
              : "Manage authoritative storage for all yearbooks."}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {providers.map((p) => {
          const conn = connections?.find((c) => c.provider === p.id);
          const status = conn?.status || "disconnected";
          const isConnected = status === "connected";
          const rootFolderId = conn?.root_folder_id;

          return (
            <div
              key={p.id}
              className={`plate p-5 space-y-4 border-2 ${isConnected ? "border-accent" : "border-transparent"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-muted rounded-full">
                    <p.icon
                      className={`size-6 ${isConnected ? "text-accent" : "text-muted-foreground"}`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg">{p.name}</h3>
                      {isConnected && (
                        <Badge
                          variant="default"
                          className="bg-accent text-accent-foreground text-[10px] uppercase font-bold"
                        >
                          Connected (Center Scoped)
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {status === "connected" ? (
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <CheckCircle2 className="size-3" />
                          Connected as {conn?.account_email || "Google Account"}
                        </span>
                      ) : status === "needs_reauthorization" ? (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertCircle className="size-3" />
                          Reauthorization Required
                        </span>
                      ) : status === "error" ? (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertCircle className="size-3" />
                          {conn?.detail || conn?.last_error || "Configuration Error"}
                        </span>
                      ) : (
                        "Not connected for this Center"
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
                      {yearbookId && centerId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => mutationSetupFolders.mutate()}
                          disabled={mutationSetupFolders.isPending}
                        >
                          <FolderTree className="size-3.5" />
                          Sync Folders
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => mutationStartOAuth.mutate(p.id)}
                        title="Reconnect / Refresh"
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

              {/* Authoritative Root & Subfolder Hierarchy Display */}
              {isConnected && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">
                        Authoritative Root Folder
                      </div>
                      <div className="flex items-center gap-2">
                        <Folder className="size-4 text-accent" />
                        <span className="text-sm font-medium truncate">
                          {rootFolderId ? rootFolderId : "Milestone Yearbook (Default Root)"}
                        </span>
                        {rootFolderId && (
                          <a
                            href={`https://drive.google.com/drive/folders/${rootFolderId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline text-xs flex items-center gap-0.5 ml-auto"
                          >
                            Open Drive <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="size-3" /> Last Synced:{" "}
                        {new Date(conn?.updated_at || Date.now()).toLocaleString()}
                      </div>
                    </div>

                    <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">
                        Yearbook Target Folder
                      </div>
                      <div className="text-sm font-medium truncate">
                        {ybConfig?.folder_path || "Not yet provisioned"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {ybConfig?.assets_folder_id
                          ? "Subfolders: Assets, Portraits, Proofs, Production ready"
                          : "Click 'Sync Folders' to provision subfolders"}
                      </div>
                    </div>
                  </div>

                  {/* Provisioned Folder Structure */}
                  {ybConfig?.assets_folder_id && (
                    <div className="p-3 bg-muted/20 border rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <FolderTree className="size-3.5" /> Provisioned Drive Folder Hierarchy:
                        </span>
                        {ybConfig.folder_id && (
                          <a
                            href={`https://drive.google.com/drive/folders/${ybConfig.folder_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline flex items-center gap-1 text-[11px]"
                          >
                            Open Yearbook Folder <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <a
                          href={`https://drive.google.com/drive/folders/${ybConfig.assets_folder_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-background border hover:border-accent rounded flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="size-3 text-blue-500" />
                            <span className="truncate font-medium">Assets</span>
                          </div>
                          <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent opacity-60" />
                        </a>
                        <a
                          href={`https://drive.google.com/drive/folders/${ybConfig.portraits_folder_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-background border hover:border-accent rounded flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="size-3 text-amber-500" />
                            <span className="truncate font-medium">Portraits</span>
                          </div>
                          <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent opacity-60" />
                        </a>
                        <a
                          href={`https://drive.google.com/drive/folders/${ybConfig.proofs_folder_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-background border hover:border-accent rounded flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="size-3 text-emerald-500" />
                            <span className="truncate font-medium">Proofs</span>
                          </div>
                          <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent opacity-60" />
                        </a>
                        <a
                          href={`https://drive.google.com/drive/folders/${ybConfig.production_folder_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-background border hover:border-accent rounded flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Folder className="size-3 text-purple-500" />
                            <span className="truncate font-medium">Production</span>
                          </div>
                          <ExternalLink className="size-3 text-muted-foreground group-hover:text-accent opacity-60" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Link Custom Google Drive Folder ID Form */}
                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                    <Input
                      placeholder="Enter Google Drive Folder ID (e.g. 10AO9Y1mPX2PMVVkX34OzwidDLWmiHeGS)"
                      value={customFolderId}
                      onChange={(e) => setCustomFolderId(e.target.value)}
                      className="text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (!customFolderId.trim()) {
                          toast.error("Please enter a valid Google Drive folder ID");
                          return;
                        }
                        mutationSetRootFolder.mutate(customFolderId.trim());
                      }}
                      disabled={mutationSetRootFolder.isPending}
                    >
                      Set Authoritative Root
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs"
                      onClick={() => mutationVerifyUpload.mutate()}
                      disabled={mutationVerifyUpload.isPending}
                    >
                      <Upload className="size-3" />
                      Test Upload & Download
                    </Button>
                  </div>

                  {testResult && (
                    <div className="p-2.5 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-700 dark:text-green-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <Check className="size-4 text-green-600 shrink-0" />
                        <span>
                          Uploaded: <strong>{testResult.fileName}</strong> | Download Verified:{" "}
                          <strong>
                            {testResult.downloadVerified ? "YES (Content Match)" : "FAILED"}
                          </strong>
                        </span>
                      </span>
                      <div className="flex items-center gap-2">
                        {ybConfig?.assets_folder_id && (
                          <a
                            href={`https://drive.google.com/drive/folders/${ybConfig.assets_folder_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline font-semibold flex items-center gap-0.5"
                          >
                            View in Assets Folder <ExternalLink className="size-3" />
                          </a>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {testResult.timestamp}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="plate p-4 bg-muted/30 border-dashed">
        <div className="flex gap-3">
          <Settings2 className="size-5 text-muted-foreground mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Center Isolation & Security Rule</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Google Drive credentials are encrypted with AES-256-GCM and scoped strictly to this
              Center. Other Centers cannot view or access this Google Drive account or its folders.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
