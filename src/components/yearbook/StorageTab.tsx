import { StorageSettings } from "./storage/StorageSettings";
import { MemberConnections } from "./storage/MemberConnections";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Shield, User, Layout } from "lucide-react";

export type StorageTabProps = {
  yearbookId: string;
  centerId?: string;
  canManage: boolean;
};

export function StorageTab({ yearbookId, centerId, canManage }: StorageTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl">External Storage</h2>
        <p className="text-sm text-muted-foreground">
          Connect Google Drive or Box to import assets and sync designs.
        </p>
      </div>

      <Tabs defaultValue={canManage ? "center" : "member"} className="w-full">
        <TabsList className="grid w-full max-w-[400px] grid-cols-2">
          <TabsTrigger value="center" disabled={!canManage} className="gap-2">
            <Shield className="size-3.5" /> Center Storage
          </TabsTrigger>
          <TabsTrigger value="member" className="gap-2">
            <User className="size-3.5" /> My Connections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="center" className="mt-6 space-y-6">
          <div className="plate p-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="size-5 text-accent" />
              <h3 className="font-display text-lg">Center Authoritative Storage</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-6">
              Super Admins and Center Coordinators can manage the Google Drive connection for this
              Center.
            </p>
            <StorageSettings centerId={centerId} yearbookId={yearbookId} />
          </div>
        </TabsContent>

        <TabsContent value="member" className="mt-6">
          <div className="plate p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="size-5 text-accent" />
              <h3 className="font-display text-lg">My Import Sources</h3>
            </div>
            <MemberConnections />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
