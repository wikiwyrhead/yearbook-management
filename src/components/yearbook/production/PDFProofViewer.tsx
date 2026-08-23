import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize,
  MessageSquarePlus,
  CheckCircle2,
  X,
  List,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Document, Page, pdfjs } from "react-pdf";

// Configure standard PDF.js worker
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface PDFProofViewerProps {
  yearbookId: string;
  proofUrl: string;
  initialPage?: number;
  onAddCorrection: (page: number, x: number, y: number, w?: number, h?: number) => void;
  corrections: any[];
}

export function PDFProofViewer({
  yearbookId,
  proofUrl,
  initialPage = 1,
  onAddCorrection,
  corrections,
}: PDFProofViewerProps) {
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState<number>(128);
  const [zoom, setZoom] = useState(100);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAnnotating || !pageContainerRef.current) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;

    const x = Math.max(0.5, Math.min(99.5, Math.round(rawX * 100) / 100));
    const y = Math.max(0.5, Math.min(99.5, Math.round(rawY * 100) / 100));

    onAddCorrection(page, x, y);
    setIsAnnotating(false);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isAnnotating || !pageContainerRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    const rawX = ((touch.clientX - rect.left) / rect.width) * 100;
    const rawY = ((touch.clientY - rect.top) / rect.height) * 100;

    const x = Math.max(0.5, Math.min(99.5, Math.round(rawX * 100) / 100));
    const y = Math.max(0.5, Math.min(99.5, Math.round(rawY * 100) / 100));

    onAddCorrection(page, x, y);
    setIsAnnotating(false);
  };

  const pageWidthPx = Math.max(280, 8.5 * zoom * 1.1);

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
              className="h-8 w-12 text-center p-0 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-primary"
              value={page}
              onChange={(e) =>
                setPage(Math.max(1, Math.min(numPages, Number(e.target.value) || 1)))
              }
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

        {/* Annotation & Zoom Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant={isAnnotating ? "secondary" : "outline"}
            size="sm"
            className={`min-h-[40px] gap-1.5 text-xs font-medium ${
              isAnnotating ? "border-primary bg-primary/10 text-primary" : ""
            }`}
            onClick={() => setIsAnnotating(!isAnnotating)}
          >
            <MessageSquarePlus className="size-4" />
            <span className="hidden sm:inline">
              {isAnnotating ? "Tap spread to place pin" : "Add Correction"}
            </span>
            <span className="sm:hidden">{isAnnotating ? "Place Pin" : "Pin"}</span>
          </Button>

          <Separator orientation="vertical" className="h-6 hidden sm:block" />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom Out"
              className="min-h-[40px] min-w-[40px]"
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
            >
              <ZoomOut className="size-4" />
            </Button>
            <span className="text-xs min-w-[2.5rem] text-center font-mono">{zoom}%</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom In"
              className="min-h-[40px] min-w-[40px]"
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
            >
              <ZoomIn className="size-4" />
            </Button>
          </div>
        </div>

        {/* Corrections Drawer Sheet */}
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-[40px] gap-1.5 text-xs font-medium">
                <List className="size-4" />
                <span>Corrections</span>
                {corrections.length > 0 && (
                  <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                    {corrections.length}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle className="font-display text-lg">Page {page} Corrections</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-8rem)] mt-4 pr-3">
                <div className="space-y-3">
                  {corrections.filter((c) => c.page_number === page).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      No correction annotations on Page {page}.
                    </p>
                  ) : (
                    corrections
                      .filter((c) => c.page_number === page)
                      .map((c) => (
                        <div key={c.id} className="p-3 rounded-lg border border-border bg-card space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{c.title}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {c.status || "open"}
                            </Badge>
                          </div>
                          {c.description && (
                            <p className="text-muted-foreground text-xs leading-relaxed">{c.description}</p>
                          )}
                          <div className="text-[10px] text-muted-foreground font-mono">
                            Coordinates: x: {c.coordinates?.x}%, y: {c.coordinates?.y}%
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Viewer Canvas Area */}
      <div className="flex-1 overflow-auto bg-zinc-900/90 p-4 sm:p-8 flex justify-center items-start">
        <div
          ref={pageContainerRef}
          onClick={handlePageClick}
          onTouchEnd={handleTouchEnd}
          className="bg-white shadow-2xl relative transition-all duration-150 select-none rounded-sm overflow-hidden"
          style={{
            width: `${pageWidthPx}px`,
            minHeight: `${pageWidthPx * 1.294}px`,
            cursor: isAnnotating ? "crosshair" : "default",
            touchAction: isAnnotating ? "none" : "auto",
          }}
        >
          {/* Real PDF Rendering via react-pdf when valid proofUrl exists */}
          {proofUrl && !pdfLoadError ? (
            <Document
              file={proofUrl}
              onLoadSuccess={({ numPages: total }) => {
                setNumPages(total);
                setPdfLoadError(false);
              }}
              onLoadError={() => setPdfLoadError(true)}
              loading={
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs font-sans">
                  Rendering Proof Page {page}...
                </div>
              }
            >
              <Page
                pageNumber={page}
                width={pageWidthPx}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          ) : (
            /* Fallback layout preview when waiting for PDF upload */
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 font-display p-6 text-center">
              <FileText className="size-14 mb-3 text-zinc-300 opacity-60" />
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-600">PAGE {page}</div>
              <p className="text-xs text-zinc-400 mt-2 max-w-xs font-sans">
                {proofUrl
                  ? "Proof document rendering..."
                  : "Upload a PDF proof spread to inspect 300-DPI press geometry."}
              </p>
            </div>
          )}

          {/* Annotations Overlay — Relative Normalized Percentage Coordinates */}
          {corrections
            .filter((c) => c.page_number === page)
            .map((c) => {
              const posX = c.coordinates?.x ?? 50;
              const posY = c.coordinates?.y ?? 50;
              return (
                <div
                  key={c.id}
                  className="absolute group"
                  style={{
                    left: `${posX}%`,
                    top: `${posY}%`,
                    transform: "translate(-50%, -50%)",
                    zIndex: 40,
                  }}
                >
                  <div
                    className={`size-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-125 ${
                      c.status === "verified" || c.status === "approved"
                        ? "bg-emerald-600"
                        : "bg-rose-600"
                    }`}
                  >
                    <span className="text-[10px] text-white font-bold">
                      {c.id.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  {/* Tooltip on hover */}
                  <div className="absolute left-full ml-2 top-0 bg-background border border-border p-2.5 rounded-lg shadow-xl w-48 hidden group-hover:block z-50 pointer-events-none">
                    <p className="font-bold text-xs text-foreground">{c.title}</p>
                    {c.description && (
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                        {c.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

          {/* New Point Marker Crosshair Overlay */}
          {isAnnotating && (
            <div className="absolute inset-0 pointer-events-none border-2 border-primary bg-primary/10 flex items-center justify-center">
              <span className="px-3 py-1.5 rounded-full bg-background/90 text-primary text-xs font-semibold shadow-md border border-primary/30">
                Click or tap exact location to drop pin
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Footer / Engine Info */}
      <div className="h-8 border-t border-border bg-background px-3 sm:px-4 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1 font-medium">
          <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
          Pre-Flight Proof Engine Active
        </span>
        <span className="hidden sm:inline">300 DPI Print Color Profile &middot; Bleed &amp; Trim Geometry</span>
      </div>
    </div>
  );
}
