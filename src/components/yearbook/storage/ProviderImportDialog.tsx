import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Cloud, 
  Database, 
  Download, 
  ExternalLink,
  Shield,
  User
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ProviderBrowser } from "./ProviderBrowser";
import { getOrganizationStorage, getMyStorageConnections } from "@/lib/storage.functions";

export type ProviderImportDialogProps = {
  yearbookId: string;
  studentId?: string;
  onDone: () => void;
};

export function ProviderImportDialog({
  yearbookId,
  studentId,
  onDone
}: ProviderImportDialogProps) {
  const [open, setOpen] = useState(false);
  const fetchOrgStorage = useServerFn(getOrganizationStorage);
  const fetchMyStorage = useServerFn(getMyStorageConnections);

  const { data: orgConnections } = useQuery({
    queryKey: ["organization-storage"],
    queryFn: () => fetchOrgStorage(),
    enabled: open,
  });

  const { data: myConnections } = useQuery({
    queryKey: ["my-storage"],
    queryFn: () => fetchMyStorage(),
    enabled: open,
  });

  const activeOrgConn = orgConnections?.find(c => c.is_default);
  const activeMyConn = myConnections?.find(c => c.status === "connected");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="size-4" /> Import from Cloud
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Cloud className="size-6 text-accent" />
            Import External Assets
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="organization" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 border-b">
            <TabsList className="mt-2">
              <TabsTrigger value="organization" className="gap-2">
                <Shield className="size-3.5" /> Organization Storage
              </TabsTrigger>
              <TabsTrigger value="member" className="gap-2">
                <User className="size-3.5" /> My Connections
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="organization" className="flex-1 flex flex-col p-6 overflow-hidden mt-0">
            {activeOrgConn ? (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold capitalize">{activeOrgConn.provider.replace('_', ' ')}</h4>
                    <p className="text-xs text-muted-foreground">Authoritative organization storage</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-green-500/5 text-green-600 border-green-200 uppercase font-bold">
                    CONNECTED
                  </Badge>
                </div>
                <ProviderBrowser 
                  yearbookId={yearbookId}
                  provider={activeOrgConn.provider as any}
                  scope="organization"
                  studentId={studentId || undefined}
                  onImportComplete={() => {
                    onDone();
                    setOpen(false);
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-muted/20 rounded-lg border-dashed border-2">
                <Database className="size-12 text-muted-foreground/30 mb-4" />
                <h4 className="font-display text-lg">No Active Org Storage</h4>
                <p className="text-sm text-muted-foreground max-w-[300px] mt-2 mb-6">
                  Coordinators need to connect an authoritative Google Drive or Box account in the Storage tab.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="member" className="flex-1 flex flex-col p-6 overflow-hidden mt-0">
            {activeMyConn ? (
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold capitalize">{activeMyConn.provider.replace('_', ' ')}</h4>
                    <p className="text-xs text-muted-foreground">Personal import source</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-green-500/5 text-green-600 border-green-200 uppercase font-bold">
                    CONNECTED
                  </Badge>
                </div>
                <ProviderBrowser 
                  yearbookId={yearbookId}
                  provider={activeMyConn.provider as any}
                  scope="member"
                  studentId={studentId || undefined}
                  onImportComplete={() => {
                    onDone();
                    setOpen(false);
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-muted/20 rounded-lg border-dashed border-2">
                <User className="size-12 text-muted-foreground/30 mb-4" />
                <h4 className="font-display text-lg">No Member Connections</h4>
                <p className="text-sm text-muted-foreground max-w-[300px] mt-2 mb-6">
                  Connect your personal Google Drive in the Storage tab to import your own photos.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
