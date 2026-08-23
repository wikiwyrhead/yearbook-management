import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Folder,
  File,
  Search,
  ChevronRight,
  ChevronLeft,
  Download,
  Check,
  Loader2,
  AlertCircle,
  Clock,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { browseProvider, importProviderFiles } from "@/lib/storage.functions";

export type ProviderBrowserProps = {
  yearbookId: string;
  provider: "google_drive" | "box";
  scope: "organization" | "member";
  studentId: string | undefined;
  sectionId?: string | undefined;
  category?: string | undefined;
  onImportComplete?: () => void;
};

export function ProviderBrowser({
  yearbookId,
  provider,
  scope,
  studentId,
  sectionId,
  category,
  onImportComplete,
}: ProviderBrowserProps) {
  const browse = useServerFn(browseProvider);
  const runImport = useServerFn(importProviderFiles);

  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const [history, setHistory] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const queryKey = ["browse", provider, scope, currentFolderId, search];
  const {
    data: rawData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () =>
      browse({
        data: {
          yearbookId,
          provider,
          scope,
          folderId: currentFolderId,
          search: search || undefined,
        },
      }),
  });

  const data = useMemo(() => {
    if (!rawData) return { folders: [], files: [] };
    if ("folders" in rawData) {
      return { folders: rawData.folders, files: rawData.files };
    }
    // Search result is ListResult<RemoteFile>
    return { folders: [], files: rawData.items };
  }, [rawData]);

  const navigateTo = (folderId: string) => {
    if (currentFolderId) {
      setHistory((prev) => [...prev, currentFolderId]);
    }
    setCurrentFolderId(folderId);
    setSearch("");
  };

  const goBack = () => {
    const newHistory = [...history];
    const prev = newHistory.pop();
    setHistory(newHistory);
    setCurrentFolderId(prev);
    setSearch("");
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;

    setIsImporting(true);
    setImportProgress(0);

    const ids = Array.from(selectedIds);
    let successCount = 0;
    let failCount = 0;

    try {
      // In a real multi-file scenario, we'd loop or the server fn would handle batching.
      // Our existing runImport handles a list of IDs.
      await runImport({
        data: {
          yearbookId,
          provider,
          scope,
          fileIds: ids,
          studentId,
          sectionId,
          category,
          folderId: currentFolderId,
        },
      });

      successCount = ids.length;
      toast.success(`Successfully imported ${successCount} files`);
      setSelectedIds(new Set());
      onImportComplete?.();
    } catch (err: any) {
      failCount = ids.length;
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
      setImportProgress(100);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <div className="flex flex-col h-[500px] border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {history.length > 0 || currentFolderId ? (
            <Button variant="ghost" size="icon" className="size-8" onClick={goBack}>
              <ChevronLeft className="size-4" />
            </Button>
          ) : null}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize text-[10px] font-bold">
              {provider.replace("_", " ")}
            </Badge>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-medium truncate max-w-[150px]">
              {currentFolderId ? "Folder Contents" : "Root"}
            </span>
          </div>
        </div>

        <div className="relative flex-1 max-w-[200px]">
          <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="h-8 pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-xs italic">Browsing {provider.replace("_", " ")}...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-2">
            <AlertCircle className="size-8 text-destructive/50" />
            <p className="text-sm font-medium">Connection Error</p>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              {error instanceof Error ? error.message : "Failed to connect to provider"}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              <RefreshCw className="mr-2 size-3" /> Retry
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {data?.folders?.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center p-3 hover:bg-muted/50 cursor-pointer group"
                onClick={() => navigateTo(folder.id)}
              >
                <Folder className="size-4 text-accent/60 mr-3" />
                <span className="text-xs font-medium flex-1 truncate">{folder.name}</span>
                <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </div>
            ))}
            {data?.files?.map((file) => {
              const isSelected = selectedIds.has(file.id);
              return (
                <div
                  key={file.id}
                  className={`flex items-center p-3 hover:bg-muted/50 cursor-pointer group ${isSelected ? "bg-accent/5" : ""}`}
                  onClick={() => toggleSelection(file.id)}
                >
                  <div
                    className={`size-4 rounded-sm border mr-3 flex items-center justify-center transition-colors ${isSelected ? "bg-accent border-accent" : "border-muted-foreground/30"}`}
                  >
                    {isSelected && <Check className="size-3 text-white" />}
                  </div>
                  <File className="size-4 text-muted-foreground/60 mr-3" />
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-xs font-medium truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>{formatSize(file.size)}</span>
                      {file.modifiedAt && (
                        <span>• {new Date(file.modifiedAt).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>
                  {file.webUrl && (
                    <a
                      href={file.webUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                  )}
                </div>
              );
            })}
            {!data?.folders?.length && !data?.files?.length && (
              <div className="p-12 text-center text-muted-foreground italic text-xs">
                No folders or files found here.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t bg-muted/10 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {selectedIds.size} file{selectedIds.size === 1 ? "" : "s"} selected
        </p>
        <div className="flex items-center gap-2">
          {isImporting && (
            <div className="w-24 mr-2">
              <Progress value={importProgress} className="h-1" />
            </div>
          )}
          <Button size="sm" disabled={selectedIds.size === 0 || isImporting} onClick={handleImport}>
            {isImporting ? (
              <Loader2 className="mr-2 size-3 animate-spin" />
            ) : (
              <Download className="mr-2 size-3" />
            )}
            Import to Milestone
          </Button>
        </div>
      </div>
    </div>
  );
}
