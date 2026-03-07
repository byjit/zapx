import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  OrganizationMember,
  OrganizationRole,
} from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";

export function OrganizationMembers({
  activeOrg,
  currentUserId,
}: {
  activeOrg: ActiveOrganization;
  currentUserId: string;
}) {
  const [members, setMembers] = useState<OrganizationMember[]>(
    activeOrg.members
  );
  const [isLoading, setIsLoading] = useState(true);
  const currentUserRole = members.find(
    (member) => member.userId === currentUserId
  )?.role;
  const canManageMembers =
    currentUserRole === "owner" || currentUserRole === "admin";

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const { data } = await authClient.organization.listMembers({
        query: {
          organizationId: activeOrg.id,
        },
      });
      setMembers(data?.members ?? []);
    } catch (error) {
      console.error("Error fetching members:", error);
      toast.error("Failed to load members");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [activeOrg.id]);

  const handleUpdateRole = async (
    memberId: string,
    newRole: OrganizationRole
  ) => {
    try {
      await authClient.organization.updateMemberRole({
        memberId,
        role: newRole,
      });
      toast.success("Role updated");
      fetchMembers();
    } catch (e) {
      toast.error("Failed to update role");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
      });
      toast.success("Member removed");
      fetchMembers();
    } catch (_e) {
      toast.error("Failed to remove member");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
        <CardDescription>
          Manage access and roles for your team members.
        </CardDescription>
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
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.user.image} />
                        <AvatarFallback>
                          {member.user.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span>{member.user.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {member.user.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      defaultValue={member.role}
                      disabled={!canManageMembers}
                      onValueChange={(val) =>
                        handleUpdateRole(member.id, val as OrganizationRole)
                      }
                    >
                      <SelectTrigger className="w-[110px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManageMembers && (
                      <Button
                        onClick={() => handleRemoveMember(member.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && (
                <TableRow>
                  <TableCell
                    className="text-center py-4 text-muted-foreground"
                    colSpan={4}
                  >
                    No members found.
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
