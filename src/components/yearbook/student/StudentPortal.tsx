import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  GraduationCap,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Image as ImageIcon,
  Calendar,
  Sparkles,
  Camera,
  FolderHeart,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAssets, createAsset, savePerson } from "@/lib/yearbook.functions";
import { getStorageUrl } from "@/lib/storage/storage-url";

interface StudentPortalProps {
  yearbookId: string;
  studentId?: string | null;
  yearbookTitle?: string | null;
  yearbookYear: number;
  schoolName?: string | null;
  theme?: string | null;
  userEmail?: string | null;
  userName?: string | null;
}

const CANDID_CATEGORIES = [
  "Senior Candids",
  "Athletics & Games",
  "Clubs & Organizations",
  "Spirit Week & Rallies",
  "Visual & Performing Arts",
  "Student Life & Friends",
];

export function StudentPortal({
  yearbookId,
  studentId,
  yearbookTitle,
  yearbookYear,
  schoolName,
  theme,
  userEmail,
  userName,
}: StudentPortalProps) {
  const qc = useQueryClient();
  const fetchAssets = useServerFn(getAssets);
  const doCreateAsset = useServerFn(createAsset);
  const doSavePerson = useServerFn(savePerson);

  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [isUploadingPortrait, setIsUploadingPortrait] = useState(false);

  const [candidFile, setCandidFile] = useState<File | null>(null);
  const [candidCategory, setCandidCategory] = useState<string>(
    CANDID_CATEGORIES[0] || "Sports & Athletics",
  );
  const [candidTag, setCandidTag] = useState("");
  const [isUploadingCandid, setIsUploadingCandid] = useState(false);

  // 1. Fetch student's uploaded assets
  const { data: assets, isLoading } = useQuery({
    queryKey: ["student-assets", yearbookId, studentId],
    queryFn: () =>
      fetchAssets({
        data: {
          yearbookId,
          filters: {
            studentId: studentId || undefined,
          },
        },
      }),
  });

  const studentAssets = (assets as any[]) || [];
  const portraitAsset = studentAssets.find(
    (a) => a.category === "Senior Portrait" || a.asset_type === "photo",
  );

  // Handle Senior Portrait Upload
  const handlePortraitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portraitFile) {
      toast.error("Please select a portrait image");
      return;
    }
    setIsUploadingPortrait(true);

    try {
      const formData = new FormData();
      formData.append("file", portraitFile);
      formData.append("bucket", "yearbook_assets");
      formData.append("yearbookId", yearbookId);
      formData.append("subfolder", `portraits/${studentId || "student"}`);

      const uploadRes = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to upload portrait file");
      }

      const uploadData = await uploadRes.json();
      const storagePath = uploadData.storagePath;

      // 1. Create asset record
      await doCreateAsset({
        data: {
          yearbookId,
          fileName: portraitFile.name,
          fileType: portraitFile.type,
          fileSize: portraitFile.size,
          storagePath,
          assetType: "photo",
          category: "Senior Portrait",
          studentId: studentId || undefined,
        },
      });

      // 2. If studentId present, update student submission status to 'submitted'
      if (studentId) {
        await doSavePerson({
          data: {
            table: "students",
            yearbookId,
            id: studentId,
            values: {
              submission_status: "submitted",
            },
          },
        });
      }

      toast.success("Senior portrait submitted successfully!");
      setPortraitFile(null);
      qc.invalidateQueries({ queryKey: ["student-assets", yearbookId, studentId] });
      qc.invalidateQueries({ queryKey: ["yearbook", yearbookId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit portrait");
    } finally {
      setIsUploadingPortrait(false);
    }
  };

  // Handle Candid Photo Upload
  const handleCandidUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidFile) {
      toast.error("Please select a photo to share");
      return;
    }
    setIsUploadingCandid(true);

    try {
      const formData = new FormData();
      formData.append("file", candidFile);
      formData.append("bucket", "yearbook_assets");
      formData.append("yearbookId", yearbookId);
      formData.append("subfolder", "candids");

      const uploadRes = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to upload photo");
      }

      const uploadData = await uploadRes.json();
      const storagePath = uploadData.storagePath;

      await doCreateAsset({
        data: {
          yearbookId,
          fileName: candidFile.name,
          fileType: candidFile.type,
          fileSize: candidFile.size,
          storagePath,
          assetType: "photo",
          category: candidCategory,
          studentId: studentId || undefined,
        },
      });

      toast.success(`Photo submitted to ${candidCategory}!`);
      setCandidFile(null);
      setCandidTag("");
      qc.invalidateQueries({ queryKey: ["student-assets", yearbookId, studentId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setIsUploadingCandid(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle2 className="size-3 mr-1" /> Approved for Print
          </Badge>
        );
      case "submitted":
      case "under_review":
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
            <Clock className="size-3 mr-1" /> Under Review
          </Badge>
        );
      case "replacement_required":
        return (
          <Badge variant="destructive">
            <AlertCircle className="size-3 mr-1" /> Re-submission Required
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20"
          >
            <AlertCircle className="size-3 mr-1" /> Missing Portrait
          </Badge>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-background border p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <GraduationCap className="size-4" /> Student Portal · {yearbookYear} Edition
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Welcome, {userName || "Student"}!
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              {schoolName} ·{" "}
              <span className="font-medium text-foreground">
                {yearbookTitle || `${yearbookYear} Yearbook`}
              </span>
              {theme && ` — "${theme}"`}
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1.5 bg-card/60 backdrop-blur-sm p-4 rounded-xl border">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Portrait Status
            </span>
            {getStatusBadge(portraitAsset?.status || (studentId ? "pending" : "missing"))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Section 1: Senior Portrait Submission */}
        <div className="md:col-span-5 space-y-6">
          <div className="plate p-6 space-y-5">
            <div className="flex items-center gap-2 border-b pb-4">
              <Camera className="size-5 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">Official Portrait</h2>
                <p className="text-xs text-muted-foreground">
                  Your primary photo for senior portraits & index
                </p>
              </div>
            </div>

            {/* Current Portrait Preview */}
            <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-xl border border-dashed">
              {portraitAsset ? (
                <div className="space-y-3 w-full flex flex-col items-center">
                  <div className="relative aspect-[3/4] w-48 rounded-lg overflow-hidden border shadow-sm bg-background">
                    <img
                      src={getStorageUrl(portraitAsset.storage_path, "yearbook_assets")}
                      alt="My Portrait"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-foreground truncate max-w-[200px]">
                      {portraitAsset.file_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Uploaded on {new Date(portraitAsset.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Camera className="size-8" />
                  </div>
                  <p className="text-sm font-medium">No portrait uploaded yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Upload a vertical high-resolution portrait in JPG, PNG, or WebP format.
                  </p>
                </div>
              )}
            </div>

            {/* Portrait Upload Form */}
            <form onSubmit={handlePortraitUpload} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Select New Portrait</Label>
                <label className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-1.5 hover:bg-accent/40 cursor-pointer transition-colors relative">
                  <Upload className="size-5 text-muted-foreground" />
                  <p className="text-xs font-medium text-foreground">
                    {portraitFile ? portraitFile.name : "Choose photo file..."}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Max 25MB · High Res JPG/PNG
                  </p>
                  <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setPortraitFile(e.target.files[0]);
                    }}
                  />
                </label>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!portraitFile || isUploadingPortrait}
              >
                {isUploadingPortrait
                  ? "Uploading Portrait..."
                  : portraitAsset
                    ? "Replace Portrait"
                    : "Submit Portrait"}
              </Button>
            </form>
          </div>
        </div>

        {/* Section 2: Submit Candid Photos & Memories */}
        <div className="md:col-span-7 space-y-6">
          <div className="plate p-6 space-y-5">
            <div className="flex items-center gap-2 border-b pb-4">
              <FolderHeart className="size-5 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">Share Yearbook Photos</h2>
                <p className="text-xs text-muted-foreground">
                  Submit photos of sports, clubs, and senior activities
                </p>
              </div>
            </div>

            <form onSubmit={handleCandidUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={candidCategory} onValueChange={setCandidCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANDID_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tag / Activity (Optional)</Label>
                <Input
                  placeholder="e.g. Varsity Soccer, Robotics"
                  value={candidTag}
                  onChange={(e) => setCandidTag(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Select Photo</Label>
                <label className="border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center gap-1.5 hover:bg-accent/40 cursor-pointer transition-colors relative">
                  <ImageIcon className="size-6 text-muted-foreground" />
                  <p className="text-xs font-medium text-foreground">
                    {candidFile ? candidFile.name : "Click to select or drag photo"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Images will be reviewed by the yearbook editorial team
                  </p>
                  <input
                    type="file"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setCandidFile(e.target.files[0]);
                    }}
                  />
                </label>
              </div>

              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  disabled={!candidFile || isUploadingCandid}
                  className="w-full"
                >
                  {isUploadingCandid ? "Uploading Photo..." : "Submit Photo to Yearbook"}
                </Button>
              </div>
            </form>
          </div>

          {/* Gallery of Submitted Memories */}
          <div className="plate p-6 space-y-4">
            <h3 className="font-display text-base font-bold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> My Submissions ({studentAssets.length})
            </h3>

            {isLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : studentAssets.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center italic">
                You haven't submitted any photos yet. Use the form above to share your favorite
                moments!
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {studentAssets.map((asset: any) => (
                  <div
                    key={asset.id}
                    className="group relative rounded-lg border overflow-hidden bg-card flex flex-col"
                  >
                    <div className="aspect-square bg-muted overflow-hidden flex items-center justify-center">
                      <img
                        src={getStorageUrl(asset.storage_path, "yearbook_assets")}
                        alt={asset.file_name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                    <div className="p-2 space-y-1">
                      <p className="text-xs font-medium truncate">{asset.file_name}</p>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground truncate">
                          {asset.category || "General"}
                        </span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
                          {asset.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
