import { Loader2, Mail, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ActiveOrganization,
  OrganizationInvitation,
  OrganizationRole,
} from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";

export function OrganizationInvites({
  activeOrg,
}: {
  activeOrg: ActiveOrganization;
}) {
  const [invites, setInvites] = useState<OrganizationInvitation[]>(
    activeOrg.invitations
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("member");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const fetchInvites = async () => {
    setIsLoading(true);
    try {
      const { data } = await authClient.organization.listInvitations({
        query: {
          organizationId: activeOrg.id,
        },
      });
      setInvites(data || []);
    } catch (_error) {
      // Squelch error if listInvitations fails (e.g. permission denied)
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, [activeOrg.id]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setIsInviting(true);
    try {
      await authClient.organization.inviteMember({
        email: inviteEmail,
        role: inviteRole,
        organizationId: activeOrg.id,
      });
      toast.success("Invitation sent");
      setInviteEmail("");
      setIsInviteDialogOpen(false);
      fetchInvites();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send invitation";
      toast.error(message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleCancelInvite = async (invitationId: string) => {
    try {
      await authClient.organization.cancelInvitation({
        invitationId,
      });
      toast.success("Invitation cancelled");
      fetchInvites();
    } catch (_e) {
      toast.error("Failed to cancel invitation");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>
            Manage pending invitations to your organization.
          </CardDescription>
        </div>
        <Dialog onOpenChange={setIsInviteDialogOpen} open={isInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Mail className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New Member</DialogTitle>
              <DialogDescription>
                Send an email invitation to join your organization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label>Email Address</Label>
                <Input
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  onValueChange={(value) =>
                    setInviteRole(value as OrganizationRole)
                  }
                  value={inviteRole}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={isInviting} onClick={handleInvite}>
                {isInviting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell className="font-medium">{invite.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{invite.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invite.status === "pending" ? "secondary" : "default"
                      }
                    >
                      {invite.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(invite.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      onClick={() => handleCancelInvite(invite.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {invites.length === 0 && (
                <TableRow>
                  <TableCell
                    className="text-center py-4 text-muted-foreground"
                    colSpan={5}
                  >
                    No pending invitations.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
