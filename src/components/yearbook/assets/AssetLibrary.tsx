import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileIcon,
  ImageIcon,
  Search,
  Filter,
  Plus,
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAssets, updateAssetStatus } from "@/lib/yearbook.functions";
import { getStorageUrl } from "@/lib/storage/storage-url";
import { BulkUpload } from "./BulkUpload";
import { AssetDetail } from "./AssetDetail";
import { ProviderImportDialog } from "../storage/ProviderImportDialog";

export function AssetLibrary({
  yearbookId,
  canEdit,
  studentId,
}: {
  yearbookId: string;
  canEdit: boolean;
  studentId?: string;
}) {
  const fetchAssets = useServerFn(getAssets);
  const updateStatus = useServerFn(updateAssetStatus);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(!!studentId);

  const queryKey = ["assets", yearbookId, { search, type, status, tag, showOnlyMine }];
  const { data: assets, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      fetchAssets({
        data: {
          yearbookId,
          filters: {
            search: search || undefined,
            type: type === "all" ? undefined : type,
            status: status === "all" ? undefined : status,
            tag: tag === "all" ? undefined : tag,
            studentId: showOnlyMine ? studentId : undefined,
          },
        },
      }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey });

  const handleStatusChange = async (assetId: string, newStatus: string) => {
    try {
      await updateStatus({ data: { assetId, status: newStatus as any } });
      toast.success("Status updated");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="size-4 text-green-500" />;
      case "rejected":
        return <XCircle className="size-4 text-red-500" />;
      case "replacement_required":
        return <AlertCircle className="size-4 text-amber-500" />;
      case "under_review":
        return <Clock className="size-4 text-blue-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2 min-w-[300px]">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="photo">Photos</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
              <SelectItem value="pdf">PDFs</SelectItem>
              <SelectItem value="logo">Logos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="uploaded">Uploaded</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          {studentId && (
            <div className="flex items-center gap-2">
              <Label htmlFor="mine-only" className="text-xs">
                My submissions
              </Label>
              <input
                id="mine-only"
                type="checkbox"
                checked={showOnlyMine}
                onChange={(e) => setShowOnlyMine(e.target.checked)}
                className="size-4 rounded border-gray-300"
              />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <ProviderImportDialog yearbookId={yearbookId} onDone={refresh} />
              <BulkUpload yearbookId={yearbookId} onDone={refresh} />
            </>
          )}
          {studentId && (
            <>
              <ProviderImportDialog
                yearbookId={yearbookId}
                studentId={studentId}
                onDone={refresh}
              />
              <BulkUpload
                yearbookId={yearbookId}
                onDone={refresh}
                studentId={studentId}
                label="Upload Portrait"
              />
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {(assets ?? []).map((asset: any) => (
            <div
              key={asset.id}
              className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md cursor-pointer"
              onClick={() => setSelectedAssetId(asset.id)}
            >
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {asset.asset_type === "photo" ? (
                  <img
                    src={getStorageUrl(asset.storage_path, "yearbook_assets")}
                    alt={asset.file_name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileIcon className="size-10" />
                    <span className="text-[10px] uppercase font-bold">
                      {asset.file_type?.split("/")[1] || asset.asset_type}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-2">
                <p className="truncate text-xs font-medium" title={asset.file_name}>
                  {asset.file_name}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {getStatusIcon(asset.status)}
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {asset.status.replace("_", " ")}
                    </span>
                  </div>
                  {asset.student && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                      {asset.student.last_name}
                    </Badge>
                  )}
                </div>
              </div>

              {canEdit && (
                <div
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-6 rounded-full shadow-sm"
                      >
                        <MoreVertical className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleStatusChange(asset.id, "approved")}>
                        Approve
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(asset.id, "rejected")}>
                        Reject
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(asset.id, "replacement_required")}
                      >
                        Request Replacement
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleStatusChange(asset.id, "archived")}
                      >
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
          {(assets?.length ?? 0) === 0 && (
            <div className="col-span-full py-20 text-center">
              <ImageIcon className="mx-auto size-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No assets found</h3>
              <p className="text-muted-foreground">
                Try adjusting your filters or upload new files.
              </p>
            </div>
          )}
        </div>
      )}

      {selectedAssetId && (
        <AssetDetail
          assetId={selectedAssetId}
          canEdit={canEdit}
          onClose={() => setSelectedAssetId(null)}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
