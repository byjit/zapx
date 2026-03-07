import { getSession, getTestHelpers } from "@turborepo-boilerplate/auth";
import { type NextFunction, type Request, type Response } from "express";
import { httpErrors } from "../utils/http-error";

export type AuthSession = Awaited<ReturnType<typeof getSession>>;

export interface AuthenticatedRequest extends Request {
  session: AuthSession;
}

/**
 * Test-only helper to build auth headers for protected route integration tests.
 */
export const getTestAuthHeaders = async (userId: string): Promise<Headers> => {
  const test = await getTestHelpers();
  return await test.getAuthHeaders({ userId });
};

/** Builds Headers from Express request for better-auth API calls */
function headersFromRequest(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.append(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    }
  }
  return headers;
}

export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const headers = headersFromRequest(req);
  const session = await getSession(headers);

  if (!session) {
    next(httpErrors.unauthorized());
    return;
  }

  (req as unknown as AuthenticatedRequest).session = session;
  next();
};

/**
 * Middleware that requires an active organization in the session.
 * Use after authMiddleware for routes that need organization context.
 * Session includes activeOrganizationId when the organization plugin is used.
 */
export const requireOrganizationMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const { session } = req as unknown as AuthenticatedRequest;
  const sessionData = session?.session as
    | { activeOrganizationId?: string }
    | undefined;
  const activeOrgId = sessionData?.activeOrganizationId;

  if (!activeOrgId) {
    next(httpErrors.forbidden("Active organization is required"));
    return;
  }
  next();
};
