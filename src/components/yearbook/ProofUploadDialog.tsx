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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const doCreateProof = useServerFn(createProof);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please select a PDF file");
      return;
    }
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("bucket", "yearbook_proofs");
      formData.append("yearbookId", yearbookId);
      formData.append("subfolder", "proofs");

      const uploadRes = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to upload PDF");
      }

      const uploadData = await uploadRes.json();
      const storagePath = uploadData.storagePath;

      await doCreateProof({
        data: {
          yearbookId,
          pageIds,
          storagePath,
          notes,
        },
      });

      toast.success("Proof version created");
      setOpen(false);
      setSelectedFile(null);
      setNotes("");
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
            <label className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-accent/50 cursor-pointer transition-colors relative">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {selectedFile ? selectedFile.name : "Click to select or drag and drop"}
              </p>
              <p className="text-[10px] text-muted-foreground/60 font-mono">
                {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : "PDF only, max 50MB"}
              </p>
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
              />
            </label>
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
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
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
