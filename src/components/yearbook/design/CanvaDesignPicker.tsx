import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Search, 
  ExternalLink, 
  RefreshCw, 
  Loader2, 
  AlertCircle,
  Image as ImageIcon,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listCanvaDesigns, getCanvaConnection } from "@/lib/design.functions";

export type CanvaDesignPickerProps = {
  yearbookId: string;
  selectedDesignId?: string;
  onSelect: (designId: string, designUrl: string, title: string) => void;
};

export function CanvaDesignPicker({
  yearbookId,
  selectedDesignId,
  onSelect
}: CanvaDesignPickerProps) {
  const fetchConnection = useServerFn(getCanvaConnection);
  const fetchDesigns = useServerFn(listCanvaDesigns);
  const [search, setSearch] = useState("");

  const { data: connection, isLoading: isLoadingConn } = useQuery({
    queryKey: ["canva-connection", yearbookId],
    queryFn: () => fetchConnection({ data: { yearbookId } }),
  });

  const { data: designs, isLoading: isLoadingDesigns, error, refetch } = useQuery({
    queryKey: ["canva-designs", yearbookId, search],
    queryFn: () => fetchDesigns({ data: { yearbookId, search: search || undefined } }),
    enabled: connection?.status === "connected",
  });

  if (isLoadingConn) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground"><Loader2 className="animate-spin mr-2 size-4" /> Verifying Canva connection...</div>;
  }

  if (!connection || connection.status === "disconnected") {
    return (
      <div className="plate p-8 text-center bg-muted/20">
        <ImageIcon className="mx-auto size-10 text-muted-foreground/30 mb-3" />
        <h4 className="font-display text-lg">Canva Not Connected</h4>
        <p className="text-xs text-muted-foreground mt-1 mb-4">You need to connect a Canva account to this yearbook first.</p>
        <Badge variant="outline" className="text-[10px] uppercase font-bold">DISCONNECTED</Badge>
      </div>
    );
  }

  if (connection.status === "needs_reauthorization") {
    return (
      <div className="plate p-8 text-center bg-amber-500/5 border-amber-200">
        <AlertCircle className="mx-auto size-10 text-amber-500/50 mb-3" />
        <h4 className="font-display text-lg">Authorization Expired</h4>
        <p className="text-xs text-muted-foreground mt-1 mb-4">Your Canva connection needs to be reauthorized.</p>
        <Badge variant="outline" className="text-[10px] uppercase font-bold bg-amber-500/10 text-amber-600 border-amber-200">
          REAUTHORIZATION REQUIRED
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input 
          placeholder="Search your Canva designs..." 
          className="pl-9 h-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="max-h-[350px] overflow-y-auto pr-1">
        {isLoadingDesigns ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="animate-spin size-6" />
            <p className="text-xs italic">Fetching designs...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <AlertCircle className="mx-auto size-8 text-destructive/40 mb-2" />
            <p className="text-sm font-medium">Failed to load designs</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">{error instanceof Error ? error.message : "API error"}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 size-3" /> Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {designs?.map((design: any) => {
              const isSelected = selectedDesignId === design.id;
              return (
                <div 
                  key={design.id} 
                  className={`group relative plate p-3 flex flex-col gap-2 hover:ring-2 hover:ring-accent/30 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-accent bg-accent/5' : ''}`}
                  onClick={() => onSelect(design.id, design.url, design.title)}
                >
                  <div className="aspect-[16/9] bg-muted rounded overflow-hidden relative">
                    {design.thumbnailUrl ? (
                      <img 
                        src={design.thumbnailUrl} 
                        alt={design.title} 
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="size-8 text-muted-foreground/20" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-1 right-1 bg-accent rounded-full p-1 shadow-sm">
                        <Check className="size-3 text-accent-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate pr-4" title={design.title}>{design.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Updated {design.updatedAt ? new Date(design.updatedAt).toLocaleDateString() : 'recently'}
                    </p>
                  </div>
                  <a 
                    href={design.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 p-1 hover:bg-accent/10 rounded transition-opacity"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="size-3 text-accent" />
                  </a>
                </div>
              );
            })}
            {designs?.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground italic text-sm">
                No designs found matching your search.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
