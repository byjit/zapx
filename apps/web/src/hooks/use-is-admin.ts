import { isAdminUser } from "@turborepo-boilerplate/auth/permissions";
import { authClient } from "@/lib/auth-client";

/**
 * Client-side admin check.
 *
 * Reuses the same `isAdminUser` predicate that the server's `adminProcedure`
 * enforces, so the two can never disagree about who counts as an admin. This is
 * presentation only — every admin procedure re-checks on the server.
 */
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const { data: session, isPending } = authClient.useSession();

  return { isAdmin: isAdminUser(session?.user), isLoading: isPending };
}
