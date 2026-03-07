import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { OrganizationSettings } from "@/components/blocks/settings/organization-settings";
import { UserProfileSettings } from "@/components/blocks/settings/user-profile-settings";
import Loader from "@/components/loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsPage,
  head: () =>
    buildSeoHead({
      title: "Settings | Turborepo Boilerplate",
      description: "Manage your account and organization settings",
      path: "/settings",
      noIndex: true,
    }),
});

function SettingsPage() {
  const { data: session, isPending: isSessionLoading } =
    authClient.useSession();
  const { data: activeOrg, isPending: isActiveOrgLoading } =
    authClient.useActiveOrganization();
  const { data: organizations, isPending: isOrgsLoading } =
    authClient.useListOrganizations();

  const [activeTab, setActiveTab] = useState("user");

  if (isSessionLoading || isActiveOrgLoading || isOrgsLoading) {
    return <Loader />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your account and organization preferences.
          </p>
        </div>
      </div>

      <Tabs
        className="space-y-6"
        defaultValue="user"
        onValueChange={setActiveTab}
        value={activeTab}
      >
        <TabsList>
          <TabsTrigger value="user">User Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-6" value="user">
          <UserProfileSettings session={session} />
        </TabsContent>

        <TabsContent className="space-y-6" value="organization">
          <OrganizationSettings
            activeOrg={activeOrg}
            currentUserId={session.user.id}
            organizations={organizations || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
