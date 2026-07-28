import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getClerkSession, getClerkUserEmail } from "./clerk";
import {
  resolveSessionUser,
  type SessionDeps,
  type SessionUser,
  type SessionUserRow,
} from "./session";
import { isTestLoginEnabled, testUserIdFromCookieHeader } from "./test-login";

export type { SessionUser } from "./session";
export { isTestLoginEnabled, TEST_LOGIN_COOKIE } from "./test-login";

// All Clerk access is wrapped here (KTD16): server components, API routes and
// the proxy call getSessionUser/requireUser/requireRole/withAuth — never the
// Clerk SDK directly — so tests and seed-demo can substitute fake sessions via
// the test-login cookie, and the app runs without Clerk keys in local dev.

const userSelect = {
  id: true,
  email: true,
  role: true,
  sectionId: true,
  teamId: true,
} as const;

async function readTestCookie(req?: Request): Promise<string | null> {
  if (req) return testUserIdFromCookieHeader(req.headers.get("cookie"));
  try {
    // Server-component / route-handler request scope.
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get((await import("./test-login")).TEST_LOGIN_COOKIE)?.value ?? null;
  } catch {
    return null; // outside a request scope (e.g. plain vitest call)
  }
}

function realDeps(req?: Request): SessionDeps {
  return {
    testLoginEnabled: isTestLoginEnabled(),
    getTestUserId: () => readTestCookie(req),
    getClerkSession,
    getClerkEmail: getClerkUserEmail,
    db: {
      findUserById: (id): Promise<SessionUserRow | null> =>
        prisma.user.findUnique({ where: { id }, select: userSelect }),
      findUserByClerkId: (clerkUserId): Promise<SessionUserRow | null> =>
        prisma.user.findUnique({ where: { clerkUserId }, select: userSelect }),
      findUserByEmail: (email): Promise<SessionUserRow | null> =>
        prisma.user.findUnique({ where: { email }, select: userSelect }),
      linkClerkId: async (userId, clerkUserId) => {
        await prisma.user.update({ where: { id: userId }, data: { clerkUserId } });
      },
    },
  };
}

/**
 * The session for the current request: test-login cookie first (when enabled),
 * then Clerk. Pass the Request in API routes; server components may omit it
 * (cookies come from next/headers).
 */
export async function getSessionUser(req?: Request): Promise<SessionUser | null> {
  return resolveSessionUser(realDeps(req));
}

/** Typed auth failure — status is 401 (no session) or 403 (wrong role). */
export class AuthError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message?: string) {
    super(message ?? (status === 401 ? "Unauthenticated" : "Forbidden"));
    this.name = "AuthError";
    this.status = status;
  }
}

type RequiredRole = Extract<Role, "instructor" | "admin">;

function roleSatisfies(userRole: Role, required: RequiredRole): boolean {
  if (required === "instructor") return userRole === "instructor" || userRole === "admin";
  return userRole === "admin";
}

export async function requireUser(req?: Request): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (!user) throw new AuthError(401);
  return user;
}

export async function requireRole(
  role: RequiredRole,
  req?: Request,
): Promise<SessionUser> {
  const user = await requireUser(req);
  if (!roleSatisfies(user.role, role)) throw new AuthError(403);
  return user;
}

type AuthedHandler<Ctx> = (
  req: Request,
  ctx: Ctx & { user: SessionUser },
) => Promise<Response> | Response;

export type WithAuthOptions = {
  /** 'instructor' admits instructors and admins; 'admin' admits admins only. */
  role?: RequiredRole;
  /** Test seam: override session resolution (defaults to getSessionUser). */
  getUser?: (req: Request) => Promise<SessionUser | null>;
};

/**
 * API-route wrapper: resolves the session (optionally enforcing a role) and
 * passes it to the handler as ctx.user. 401/403 as JSON on failure.
 */
export function withAuth<Ctx extends object = object>(
  handler: AuthedHandler<Ctx>,
  options: WithAuthOptions = {},
): (req: Request, ctx?: Ctx) => Promise<Response> {
  const getUser = options.getUser ?? ((req: Request) => getSessionUser(req));
  return async (req, ctx) => {
    const user = await getUser(req);
    if (!user) {
      return Response.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (options.role && !roleSatisfies(user.role, options.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
      return await handler(req, { ...(ctx as Ctx), user });
    } catch (err) {
      if (err instanceof AuthError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  };
}
