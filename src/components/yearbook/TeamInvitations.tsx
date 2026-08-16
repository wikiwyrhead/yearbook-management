import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, UserPlus, Clock, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { inviteUser, getInvitations } from "@/lib/yearbook.functions";

const ROLES = ["coordinator", "staff", "proofreader", "corrector", "student"];

export function TeamInvitations({ yearbookId, canManage }: { yearbookId: string; canManage: boolean }) {
  const sendInvite = useServerFn(inviteUser);
  const fetchInvites = useServerFn(getInvitations);
  const qc = useQueryClient();
  
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("staff");

  const queryKey = ["invitations", yearbookId];
  const { data: invites, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchInvites({ data: { yearbookId } })
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));

    try {
      await sendInvite({ data: { yearbookId, email, role: role as any } });
      toast.success(`Invitation sent to ${email}`);
      setOpen(false);
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!canManage && (!invites || invites.length === 0)) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Pending Invitations</h3>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Mail className="mr-2 size-4" /> Invite by Email
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a new member</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="i-email">Email Address</Label>
                  <Input id="i-email" name="email" type="email" placeholder="colleague@school.edu" required />
                  <p className="text-[10px] text-muted-foreground">
                    An invitation will be tracked. They can join once they create an account.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit">Send Invitation</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="plate divide-y">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading invitations...</div>
        ) : invites && invites.length > 0 ? (
          invites.map((invite: any) => (
            <div key={invite.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="flex-1">
                <p className="font-medium">{invite.email}</p>
                <p className="text-[10px] text-muted-foreground">
                  Invited on {new Date(invite.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{invite.role}</Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="size-3" /> {invite.status}
                </Badge>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground italic">
            No pending invitations
          </div>
        )}
      </div>
    </div>
  );
}
