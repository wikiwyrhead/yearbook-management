import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { 
  FileCheck, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Lock, 
  Unlock,
  ChevronRight,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { getCorrections, approvePage, lockYearbook, unlockYearbook } from '@/lib/yearbook.functions';
import { getReadinessReport } from '@/lib/production.functions';

interface ProofreadingCenterProps {
  yearbookId: string;
  canManage: boolean;
  onViewProof: (proofId: string, pageId?: string) => void;
}

export function ProofreadingCenter({ yearbookId, canManage, onViewProof }: ProofreadingCenterProps) {
  const qc = useQueryClient();
  const fetchReport = useServerFn(getReadinessReport);
  const fetchCorrections = useServerFn(getCorrections);
  const doLock = useServerFn(lockYearbook);
  const doUnlock = useServerFn(unlockYearbook);

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['readiness', yearbookId],
    queryFn: () => fetchReport({ data: { yearbookId } })
  });

  const { data: corrections } = useQuery({
    queryKey: ['corrections', yearbookId],
    queryFn: () => fetchCorrections({ data: { yearbookId } })
  });

  const mLock = useMutation({
    mutationFn: (notes?: string) => doLock({ data: { yearbookId, proofId: report?.lockDetails?.proof_id || 'latest', notes } }),
    onSuccess: () => {
      toast.success("Yearbook locked for production");
      qc.invalidateQueries({ queryKey: ['readiness', yearbookId] });
    }
  });

  const mUnlock = useMutation({
    mutationFn: (reason: string) => doUnlock({ data: { yearbookId, proofId: report?.lockDetails?.proof_id || 'latest', reason } }),
    onSuccess: () => {
      toast.success("Yearbook unlocked for revisions");
      qc.invalidateQueries({ queryKey: ['readiness', yearbookId] });
    }
  });

  if (reportLoading) return <div className="p-8 text-center animate-pulse">Analyzing production readiness...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="plate p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileCheck className="size-4" /> Page Completion
            </h3>
            <p className="text-2xl font-display mt-1">{report?.completePages} / {report?.totalPages}</p>
          </div>
          <Progress value={(report?.completePages / report?.totalPages) * 100} className="mt-4 h-1.5" />
        </div>

        <div className="plate p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="size-4" /> Open Corrections
            </h3>
            <p className="text-2xl font-display mt-1 text-destructive">{report?.openCorrections}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Requiring attention before production</p>
        </div>

        <div className="plate p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="size-4" /> Final Status
            </h3>
            <div className="mt-1">
              {report?.isLocked ? (
                <Badge className="bg-green-600 hover:bg-green-700">LOCKED FOR PRODUCTION</Badge>
              ) : report?.ready ? (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">READY TO LOCK</Badge>
              ) : (
                <Badge variant="outline">IN PROGRESS</Badge>
              )}
            </div>
          </div>
          {canManage && (
            <div className="mt-4">
              {report?.isLocked ? (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full gap-2"
                  onClick={() => {
                    const reason = window.prompt("Reason for unlocking?");
                    if (reason) mUnlock.mutate(reason);
                  }}
                >
                  <Unlock className="size-4" /> Unlock for Revision
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  className="w-full gap-2" 
                  disabled={!report?.ready}
                  onClick={() => mLock.mutate()}
                >
                  <Lock className="size-4" /> Lock Production
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="plate overflow-hidden">
        <div className="bg-muted/50 p-3 border-b flex items-center justify-between">
          <h3 className="font-medium text-sm">Recent Activity & Corrections</h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs">View All Activity</Button>
        </div>
        <div className="divide-y max-h-[400px] overflow-y-auto">
          {corrections?.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No corrections reported yet.</div>
          ) : (
            corrections?.slice(0, 10).map((c: any) => (
              <div key={c.id} className="p-4 flex items-start gap-4 hover:bg-muted/30 transition-colors group">
                <div className="mt-1">
                  {c.status === 'resolved' ? <CheckCircle className="size-4 text-green-500" /> : 
                   c.status === 'open' ? <AlertTriangle className="size-4 text-destructive" /> : 
                   <Clock className="size-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{c.title}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">{c.status}</Badge>
                    <Badge variant="secondary" className="text-[10px]">Page {c.page_number || '?'}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.description}</p>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="opacity-0 group-hover:opacity-100 h-8"
                  onClick={() => onViewProof(c.proof_id, c.page_id)}
                >
                  <Eye className="size-4 mr-1" /> Inspect
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
