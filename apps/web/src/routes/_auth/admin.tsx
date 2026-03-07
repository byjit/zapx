import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { UserTable } from "@/components/admin-user-table";
import Loader from "@/components/loader";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { buildSeoHead } from "@/lib/seo";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/admin")({
  component: RouteComponent,
  head: () =>
    buildSeoHead({
      title: "Admin Panel | Turborepo Boilerplate",
      description: "Manage users and system settings",
      path: "/admin",
      noIndex: true,
    }),
});

function RouteComponent() {
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const {
    data: usersData,
    isLoading,
    refetch,
  } = trpc.admin.listUsers.useQuery({
    limit,
    offset,
    searchValue: searchValue || undefined,
    searchField: "name",
    searchOperator: "contains",
    sortBy: "createdAt",
    sortDirection: "desc",
  });

  const { data: session } = authClient.useSession();

  const handleSearch = () => {
    setSearchValue(searchInput);
    setOffset(0); // Reset to first page on search
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchValue("");
    setOffset(0);
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setOffset(0);
  };

  const handleUserRemoved = () => {
    refetch();
  };

  // Check if current user has impersonation active
  const isImpersonating = session?.session?.impersonatedBy;

  const handleStopImpersonating = async () => {
    try {
      await authClient.admin.stopImpersonating();
      toast.success("Stopped impersonating user");
      setTimeout(() => {
        window.location.href = "/admin";
      }, 1000);
    } catch (error) {
      toast.error("Failed to stop impersonating");
      console.error("Error stopping impersonation:", error);
    }
  };

  if (!session) {
    return <Loader />;
  }

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Admin Panel</h1>
          <p className="text-muted-foreground">
            Manage users and system settings
          </p>
        </div>
        {isImpersonating && (
          <Button onClick={handleStopImpersonating} variant="destructive">
            Stop Impersonating
          </Button>
        )}
      </div>

      {isImpersonating && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline">Impersonating</Badge>
              Active Impersonation Session
            </CardTitle>
            <CardDescription>
              You are currently viewing the system as{" "}
              <strong>{session.user.name || session.user.email}</strong>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            View and manage all users in the system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <Input
              className="max-w-sm"
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="Search users by name..."
              value={searchInput}
            />
            <Button disabled={isLoading} onClick={handleSearch}>
              Search
            </Button>
            {searchValue && (
              <Button onClick={handleClearSearch} variant="outline">
                Clear
              </Button>
            )}
          </div>

          {/* Users Stats */}
          {usersData && (
            <div className="flex items-center gap-4 text-muted-foreground text-sm">
              <span>
                Showing {Math.min(offset + 1, usersData.total)} to{" "}
                {Math.min(offset + limit, usersData.total)} of {usersData.total}{" "}
                users
              </span>
              {searchValue && (
                <Badge variant="secondary">Filtered by: "{searchValue}"</Badge>
              )}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader />
            </div>
          )}

          {/* User Table */}
          {!isLoading && usersData && (
            <>
              <UserTable
                currentUserId={session.user.id}
                onUserRemoved={handleUserRemoved}
                users={usersData.users}
              />

              {/* Pagination */}
              {usersData.total > 0 && (
                <PaginationControls
                  limit={limit}
                  offset={offset}
                  onLimitChange={handleLimitChange}
                  onPageChange={handlePageChange}
                  total={usersData.total}
                />
              )}
            </>
          )}

          {/* Empty State */}
          {!isLoading && usersData && usersData.users.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              No users found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
