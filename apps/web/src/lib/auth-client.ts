import { polarClient } from "@polar-sh/better-auth";
import type { auth, OrganizationRole } from "@turborepo-boilerplate/auth";
import {
  adminClient,
  inferAdditionalFields,
  inferOrgAdditionalFields,
  multiSessionClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "@/env";

export const authClient = createAuthClient({
  baseURL: env.SERVER_URL,
  plugins: [
    polarClient(),
    organizationClient({
      schema: inferOrgAdditionalFields<typeof auth>(),
    }),
    adminClient(),
    multiSessionClient(),
    inferAdditionalFields<typeof auth>(),
  ],
});

type ActiveOrganizationHookResult = ReturnType<
  typeof authClient.useActiveOrganization
>;
type ListOrganizationsHookResult = ReturnType<
  typeof authClient.useListOrganizations
>;

export type ActiveOrganization = NonNullable<
  ActiveOrganizationHookResult["data"]
>;
export type OrganizationList = NonNullable<ListOrganizationsHookResult["data"]>;
export type OrganizationSummary = OrganizationList[number];
export type OrganizationMember = ActiveOrganization["members"][number];
export type OrganizationInvitation = ActiveOrganization["invitations"][number];
export type { OrganizationRole };
