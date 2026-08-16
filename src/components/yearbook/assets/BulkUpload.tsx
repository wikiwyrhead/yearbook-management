import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { 
  Upload, 
  X, 
  FileIcon, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Table,
  Link as LinkIcon
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { createAsset } from "@/lib/yearbook.functions";

export function BulkUpload({ 
  yearbookId, 
  onDone,
  studentId,
  label = "Bulk Upload"
}: { 
  yearbookId: string; 
  onDone: () => void;
  studentId?: string;
  label?: string;
}) {
  const uploadAsset = useServerFn(createAsset);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);
    let completed = 0;
    
    // Batch processing to avoid timeouts
    const batchSize = 5;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (file) => {
        try {
          // In a real app, we would upload to storage first and get a path
          // For now, we'll simulate it with a mock path
          const storagePath = `https://images.unsplash.com/photo-1523050853064-dbad3e24993f?w=800&q=80`;
          
          await uploadAsset({
              data: {
                yearbookId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                storagePath,
                assetType: file.type.startsWith('image/') ? 'photo' : 'document' as any,
                category: studentId ? 'Student Submission' : 'Bulk Upload',
                studentId: studentId || undefined,
                validationMetadata: {
                  lastModified: file.lastModified,
                }
              }

          });
          
          completed++;
          setProgress(Math.round((completed / files.length) * 100));
        } catch (e: any) {
          toast.error(`Failed to upload ${file.name}: ${e.message}`);
        }
      }));
    }
    
    setUploading(false);
    toast.success(`Successfully uploaded ${completed} files`);
    setFiles([]);
    setProgress(0);
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 size-4" /> {label}
        </Button>

      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Assets</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!uploading ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 hover:bg-muted/50 transition-colors cursor-pointer relative">
              <input 
                type="file" 
                multiple 
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileChange}
              />
              <Upload className="size-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">Click or drag files to upload</p>
              <p className="text-xs text-muted-foreground mt-1">Support for Photos, PDFs, and Documents</p>
            </div>
          ) : (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading {files.length} files...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
              <div className="flex justify-center">
                <Loader2 className="size-6 animate-spin text-accent" />
              </div>
            </div>
          )}

          {files.length > 0 && !uploading && (
            <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                  <div className="flex items-center gap-2 truncate">
                    <FileIcon className="size-3 text-muted-foreground" />
                    <span className="truncate">{file.name}</span>
                  </div>
                  <span className="text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
             <div className="p-3 border rounded-lg bg-muted/30 flex items-center gap-3">
                <Table className="size-5 text-accent" />
                <div className="space-y-0.5">
                   <p className="text-xs font-bold">CSV Mapping</p>
                   <p className="text-[10px] text-muted-foreground">Link files via spreadsheet</p>
                </div>
             </div>
             <div className="p-3 border rounded-lg bg-muted/30 flex items-center gap-3">
                <LinkIcon className="size-5 text-accent" />
                <div className="space-y-0.5">
                   <p className="text-xs font-bold">Auto-Link</p>
                   <p className="text-[10px] text-muted-foreground">Match by filename</p>
                </div>
             </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
            {uploading ? 'Uploading...' : `Upload ${files.length} Files`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
