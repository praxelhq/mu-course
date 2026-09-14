import { withAuth } from "@/lib/auth";
import { isTestLoginEnabled } from "@/lib/auth/test-login";
import { prisma } from "@/lib/db";
import {
  applyByokOutcome,
  BYOK_FAILURE_THRESHOLD,
  effectiveProfile,
  loadRouterState,
  saveRouterState,
} from "@/lib/ai/router";

// POST /api/shipyard/admin/router/simulate-byok-failures   (admin)
//   → 200 { state, effectiveProfile, flipped }
//   403 in production
//
// The demo's "force five BYOK failures" from SPEC §9's definition of done. It
// feeds five `byok-credit-or-auth-error` outcomes through the SAME pure
// reducer the gateway uses, so what the demo shows is the real kill-switch and
// not a mock of it: the fifth failure sets `anthropicExhausted`, flips the
// active profile to flash-everywhere, and `saveRouterState` writes the
// AuditLog row.
//
// NEVER available in production. A route that can silently move every review
// onto a different model has no business existing on the service students use,
// so it is gated on `ENABLE_TEST_LOGIN` or a non-production NODE_ENV — the
// same fence the rest of the demo affordances sit behind.

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (_req, { user }) => {
    if (!isTestLoginEnabled() && process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "The BYOK failure simulator is not available in production." },
        { status: 403 },
      );
    }

    const before = await loadRouterState(prisma);
    let state = before;
    for (let i = 0; i < BYOK_FAILURE_THRESHOLD; i++) {
      state = applyByokOutcome(state, "byok-credit-or-auth-error");
    }
    await saveRouterState(prisma, state, user.userId);

    return Response.json({
      state,
      effectiveProfile: effectiveProfile(state),
      flipped: before.activeProfile !== state.activeProfile,
      failuresApplied: BYOK_FAILURE_THRESHOLD,
    });
  },
  { role: "admin" },
);
