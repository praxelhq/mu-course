import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getClerkUserEmail,
  hasClerkKeys,
  updateClerkUserMetadata,
} from "@/lib/auth/clerk";
import {
  decideRosterGate,
  flagOffRosterUser,
  type RosterLookup,
} from "@/lib/auth/roster-gate";
import {
  isTestLoginEnabled,
  testUserIdFromCookieHeader,
} from "@/lib/auth/test-login";
import {
  enrollTemporarySectionFUser,
  prismaTemporaryEnrollmentDeps,
} from "@/lib/auth/temporary-section-f-enrollment";
import {
  findUserByClerkIdentity,
  findUserByEmailIdentity,
  linkClerkIdentity,
} from "@/lib/auth/user-identity";

// Roster gate: every authenticated request must map to a users row, or it is
// bounced to /not-on-roster and the Clerk account is flagged for deletion.
// The user.created webhook enforces the same rule (defense in depth).
//
// RUNTIME NOTE (verified against Next 16.2.12): this file is `proxy.ts`, the
// Next 16 successor to `middleware.ts`. Proxy files ALWAYS run on the Node.js
// runtime — Prisma works here — and Next 16 rejects a `runtime` segment
// config in proxy files ("Proxy always runs on Node.js runtime", error E1031),
// so no explicit `export const config = { runtime: 'nodejs' }` is needed or
// allowed. On older Next (15.5+) the equivalent would be middleware.ts with
// `export const config = { runtime: 'nodejs' }`.

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/not-on-roster",
  "/api/health", // unauthenticated liveness probe (Railway healthcheck)
  "/api/webhooks/clerk(.*)",
  "/api/test-login", // guards itself (404 outside dev/test)
]);

function notOnRosterRedirect(req: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/not-on-roster", req.url));
}

/**
 * Cheap roster lookup: select id only. Returns "error" (fail closed) if the
 * DB is unreachable.
 */
async function lookupRosterByClerkId(clerkUserId: string): Promise<RosterLookup> {
  try {
    const linked = await findUserByClerkIdentity(prisma, clerkUserId);
    if (linked) return linked;

    // FIRST SIGN-IN: the roster row exists but has no clerkUserId yet — the
    // user.created webhook links it, and that is asynchronous. Without this
    // fallback a student whose first page load beats the webhook would be
    // treated as off-roster and FLAGGED for deletion. Match on the Clerk
    // account's primary email (the same rule the webhook and session layer
    // use) and backfill the link so this costs one Clerk call per student,
    // once. An unknown account is offered to the fail-closed, time-bounded
    // Section F emergency enrollment path; outside that window it still
    // falls through to null → flag + redirect.
    const email = await getClerkUserEmail(clerkUserId);
    if (!email) return null;
    const byEmail = await findUserByEmailIdentity(prisma, email);
    if (byEmail) {
      await linkClerkIdentity(prisma, byEmail.id, clerkUserId);
      return byEmail;
    }

    const normalizedEmail = email.toLowerCase();
    const enrolled = await enrollTemporarySectionFUser(
      { email: normalizedEmail, clerkUserId },
      prismaTemporaryEnrollmentDeps(prisma),
    );
    if (!enrolled) return null;

    try {
      await updateClerkUserMetadata(clerkUserId, {
        publicMetadata: { role: enrolled.role, sectionId: enrolled.sectionId },
        privateMetadata: { flaggedForDeletion: false },
      });
    } catch {
      // Postgres enrollment is authoritative; Clerk sync is best-effort.
    }

    return enrolled;
  } catch {
    return "error";
  }
}

const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Dev/test escape hatch: requests authenticated via the test-login cookie
  // bypass Clerk entirely (lib/auth validates the cookie's user id). Inert in
  // production because isTestLoginEnabled() is hard-false there.
  if (
    isTestLoginEnabled() &&
    testUserIdFromCookieHeader(req.headers.get("cookie"))
  ) {
    return;
  }

  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  // Roster gate. The webhook normally links clerkUserId at first sign-in, so
  // this is a single indexed unique lookup on the happy path.
  const lookup = await lookupRosterByClerkId(userId);
  const decision = decideRosterGate({
    authenticated: true,
    email: null, // proxy decides on clerkUserId link alone; email linking is the webhook's job
    rosterLookup: lookup,
  });
  if (decision.allow) return;

  if (decision.reason === "db-error") {
    // Fail closed for protected routes without flagging anyone.
    return new NextResponse("Service unavailable", { status: 503 });
  }

  // Off-roster: record + best-effort flag on the Clerk user, then bounce to
  // the branded page. Deletion of the Clerk account stays a manual action.
  if (decision.flag) {
    try {
      await flagOffRosterUser({
        clerkUserId: userId,
        email: null,
        createAuditLog: async (entry) => {
          await prisma.auditLog.create({
            data: {
              action: entry.action,
              targetType: entry.targetType,
              targetId: entry.targetId,
              after: entry.after as Prisma.InputJsonValue,
            },
          });
        },
        flagClerkUser: (id) =>
          updateClerkUserMetadata(id, {
            privateMetadata: { flaggedForDeletion: true },
          }),
      });
    } catch {
      // Never let bookkeeping turn a rejection into a 500.
    }
  }
  return notOnRosterRedirect(req);
});

export default function proxy(req: NextRequest, event: unknown) {
  // Clerk-optional local dev (explicit env detection): with no Clerk keys the
  // proxy is a pass-through — public pages and the test-login cookie flow
  // still work, and getSessionUser falls back to test-login only.
  if (!hasClerkKeys()) return NextResponse.next();
  // @ts-expect-error clerkMiddleware's NextFetchEvent type is structurally compatible
  return clerkProxy(req, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static assets; always run for API routes.
    "/((?!_next|favicon\\.ico|.*\\.(?:ico|png|svg|jpg|jpeg|webp|css|js|map|txt|woff2?)$).*)",
    "/(api|trpc)(.*)",
  ],
};
