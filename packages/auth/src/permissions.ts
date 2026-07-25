/**
 * Shared role literals and the single admin predicate used across the app.
 *
 * Better Auth already provides the default organization role permissions for
 * `owner`, `admin`, and `member`, so we keep this file limited to shared role
 * names instead of re-implementing the built-in access control rules.
 *
 * Kept dependency-free (no Better Auth imports) so the browser bundle can use
 * `isAdminUser` for UI gating without pulling in the server auth config.
 */
import { SYSTEM_ADMIN_ID } from "./constant";

export const organizationRoles = ["owner", "admin", "member"] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

/** Role that grants platform-admin access, mirroring the Better Auth default. */
export const PLATFORM_ADMIN_ROLE = "admin";

type RoleBearingUser = {
  id?: string | null;
  role?: string | null;
};

/**
 * Whether a session user is a platform admin.
 *
 * Mirrors the Better Auth admin plugin's own rule: the configured
 * `adminUserIds`, or a `role` claim containing `admin` (Better Auth stores
 * multiple roles as a comma-separated string).
 *
 * Server-side authorization must always call this against the *session* user, so
 * an impersonated session is evaluated as the impersonated user.
 */
export function isAdminUser(user: RoleBearingUser | null | undefined): boolean {
  if (!user) {
    return false;
  }

  if (user.id === SYSTEM_ADMIN_ID) {
    return true;
  }

  // Split without trimming, exactly as Better Auth's own `hasPermission` does.
  // Being more lenient here would grant admin to a session Better Auth itself
  // refuses — an authz predicate must never diverge in the permissive direction.
  return user.role?.split(",").includes(PLATFORM_ADMIN_ROLE) ?? false;
}
