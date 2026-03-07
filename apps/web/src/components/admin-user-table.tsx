import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RouterOutputs } from "@turborepo-boilerplate/api";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";

type AdminListUsersOutput = RouterOutputs["admin"]["listUsers"];
type AdminUser = AdminListUsersOutput["users"][number];

interface UserTableProps {
  users: AdminUser[];
  currentUserId?: string;
  onUserRemoved?: () => void;
}

export function UserTable({
  users,
  currentUserId,
  onUserRemoved,
}: UserTableProps) {
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [userToImpersonate, setUserToImpersonate] = useState<AdminUser | null>(
    null
  );
  const queryClient = useQueryClient();

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Use the Better Auth client directly for impersonation
      const result = await authClient.admin.impersonateUser({
        userId,
      });
      return result;
    },
    onSuccess: () => {
      toast.success("Impersonating user successfully");
      // Reload the page to update session
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    },
    onError: (error) => {
      toast.error("Failed to impersonate user: " + error.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Use the Better Auth client directly for removal
      const result = await authClient.admin.removeUser({
        userId,
      });
      return result;
    },
    onSuccess: () => {
      toast.success("User removed successfully");
      setUserToDelete(null);
      queryClient.invalidateQueries();
      onUserRemoved?.();
    },
    onError: (error) => {
      toast.error(`Failed to remove user: ${error.message}`);
      setUserToDelete(null);
    },
  });

  const handleImpersonate = (user: AdminUser) => {
    setUserToImpersonate(user);
  };

  const confirmImpersonate = () => {
    if (userToImpersonate) {
      impersonateMutation.mutate(userToImpersonate.id);
      setUserToImpersonate(null);
    }
  };

  const handleRemove = (user: AdminUser) => {
    setUserToDelete(user);
  };

  const confirmRemove = () => {
    if (userToDelete) {
      removeMutation.mutate(userToDelete.id);
    }
  };

  const formatDate = (value: string | Date) =>
    new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.name || "—"}
                    {user.id === currentUserId && (
                      <Badge className="ml-2" variant="secondary">
                        You
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{user.email}</span>
                      {!user.emailVerified && (
                        <Badge className="mt-1 w-fit text-xs" variant="outline">
                          Not verified
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.banned ? (
                      <Badge variant="destructive">Banned</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        disabled={
                          user.id === currentUserId ||
                          impersonateMutation.isPending
                        }
                        onClick={() => handleImpersonate(user)}
                        size="sm"
                        variant="outline"
                      >
                        Impersonate
                      </Button>
                      <Button
                        disabled={
                          user.id === currentUserId || removeMutation.isPending
                        }
                        onClick={() => handleRemove(user)}
                        size="sm"
                        variant="destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Impersonate Confirmation Dialog */}
      {[
        {
          key: "impersonate",
          open: Boolean(userToImpersonate),
          onOpenChange: () => setUserToImpersonate(null),
          title: "Impersonate User",
          description: () => (
            <>
              Are you sure you want to impersonate{" "}
              {userToImpersonate?.name || userToImpersonate?.email}? You will be
              logged in as this user and redirected to the dashboard.
            </>
          ),
          actionLabel: "Impersonate",
          onAction: confirmImpersonate,
          actionClassName: undefined,
        },
        {
          key: "remove",
          open: Boolean(userToDelete),
          onOpenChange: () => setUserToDelete(null),
          title: "Remove User",
          description: () => (
            <>
              Are you sure you want to permanently remove{" "}
              {userToDelete?.name || userToDelete?.email}? This action cannot be
              undone. All user data will be deleted.
            </>
          ),
          actionLabel: "Remove",
          onAction: confirmRemove,
          actionClassName:
            "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        },
      ].map((dialog) => (
        <AlertDialog
          key={dialog.key}
          onOpenChange={dialog.onOpenChange as (open: boolean) => void}
          open={dialog.open}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {dialog.description()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={dialog.actionClassName}
                onClick={dialog.onAction}
              >
                {dialog.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </>
  );
}
