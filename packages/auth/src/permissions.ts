/**
 * Shared organization role literals used across the app.
 *
 * Better Auth already provides the default organization role permissions for
 * `owner`, `admin`, and `member`, so we keep this file limited to shared role
 * names instead of re-implementing the built-in access control rules.
 */
export const organizationRoles = ["owner", "admin", "member"] as const;

export type OrganizationRole = (typeof organizationRoles)[number];
