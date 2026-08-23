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
  Quote,
  BookOpen,
  Award,
  Heart,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  "Senior Candids & Memories",
  "Athletics, Rallies & Games",
  "Clubs, Robotics & Competitions",
  "Spirit Week & Homecoming",
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

  // Senior quote & bio state
  const [seniorQuote, setSeniorQuote] = useState(
    "“The future belongs to those who believe in the beauty of their dreams.”",
  );
  const [seniorActivities, setSeniorActivities] = useState("Varsity Swim Team · Robotics Club President · National Honor Society");
  const [futureMajor, setFutureMajor] = useState("Computer Science & Design");
  const [nickname, setNickname] = useState("Alex");
  const [savingBio, setSavingBio] = useState(false);

  const [candidFile, setCandidFile] = useState<File | null>(null);
  const [candidCategory, setCandidCategory] = useState<string>(CANDID_CATEGORIES[0] || "Senior Candids");
  const [candidTag, setCandidTag] = useState("");
  const [isUploadingCandid, setIsUploadingCandid] = useState(false);

  // Fetch student's uploaded assets
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

  // Handle Senior Bio Save
  const handleSaveBio = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBio(true);
    try {
      if (studentId) {
        await doSavePerson({
          data: {
            table: "students",
            yearbookId,
            id: studentId,
            values: {
              notes: JSON.stringify({ seniorQuote, seniorActivities, futureMajor, nickname }),
            },
          },
        });
      }
      toast.success("Senior quote & activities updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save bio");
    } finally {
      setSavingBio(false);
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
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
            <CheckCircle2 className="size-3" /> Approved for Press
          </Badge>
        );
      case "submitted":
      case "under_review":
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 gap-1">
            <Clock className="size-3" /> Under Adviser Review
          </Badge>
        );
      case "replacement_required":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="size-3" /> Re-submission Required
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 bg-amber-500/10 gap-1">
            <AlertCircle className="size-3" /> Portrait Needed
          </Badge>
        );
    }
  };

  const hasPortrait = !!portraitAsset;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-accent/10 border border-border p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <GraduationCap className="size-4" /> Senior Submission Portal &middot; Class of {yearbookYear}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Welcome, {userName || "Senior"}!
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              {schoolName || "Demo High School"} &middot;{" "}
              <span className="font-medium text-foreground">
                {yearbookTitle || `${yearbookYear} Annual Edition`}
              </span>
              {theme && ` — "${theme}"`}
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-1.5 bg-card/80 backdrop-blur-md p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              Portrait Submission
            </span>
            {getStatusBadge(portraitAsset?.status || (hasPortrait ? "submitted" : "missing"))}
          </div>
        </div>
      </div>

      {/* 4-Step Submission Progress Checklist */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${hasPortrait ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300" : "bg-card border-border"}`}>
          <div className={`size-7 rounded-full flex items-center justify-center font-bold text-xs ${hasPortrait ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
            {hasPortrait ? "✓" : "1"}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">Senior Portrait</div>
            <div className="text-[10px] text-muted-foreground truncate">{hasPortrait ? "Uploaded" : "Pending"}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
          <div className="size-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
            ✓
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">Senior Quote</div>
            <div className="text-[10px] text-muted-foreground truncate">Drafted &amp; Ready</div>
          </div>
        </div>

        <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${studentAssets.length > 1 ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300" : "bg-card border-border"}`}>
          <div className={`size-7 rounded-full flex items-center justify-center font-bold text-xs ${studentAssets.length > 1 ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
            {studentAssets.length > 1 ? "✓" : "3"}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">Candid Memories</div>
            <div className="text-[10px] text-muted-foreground truncate">{studentAssets.length} Photos Shared</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border bg-card border-border flex items-center gap-3">
          <div className="size-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold text-xs">
            4
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">Adviser Sign-Off</div>
            <div className="text-[10px] text-muted-foreground truncate">In Pre-Flight</div>
          </div>
        </div>
      </div>

      {/* Live Yearbook Page Print Preview Showcase */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold flex items-center gap-2 text-foreground">
              <BookOpen className="size-5 text-primary" />
              Live Yearbook Page Print Preview
            </h2>
            <p className="text-xs text-muted-foreground">
              Simulated 300 DPI high-gloss printed book spread excerpt showing how your senior profile will appear in print.
            </p>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
            Print Simulation
          </Badge>
        </div>

        {/* Realistic Book Cutout Preview Card */}
        <div className="p-6 rounded-xl bg-muted/40 border border-border/80 flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden">
          {/* Subtle Watermark Quote Icon */}
          <Quote className="absolute right-4 bottom-4 size-32 text-primary/5 pointer-events-none" />

          {/* Portrait Photo Mockup */}
          <div className="shrink-0 w-36 sm:w-44 aspect-[3/4] rounded-lg overflow-hidden border-2 border-background shadow-md bg-muted relative">
            {portraitAsset ? (
              <img
                src={getStorageUrl(portraitAsset.storage_path, "yearbook_assets")}
                alt="Senior Portrait"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-primary/5 text-muted-foreground">
                <Camera className="size-8 text-primary/40 mb-1" />
                <span className="text-[11px] font-medium">Portrait Slot</span>
                <span className="text-[9px] text-muted-foreground">Upload below</span>
              </div>
            )}
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[9px] text-white font-mono">
              300 DPI
            </div>
          </div>

          {/* Student Editorial Bio & Quote Text */}
          <div className="space-y-3 flex-1 min-w-0 text-center md:text-left">
            <div>
              <h3 className="font-display text-2xl font-bold text-foreground">
                {userName || "Alexandria Rivera"}
              </h3>
              {nickname && (
                <p className="text-xs text-muted-foreground font-sans font-medium">
                  &ldquo;{nickname}&rdquo; &middot; Senior Class of {yearbookYear}
                </p>
              )}
            </div>

            {/* Senior Quote with Stylized Quotes */}
            <div className="p-3.5 rounded-lg bg-background border border-border/60 relative">
              <Quote className="size-3.5 text-primary mb-1 inline-block mr-1 opacity-60" />
              <p className="font-serif italic text-sm text-foreground leading-relaxed inline">
                {seniorQuote || "No quote provided yet."}
              </p>
            </div>

            {/* Extracurriculars & Future Ambition */}
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {seniorActivities && (
                <p className="flex items-center gap-1.5 justify-center md:justify-start">
                  <Award className="size-3.5 text-accent shrink-0" />
                  <span className="font-medium text-foreground">{seniorActivities}</span>
                </p>
              )}
              {futureMajor && (
                <p className="flex items-center gap-1.5 justify-center md:justify-start text-[11px]">
                  <GraduationCap className="size-3.5 text-primary shrink-0" />
                  <span>Future Ambition: <strong className="text-foreground">{futureMajor}</strong></span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Forms Grid: Portrait Upload + Quote Customizer */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left Column: Official Portrait Upload Form */}
        <div className="md:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b pb-4">
              <Camera className="size-5 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">Official Portrait Upload</h2>
                <p className="text-xs text-muted-foreground">
                  Vertical high-resolution headshot for class roster
                </p>
              </div>
            </div>

            <form onSubmit={handlePortraitUpload} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Select Photo File</Label>
                <label className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-2 hover:bg-muted/40 cursor-pointer transition-colors relative group">
                  <Upload className="size-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  <p className="text-xs font-semibold text-foreground text-center">
                    {portraitFile ? portraitFile.name : "Choose photo or drag file here"}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    JPG, PNG, or WebP &middot; Max 25MB
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

              {/* Photo Guidelines Tip */}
              <div className="p-3 rounded-lg bg-muted/40 border border-border text-[11px] text-muted-foreground space-y-1">
                <span className="font-bold text-foreground">Portrait Photo Guidelines:</span>
                <p>&bull; Neutral studio background with natural front lighting</p>
                <p>&bull; Head and shoulders framing (vertical 3:4 aspect ratio)</p>
                <p>&bull; No hats, sunglasses, or heavy filters</p>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!portraitFile || isUploadingPortrait}
              >
                {isUploadingPortrait
                  ? "Uploading & Validating Resolution..."
                  : portraitAsset
                    ? "Replace Official Portrait"
                    : "Submit Official Portrait"}
              </Button>
            </form>
          </div>
        </div>

        {/* Right Column: Senior Quote & Candid Sharing */}
        <div className="md:col-span-7 space-y-6">
          {/* Senior Quote & Activities Customizer */}
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b pb-4">
              <Quote className="size-5 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">Senior Quote &amp; Activities</h2>
                <p className="text-xs text-muted-foreground">
                  Customize the quote and achievements printed next to your portrait
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveBio} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nickname</Label>
                  <Input
                    placeholder="e.g. Alex, Lexi"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Future Ambition / Major</Label>
                  <Input
                    placeholder="e.g. Mechanical Engineering"
                    value={futureMajor}
                    onChange={(e) => setFutureMajor(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Senior Quote (Max 160 characters)</Label>
                <Textarea
                  rows={2}
                  maxLength={160}
                  value={seniorQuote}
                  onChange={(e) => setSeniorQuote(e.target.value)}
                  placeholder="Enter your favorite inspirational quote..."
                  className="text-xs"
                />
                <div className="flex justify-end text-[10px] text-muted-foreground">
                  {seniorQuote.length}/160 characters
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Extracurricular Activities &amp; Clubs</Label>
                <Input
                  placeholder="e.g. Varsity Soccer · Drama Club · Robotics Captain"
                  value={seniorActivities}
                  onChange={(e) => setSeniorActivities(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <Button type="submit" size="sm" disabled={savingBio}>
                {savingBio ? "Saving Bio..." : "Save Quote & Bio"}
              </Button>
            </form>
          </div>

          {/* Candid Photo Sharing Section */}
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b pb-4">
              <FolderHeart className="size-5 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">Share Candid Photos with Editorial Team</h2>
                <p className="text-xs text-muted-foreground">
                  Submit candid snapshots from sports games, club activities, and spirit rallies
                </p>
              </div>
            </div>

            <form onSubmit={handleCandidUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Section Category</Label>
                <Select value={candidCategory} onValueChange={setCandidCategory}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANDID_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tag Event or Team (Optional)</Label>
                <Input
                  placeholder="e.g. State Championship Rally"
                  value={candidTag}
                  onChange={(e) => setCandidTag(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Select Candid Photo</Label>
                <label className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 hover:bg-muted/40 cursor-pointer transition-colors relative group">
                  <ImageIcon className="size-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  <p className="text-xs font-semibold text-foreground">
                    {candidFile ? candidFile.name : "Click to select or drag candid photo"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    High-resolution photos will be reviewed for spread layout insertion
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
                  {isUploadingCandid ? "Uploading Photo..." : "Submit Photo to Yearbook Staff"}
                </Button>
              </div>
            </form>

            {/* Gallery of Submitted Candids */}
            <div className="pt-2 border-t space-y-3">
              <h3 className="font-display text-sm font-bold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> My Shared Photos ({studentAssets.length})
              </h3>

              {isLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : studentAssets.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center italic">
                  No candid photos shared yet. Upload sports or event memories above!
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {studentAssets.map((asset: any) => (
                    <div
                      key={asset.id}
                      className="group relative rounded-lg border border-border overflow-hidden bg-card flex flex-col"
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
                            {(asset.status || "ready").replace("_", " ")}
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
    </div>
  );
}
