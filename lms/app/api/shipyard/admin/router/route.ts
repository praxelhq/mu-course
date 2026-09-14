import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  BYOK_FAILURE_THRESHOLD,
  effectiveProfile,
  INITIAL_ROUTER_STATE,
  loadRouterState,
  MODEL_PRICES,
  parseRoutingProfile,
  resolveRoute,
  saveRouterState,
  type RouterTask,
} from "@/lib/ai/router";

// GET  /api/shipyard/admin/router   (admin)
//   → 200 { state, effectiveProfile, routes, prices, threshold }
// POST /api/shipyard/admin/router   (admin)
//   body { profile?, resetKillSwitch? } → 200 { state, … }
//
// SPEC §6.5 step 4: "an admin can flip profiles manually at any time." The
// routing TABLE is not editable from here and never will be — it is config in
// lib/ai/router.ts, which is the one place a model slug appears. What an admin
// controls is which of the two profiles is live and whether the BYOK
// kill-switch is still latched.
//
// Resetting the switch clears `anthropicExhausted` AND the failure counter,
// and returns the profile to flash-verdicts unless a profile is named in the
// same request: an admin who tops up the Anthropic credit means both things.
// `saveRouterState` writes the AuditLog row whenever the profile actually
// moves, with the admin as the actor.

export const dynamic = "force-dynamic";

const TASKS: RouterTask[] = ["preflight", "verdict", "escalation", "eval"];

const bodySchema = z
  .object({
    profile: z.enum(["flash_verdicts", "flash_everywhere", "flash-verdicts", "flash-everywhere"]).optional(),
    resetKillSwitch: z.boolean().optional(),
  })
  .strict();

async function payload() {
  const state = await loadRouterState(prisma);
  const profile = effectiveProfile(state);
  return {
    state,
    effectiveProfile: profile,
    killSwitchActive: state.anthropicExhausted,
    byokFailureThreshold: BYOK_FAILURE_THRESHOLD,
    routes: Object.fromEntries(
      TASKS.map((task) => [task, [...resolveRoute(task, profile).models]]),
    ),
    prices: MODEL_PRICES,
  };
}

export const GET = withAuth(async () => Response.json(await payload()), { role: "admin" });

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const { profile, resetKillSwitch } = parsed.data;
    if (!profile && !resetKillSwitch) {
      return Response.json(
        { error: "Name a profile, or ask to reset the kill-switch." },
        { status: 400 },
      );
    }

    const current = await loadRouterState(prisma);
    const named = profile ? parseRoutingProfile(profile) : null;
    const next = resetKillSwitch
      ? {
          ...INITIAL_ROUTER_STATE,
          activeProfile: named ?? INITIAL_ROUTER_STATE.activeProfile,
        }
      : { ...current, activeProfile: named ?? current.activeProfile };

    await saveRouterState(prisma, next, user.userId);
    return Response.json(await payload());
  },
  { role: "admin" },
);
