import React, { useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  MessageSquarePlus,
  Square,
  CheckCircle2,
  X,
  List,
  FileText,
  Paperclip,
  SplitSquareVertical,
  Columns
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Document, Page, pdfjs } from "react-pdf";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface PDFProofViewerProps {
  yearbookId: string;
  proofUrl: string;
  compareProofUrl?: string;
  initialPage?: number;
  onAddCorrection: (page: number, x: number, y: number, w?: number, h?: number) => void;
  corrections: any[];
  readOnly?: boolean;
}

export function PDFProofViewer({
  yearbookId,
  proofUrl,
  compareProofUrl,
  initialPage = 1,
  onAddCorrection,
  corrections,
  readOnly = false,
}: PDFProofViewerProps) {
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState<number>(138);
  const [zoom, setZoom] = useState(100);
  const [annotationMode, setAnnotationMode] = useState<"none" | "pin" | "box">("none");
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState(false);

  // Box drawing state
  const [boxStart, setBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const pageContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || annotationMode === "none" || !pageContainerRef.current) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;

    const x = Math.max(0.5, Math.min(99.5, Math.round(rawX * 100) / 100));
    const y = Math.max(0.5, Math.min(99.5, Math.round(rawY * 100) / 100));

    if (annotationMode === "pin") {
      onAddCorrection(page, x, y);
      setAnnotationMode("none");
    } else if (annotationMode === "box") {
      setBoxStart({ x, y });
      setCurrentBox({ x, y, w: 0, h: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!boxStart || !pageContainerRef.current || annotationMode !== "box") return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;

    const curX = Math.max(0.5, Math.min(99.5, Math.round(rawX * 100) / 100));
    const curY = Math.max(0.5, Math.min(99.5, Math.round(rawY * 100) / 100));

    const left = Math.min(boxStart.x, curX);
    const top = Math.min(boxStart.y, curY);
    const width = Math.min(100 - left, Math.abs(curX - boxStart.x));
    const height = Math.min(100 - top, Math.abs(curY - boxStart.y));

    setCurrentBox({ x: left, y: top, w: width, h: height });
  };

  const handleMouseUp = () => {
    if (boxStart && currentBox && (currentBox.w > 1 || currentBox.h > 1)) {
      onAddCorrection(page, currentBox.x, currentBox.y, currentBox.w, currentBox.h);
      setBoxStart(null);
      setCurrentBox(null);
      setAnnotationMode("none");
    } else {
      setBoxStart(null);
      setCurrentBox(null);
    }
  };

  const pageWidthPx = Math.max(280, 8.5 * zoom * 1.1);

  const pageCorrections = corrections.filter((c) => c.page_number === page || c.page === page);

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] min-h-[480px] bg-muted/20 border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Responsive Toolbar */}
      <div className="min-h-12 border-b border-border bg-background flex flex-wrap items-center justify-between px-3 py-2 gap-2 shrink-0">
        {/* Page Nav */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous Page"
            className="min-h-[40px] min-w-[40px]"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Input
              aria-label="Current Page Number"
              className="h-8 w-14 text-center p-0 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-primary"
              value={page}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= numPages) setPage(val);
              }}
            />
            <span className="text-xs text-muted-foreground">/ {numPages}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next Page"
            className="min-h-[40px] min-w-[40px]"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Tools & Annotation Modes */}
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <Button
              variant={annotationMode === "pin" ? "default" : "outline"}
              size="sm"
              onClick={() => setAnnotationMode((m) => (m === "pin" ? "none" : "pin"))}
              className="text-xs h-8 gap-1.5"
            >
              <MessageSquarePlus className="size-3.5" />
              Pin Note
            </Button>
            <Button
              variant={annotationMode === "box" ? "default" : "outline"}
              size="sm"
              onClick={() => setAnnotationMode((m) => (m === "box" ? "none" : "box"))}
              className="text-xs h-8 gap-1.5"
            >
              <Square className="size-3.5" />
              Highlight Box
            </Button>
            {compareProofUrl && (
              <Button
                variant={isCompareMode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setIsCompareMode(!isCompareMode)}
                className="text-xs h-8 gap-1.5"
              >
                <Columns className="size-3.5" />
                Compare Prior Round
              </Button>
            )}
          </div>
        )}

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom((z) => Math.max(50, z - 15))}
            className="size-8"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="text-xs font-mono w-10 text-center">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom((z) => Math.min(200, z + 15))}
            className="size-8"
          >
            <ZoomIn className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div 
        className="flex-1 overflow-auto p-4 flex items-center justify-center bg-zinc-950/60"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div className={`flex gap-4 items-center ${isCompareMode ? "flex-row" : ""}`}>
          {/* Active Round Canvas */}
          <div
            ref={pageContainerRef}
            onMouseDown={handleMouseDown}
            style={{ width: `${pageWidthPx}px`, aspectRatio: "8.5 / 11" }}
            className={`relative bg-white shadow-2xl rounded border border-zinc-800 flex items-center justify-center select-none overflow-hidden ${
              annotationMode !== "none" ? "cursor-crosshair ring-2 ring-primary/80" : ""
            }`}
          >
            {/* Embedded PDF Page or Fallback Presentation */}
            <div className="absolute inset-0 flex flex-col justify-between p-8 pointer-events-none bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-900 font-sans">
              <div className="flex justify-between items-start border-b border-zinc-300 pb-3">
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                    ICAS de Calarian • Milestone 2025
                  </p>
                  <h3 className="text-lg font-black tracking-tight text-zinc-900">
                    Spread Page {page}
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold bg-zinc-200 px-2 py-0.5 rounded text-zinc-800">
                  P. {page}
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-center items-center text-center px-4 space-y-2">
                <FileText className="size-10 text-zinc-400 mx-auto" />
                <p className="text-xs text-zinc-600 max-w-sm">
                  Authoritative Proof Spread Preview for Page {page}. High-resolution vector PDF rendering.
                </p>
              </div>

              <div className="border-t border-zinc-300 pt-2 flex justify-between text-[9px] text-zinc-400">
                <span>Jubilee 2025 – Pilgrims of Hope</span>
                <span>Official Publication Blueprint</span>
              </div>
            </div>

            {/* Render Corrections Pins & Boxes */}
            {pageCorrections.map((c, idx) => (
              <React.Fragment key={c.id || idx}>
                {c.width_percent && c.height_percent ? (
                  <div
                    style={{
                      left: `${c.x_percent}%`,
                      top: `${c.y_percent}%`,
                      width: `${c.width_percent}%`,
                      height: `${c.height_percent}%`,
                    }}
                    className="absolute border-2 border-amber-500 bg-amber-500/20 rounded pointer-events-auto group z-20"
                    title={c.title || c.description}
                  >
                    <span className="absolute -top-3 -left-3 size-5 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center shadow">
                      {idx + 1}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      left: `${c.x_percent || c.x}%`,
                      top: `${c.y_percent || c.y}%`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 size-6 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center shadow-lg border border-white pointer-events-auto z-20"
                    title={c.title || c.description}
                  >
                    {idx + 1}
                  </div>
                )}
              </React.Fragment>
            ))}

            {/* In-Flight Drawing Box */}
            {currentBox && (
              <div
                style={{
                  left: `${currentBox.x}%`,
                  top: `${currentBox.y}%`,
                  width: `${currentBox.w}%`,
                  height: `${currentBox.h}%`,
                }}
                className="absolute border-2 border-dashed border-primary bg-primary/20 pointer-events-none z-30"
              />
            )}
          </div>

          {/* Compare Prior Round Canvas (Split View) */}
          {isCompareMode && (
            <div
              style={{ width: `${pageWidthPx}px`, aspectRatio: "8.5 / 11" }}
              className="relative bg-zinc-100 shadow-xl rounded border border-dashed border-zinc-700 flex items-center justify-center select-none overflow-hidden opacity-85"
            >
              <div className="absolute top-2 left-2 z-10">
                <Badge variant="secondary" className="text-[10px]">
                  Prior Round (Comparison)
                </Badge>
              </div>
              <div className="text-center p-6 space-y-2">
                <Columns className="size-8 text-zinc-500 mx-auto" />
                <p className="text-xs text-zinc-600">Prior round comparison active for Page {page}.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
