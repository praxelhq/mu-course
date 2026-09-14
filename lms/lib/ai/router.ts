// The Shipyard's model routing table, prices, and BYOK kill-switch.
//
// This is the ONLY place the routing table lives (SPEC §6.5). Nothing else
// names a model slug. lib/ai/openrouter.ts asks this module which two models
// to send and hands back the outcome so the kill-switch can count failures.
//
// Course 1's Anthropic client (lib/ai/client.ts) is untouched and unused here:
// every Shipyard call goes through OpenRouter.

import type { PrismaClient, ShipyardRoutingProfile } from "@prisma/client";

export type RouterTask = "preflight" | "verdict" | "escalation" | "eval";

/** Exact OpenRouter slugs, confirmed against the model list on 2026-09-14. */
export const MODEL_HAIKU = "anthropic/claude-haiku-4.5";
export const MODEL_FLASH = "z-ai/glm-5.3-flash";

export type ModelSlug = typeof MODEL_HAIKU | typeof MODEL_FLASH;

/** USD per million tokens, as published on 2026-09-14. Base rate, no promos. */
export const MODEL_PRICES: Record<ModelSlug, { inPerMillion: number; outPerMillion: number }> = {
  [MODEL_HAIKU]: { inPerMillion: 1.0, outPerMillion: 5.0 },
  [MODEL_FLASH]: { inPerMillion: 0.15, outPerMillion: 0.5 },
};

/** Cost of one call from the price table. Unknown models cost 0, not NaN. */
export function computeCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = MODEL_PRICES[model as ModelSlug];
  if (!price) return 0;
  const usd =
    (Math.max(0, tokensIn) * price.inPerMillion + Math.max(0, tokensOut) * price.outPerMillion) /
    1_000_000;
  // Six decimals: a single verdict costs fractions of a cent and the admin
  // cost meter sums thousands of them.
  return Math.round(usd * 1e6) / 1e6;
}

export type RoutingProfileName = "flash-verdicts" | "flash-everywhere";

/** DB enum <-> the hyphenated name used in env vars and the admin UI. */
export function profileToEnum(name: RoutingProfileName): ShipyardRoutingProfile {
  return name === "flash-everywhere" ? "flash_everywhere" : "flash_verdicts";
}

export function profileFromEnum(value: ShipyardRoutingProfile): RoutingProfileName {
  return value === "flash_everywhere" ? "flash-everywhere" : "flash-verdicts";
}

export function parseRoutingProfile(raw: string | undefined | null): RoutingProfileName | null {
  const v = raw?.trim().toLowerCase();
  if (v === "flash-everywhere" || v === "flash_everywhere") return "flash-everywhere";
  if (v === "flash-verdicts" || v === "flash_verdicts") return "flash-verdicts";
  return null;
}

export const DEFAULT_ROUTING_PROFILE: RoutingProfileName = "flash-verdicts";

export type Route = { models: [ModelSlug, ModelSlug] };

/**
 * SPEC §6.5. `flash-verdicts` is the default: Haiku on the cheap pre-flight
 * and on escalation second opinions (paid from the Anthropic BYOK credit),
 * GLM 5.3 Flash on the bulk verdict tier (paid from OpenRouter credits).
 * `flash-everywhere` is what the kill-switch flips to when the BYOK credit is
 * gone — every task on Flash, so no review pays a failed-call latency.
 */
const ROUTING_TABLE: Record<RoutingProfileName, Record<RouterTask, Route>> = {
  "flash-verdicts": {
    preflight: { models: [MODEL_HAIKU, MODEL_FLASH] },
    verdict: { models: [MODEL_FLASH, MODEL_HAIKU] },
    escalation: { models: [MODEL_HAIKU, MODEL_FLASH] },
    // Evals run every model in the table; the primary here is only a default.
    eval: { models: [MODEL_FLASH, MODEL_HAIKU] },
  },
  "flash-everywhere": {
    preflight: { models: [MODEL_FLASH, MODEL_FLASH] },
    verdict: { models: [MODEL_FLASH, MODEL_FLASH] },
    escalation: { models: [MODEL_FLASH, MODEL_FLASH] },
    eval: { models: [MODEL_FLASH, MODEL_FLASH] },
  },
};

export function resolveRoute(
  task: RouterTask,
  profile: RoutingProfileName = DEFAULT_ROUTING_PROFILE,
): Route {
  const table = ROUTING_TABLE[profile] ?? ROUTING_TABLE[DEFAULT_ROUTING_PROFILE];
  return { models: [...table[task].models] as [ModelSlug, ModelSlug] };
}

/** Every model the eval harness runs a fixture against. */
export const EVAL_MODELS: ModelSlug[] = [MODEL_HAIKU, MODEL_FLASH];

// ---------------------------------------------------------------------------
// The kill-switch, as a pure reducer
// ---------------------------------------------------------------------------

export type RouterState = {
  anthropicExhausted: boolean;
  exhaustedAt: Date | null;
  consecutiveByokFailures: number;
  activeProfile: RoutingProfileName;
};

export type ByokOutcome = "ok" | "byok-credit-or-auth-error" | "other-error";

/** SPEC §6.5 step 3: five consecutive credit/auth failures flips the profile. */
export const BYOK_FAILURE_THRESHOLD = 5;

export const INITIAL_ROUTER_STATE: RouterState = {
  anthropicExhausted: false,
  exhaustedAt: null,
  consecutiveByokFailures: 0,
  activeProfile: DEFAULT_ROUTING_PROFILE,
};

/**
 * Pure. A successful call resets the counter; a non-BYOK error (a timeout, a
 * provider 500) leaves it alone, because those say nothing about the credit.
 * Only a credit or auth failure advances it, and the fifth in a row flips the
 * profile to flash-everywhere until an admin resets the switch by hand.
 */
export function applyByokOutcome(
  state: RouterState,
  outcome: ByokOutcome,
  now: Date = new Date(),
): RouterState {
  if (outcome === "ok") {
    if (state.consecutiveByokFailures === 0) return state;
    return { ...state, consecutiveByokFailures: 0 };
  }
  if (outcome === "other-error") return state;

  const consecutiveByokFailures = state.consecutiveByokFailures + 1;
  if (consecutiveByokFailures < BYOK_FAILURE_THRESHOLD || state.anthropicExhausted) {
    return { ...state, consecutiveByokFailures };
  }
  return {
    anthropicExhausted: true,
    exhaustedAt: now,
    consecutiveByokFailures,
    activeProfile: "flash-everywhere",
  };
}

/**
 * Is this failure the BYOK credit running out, or the key being rejected?
 * 401/402/403 are the plain cases; OpenRouter also returns a 4xx body whose
 * error message names credits or the key, which is what we match on.
 */
export function isByokCreditOrAuthError(status: number, body: unknown): boolean {
  if (status === 401 || status === 402 || status === 403) return true;
  const text = typeof body === "string" ? body : safeStringify(body);
  if (!text) return false;
  const lowered = text.toLowerCase();
  return (
    lowered.includes("insufficient") ||
    lowered.includes("credit") ||
    lowered.includes("quota") ||
    lowered.includes("no endpoints found") ||
    lowered.includes("invalid api key") ||
    lowered.includes("api key") ||
    lowered.includes("unauthorized")
  );
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Persistence — the single "default" row, plus an AuditLog on every flip
// ---------------------------------------------------------------------------

export const ROUTER_STATE_ID = "default";
export const ROUTER_FLIP_AUDIT_ACTION = "shipyard.router.flip";

type RouterDb = Pick<PrismaClient, "shipyardRouterState" | "auditLog">;

export async function loadRouterState(db: RouterDb): Promise<RouterState> {
  const row = await db.shipyardRouterState.findUnique({ where: { id: ROUTER_STATE_ID } });
  if (!row) return { ...INITIAL_ROUTER_STATE };
  return {
    anthropicExhausted: row.anthropicExhausted,
    exhaustedAt: row.exhaustedAt,
    consecutiveByokFailures: row.consecutiveByokFailures,
    activeProfile: profileFromEnum(row.activeProfile),
  };
}

/**
 * Persist the state. A change of active profile — by the kill-switch or by an
 * admin — writes an AuditLog row carrying both sides, because "why is every
 * review suddenly on Flash" must be answerable months later.
 */
export async function saveRouterState(
  db: RouterDb,
  state: RouterState,
  actor: string,
): Promise<void> {
  const before = await loadRouterState(db);
  await db.shipyardRouterState.upsert({
    where: { id: ROUTER_STATE_ID },
    create: {
      id: ROUTER_STATE_ID,
      anthropicExhausted: state.anthropicExhausted,
      exhaustedAt: state.exhaustedAt,
      consecutiveByokFailures: state.consecutiveByokFailures,
      activeProfile: profileToEnum(state.activeProfile),
    },
    update: {
      anthropicExhausted: state.anthropicExhausted,
      exhaustedAt: state.exhaustedAt,
      consecutiveByokFailures: state.consecutiveByokFailures,
      activeProfile: profileToEnum(state.activeProfile),
    },
  });
  if (before.activeProfile !== state.activeProfile) {
    await db.auditLog.create({
      data: {
        actorId: actor,
        action: ROUTER_FLIP_AUDIT_ACTION,
        targetType: "ShipyardRouterState",
        targetId: ROUTER_STATE_ID,
        before: { activeProfile: before.activeProfile, anthropicExhausted: before.anthropicExhausted },
        after: {
          activeProfile: state.activeProfile,
          anthropicExhausted: state.anthropicExhausted,
          consecutiveByokFailures: state.consecutiveByokFailures,
        },
      },
    });
  }
}

/**
 * The profile a call should use. The DB state wins once the kill-switch has
 * fired; OPENROUTER_ROUTING_PROFILE is the starting configuration.
 */
export function effectiveProfile(
  state: RouterState | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): RoutingProfileName {
  if (state?.anthropicExhausted) return "flash-everywhere";
  if (state) return state.activeProfile;
  return parseRoutingProfile(env.OPENROUTER_ROUTING_PROFILE) ?? DEFAULT_ROUTING_PROFILE;
}
