import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import type { ActiveOrganization, OrganizationList } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { OrganizationInvites } from "./organization-invites";
import { OrganizationMembers } from "./organization-members";

export function OrganizationSettings({
  activeOrg,
  currentUserId,
  organizations,
}: {
  activeOrg: ActiveOrganization | null | undefined;
  currentUserId: string;
  organizations: OrganizationList;
}) {
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");

  const handleCreateOrg = async () => {
    if (!(newOrgName && newOrgSlug)) {
      toast.error("Please fill in all fields");
      return;
    }
    setIsCreatingOrg(true);
    try {
      await authClient.organization.create({
        name: newOrgName,
        slug: newOrgSlug,
      });
      toast.success("Organization created successfully");
      setNewOrgName("");
      setNewOrgSlug("");
      window.location.reload();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      const isSlugTaken =
        msg.toLowerCase().includes("slug") ||
        msg.toLowerCase().includes("unique") ||
        msg.toLowerCase().includes("duplicate");
      toast.error(
        isSlugTaken
          ? "This slug is already taken. Please choose another."
          : msg || "Failed to create organization"
      );
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleSwitchOrg = async (orgId: string) => {
    try {
      await authClient.organization.setActive({
        organizationId: orgId,
      });
      toast.success("Switched organization");
      window.location.reload();
    } catch (_error) {
      toast.error("Failed to switch organization");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Active Organization</CardTitle>
          <CardDescription>
            Select which organization you are currently managing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <Label>Switch Organization</Label>
            <Select onValueChange={handleSwitchOrg} value={activeOrg?.id || ""}>
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations?.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create New Organization
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Organization</DialogTitle>
                <DialogDescription>
                  Create a new organization to collaborate with your team.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    onChange={(e) => {
                      setNewOrgName(e.target.value);
                      setNewOrgSlug(
                        e.target.value.toLowerCase().replace(/\s+/g, "-")
                      );
                    }}
                    placeholder="Acme Corp"
                    value={newOrgName}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="orgSlug">Slug</Label>
                  <Input
                    id="orgSlug"
                    onChange={(e) => setNewOrgSlug(e.target.value)}
                    placeholder="acme-corp"
                    value={newOrgSlug}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button disabled={isCreatingOrg} onClick={handleCreateOrg}>
                  {isCreatingOrg && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Organization
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {activeOrg ? (
        <>
          <OrganizationMembers
            activeOrg={activeOrg}
            currentUserId={currentUserId}
          />
          <OrganizationInvites activeOrg={activeOrg} />
        </>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You do not have any active organization selected. Please create one
            or switch to an existing one.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
