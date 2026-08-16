import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { createProof } from "@/lib/yearbook.functions";

export function ProofUploadDialog({
  yearbookId,
  pageIds,
  onDone,
}: {
  yearbookId: string;
  pageIds: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notes, setNotes] = useState("");
  const doCreateProof = useServerFn(createProof);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    
    try {
      // In a real app, this would upload to storage first.
      // Simulating storage path for Phase 3.
      const mockStoragePath = `https://example.com/proofs/${yearbookId}/${Date.now()}.pdf`;
      
      await doCreateProof({
        data: {
          yearbookId,
          pageIds,
          storagePath: mockStoragePath,
          notes,
        },
      });
      
      toast.success("Proof version created");
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="w-full">
          <Upload className="mr-2 size-3" />
          Upload PDF Proof
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload PDF Proof Version</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleUpload} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Select PDF File</Label>
            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-accent/50 cursor-pointer transition-colors">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to select or drag and drop</p>
              <p className="text-[10px] text-muted-foreground/60 font-mono">PDF only, max 50MB</p>
              <Input type="file" className="hidden" accept=".pdf" />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <Label>Version Notes</Label>
            <Textarea 
              placeholder="e.g. Initial draft, fixed typo on page 37..." 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="bg-muted/50 p-3 rounded text-[10px] text-muted-foreground italic">
            This will create a new immutable proof version for the current pages.
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 size-3 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Create Proof Version"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
