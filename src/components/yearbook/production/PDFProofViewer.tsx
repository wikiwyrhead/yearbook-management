import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  MessageSquarePlus,
  CheckCircle2,
  X,
  List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';

// Note: In a real implementation, we would use react-pdf/renderer or pdf.js
// For this architecture-first Phase 4, we provide the UI framework and coordinate capture logic.

interface PDFProofViewerProps {
  yearbookId: string;
  proofUrl: string;
  initialPage?: number;
  onAddCorrection: (page: number, x: number, y: number, w?: number, h?: number) => void;
  corrections: any[];
}

export function PDFProofViewer({ yearbookId, proofUrl, initialPage = 1, onAddCorrection, corrections }: PDFProofViewerProps) {
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(100);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  const handleViewerClick = (e: React.MouseEvent) => {
    if (!isAnnotating || !viewerRef.current) return;
    
    const rect = viewerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    onAddCorrection(page, x, y);
    setIsAnnotating(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-muted/20 border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="h-12 border-b bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Input 
              className="h-8 w-12 text-center p-0" 
              value={page} 
              onChange={e => setPage(Number(e.target.value))} 
            />
            <span className="text-xs text-muted-foreground">/ 128</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant={isAnnotating ? "secondary" : "ghost"} 
            size="sm" 
            className="gap-2"
            onClick={() => setIsAnnotating(!isAnnotating)}
          >
            <MessageSquarePlus className="size-4" />
            {isAnnotating ? "Click to point" : "Add Correction"}
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(50, z - 10))}>
            <ZoomOut className="size-4" />
          </Button>
          <span className="text-xs min-w-[3rem] text-center">{zoom}%</span>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(200, z + 10))}>
            <ZoomIn className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <List className="size-4" />
                Corrections
                {corrections.length > 0 && <Badge variant="destructive" className="h-4 px-1">{corrections.length}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Page {page} Corrections</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-8rem)] mt-4 pr-4">
                <div className="space-y-4">
                  {corrections.filter(c => c.page_number === page).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No corrections for this page.</p>
                  ) : (
                    corrections.filter(c => c.page_number === page).map(c => (
                      <div key={c.id} className="plate p-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.title}</span>
                          <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                        </div>
                        <p className="text-muted-foreground text-xs">{c.description}</p>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs flex-1">View</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs">Verify</Button>
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

      {/* Viewer Area */}
      <div 
        className="flex-1 overflow-auto bg-zinc-800 p-8 flex justify-center items-start custom-scrollbar"
        onClick={handleViewerClick}
      >
        <div 
          ref={viewerRef}
          className="bg-white shadow-2xl relative transition-all duration-200"
          style={{ 
            width: `${8.5 * zoom}px`, 
            height: `${11 * zoom}px`,
            cursor: isAnnotating ? 'crosshair' : 'default'
          }}
        >
          {/* Placeholder for PDF Page content */}
          <div className="absolute inset-0 flex items-center justify-center text-zinc-300 font-display text-4xl select-none">
            PAGE {page}
          </div>

          {/* Annotations Overlay */}
          {corrections.filter(c => c.page_number === page).map(c => (
            <div 
              key={c.id}
              className="absolute group"
              style={{
                left: `${c.coordinates.x}%`,
                top: `${c.coordinates.y}%`,
                transform: 'translate(-50%, -50%)'
              }}
            >
              <div className={`size-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center ${
                c.status === 'verified' ? 'bg-green-500' : 'bg-destructive'
              }`}>
                <span className="text-[10px] text-white font-bold">{c.id.slice(0, 2).toUpperCase()}</span>
              </div>
              
              {/* Tooltip on hover */}
              <div className="absolute left-full ml-2 top-0 bg-background border p-2 rounded shadow-xl w-48 hidden group-hover:block z-50">
                <p className="font-bold text-xs">{c.title}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{c.description}</p>
              </div>
            </div>
          ))}

          {/* New Point Marker (Draft) */}
          {isAnnotating && (
            <div className="absolute inset-0 pointer-events-none border-2 border-blue-500/50" />
          )}
        </div>
      </div>

      {/* Footer / Info */}
      <div className="h-8 border-t bg-background px-4 flex items-center text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle2 className="size-3" /> Fully Synced</span>
        <Separator orientation="vertical" className="h-3 mx-3" />
        <span>Yearbook Production Build 4.0.2</span>
      </div>
    </div>
  );
}
