// The only module in this codebase that speaks HTTP to OpenRouter.
//
// Everything Shipyard goes through `callStructured`: it asks lib/ai/router.ts
// which two models to send, posts one chat completion, parses and Zod-validates
// the JSON, retries once with the validation error appended, and reports the
// model, provider, tokens and USD that the caller must persist.
//
// Course 1's Anthropic SDK client (lib/ai/client.ts) is a separate path and is
// not used here. The tolerant JSON extractor is imported from it rather than
// duplicated — one repair rule, both courses.

import type { ZodType } from "zod";
import { extractJsonObject } from "./client";
import {
  applyByokOutcome,
  computeCostUsd,
  effectiveProfile,
  isByokCreditOrAuthError,
  MODEL_HAIKU,
  resolveRoute,
  type ByokOutcome,
  type RouterState,
  type RouterTask,
  type RoutingProfileName,
} from "./router";
import { callOpenRouterFake, type FakeCallContext } from "./openrouter-fake";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 90_000;
/** SPEC §6: temperature is capped, never raised, whatever a caller asks for. */
const MAX_TEMPERATURE = 0.2;
/**
 * Both models in the routing table think before they answer, and OpenRouter
 * bills those reasoning tokens out of `max_tokens`. Left uncapped, GLM 5.3
 * Flash will spend an ENTIRE 8K budget deliberating over a long bar and return
 * an empty `content` with `finish_reason: "length"` — which reads downstream as
 * a malformed reply and burns a retry for nothing. `reasoning.max_tokens`
 * fences the thinking so the answer always has room. (Disabling reasoning
 * outright is refused by GLM's endpoints: "Reasoning is mandatory".)
 */
const REASONING_TOKEN_CAP = 2_000;

export type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};

export type TextContentPart = { type: "text"; text: string };

export type UserContent = string | (TextContentPart | ImageContentPart)[];

export type StructuredCallArgs<T> = {
  task: RouterTask;
  /** The cached prefix: system prompt, bar, rubric. */
  system: string;
  user: UserContent;
  schema: ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  /**
   * Pin the model list instead of taking it from the routing table. Only the
   * fixture-agreement harness uses this: `pnpm eval:reviewer` reports agreement
   * PER MODEL, and a number is meaningless if the routing table's fallback
   * silently answered half of the calls. Production paths leave it unset.
   */
  models?: string[];
};

export type StructuredCallResult<T> = {
  data: T;
  modelUsed: string;
  providerUsed: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** The raw assistant message, stored in ShipyardReview.promptLog. */
  raw: string;
};

export type OpenRouterDeps = {
  env?: Readonly<Record<string, string | undefined>>;
  /** Current kill-switch state; null falls back to the env profile. */
  routerState?: RouterState | null;
  /**
   * Called with the EXPECTED next state after a BYOK outcome. Persist it here,
   * and return the state that was actually stored — the gateway adopts it, so
   * a later call in the same job sees a counter another worker moved.
   */
  onRouterState?: (
    state: RouterState,
    outcome: ByokOutcome,
  ) => void | RouterState | Promise<void | RouterState>;
  fetchImpl?: typeof globalThis.fetch;
};

const CORRECTIVE_INSTRUCTION =
  "\n\nYour previous reply was not a single valid JSON object matching the required schema. " +
  "Respond again with ONLY one valid JSON object that conforms exactly to the schema described " +
  "in the system prompt — no prose, no code fences, no explanations. The validation error was: ";

function flattenUser(user: UserContent): string {
  if (typeof user === "string") return user;
  return user
    .map((part) => (part.type === "text" ? part.text : "[image]"))
    .join("\n");
}

/**
 * The system prompt is sent as a content part carrying `cache_control`, which
 * is how OpenRouter passes Anthropic-style prompt caching through. The bar and
 * rubric are the same on every submission for a checkpoint, so this is the
 * whole cacheable prefix.
 */
function systemMessage(system: string) {
  return {
    role: "system" as const,
    content: [
      { type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } },
    ],
  };
}

type OpenRouterResponse = {
  model?: string;
  provider?: string;
  choices?: {
    finish_reason?: string;
    message?: { content?: string; reasoning?: string };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    is_byok?: boolean;
    /** The upstream spend. Under BYOK `cost` is 0 and this is the real number. */
    cost_details?: { upstream_inference_cost?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; code?: number | string };
};

/** Did this attempt draw on the Anthropic BYOK key? Only then does it count. */
function usedByok(models: string[]): boolean {
  return models.includes(MODEL_HAIKU);
}

/** OpenRouter suffixes served slugs (`:nitro`, `:floor`), so compare the stem. */
function isHaiku(slug: string | undefined | null): boolean {
  if (!slug) return false;
  return slug === MODEL_HAIKU || slug.startsWith(`${MODEL_HAIKU}:`);
}

/**
 * What a 200 says about the BYOK credit.
 *
 * `models: [haiku, flash]` means OpenRouter may serve the FALLBACK inside the
 * same request — and it does exactly that when the Anthropic key is out of
 * credit or rejected. The reply is then a perfectly ordinary HTTP 200 whose
 * `model` is Flash. Reading that as "ok" reset the counter on every one of
 * those, which is why the kill-switch could never reach five in a row
 * (docs/LEARNINGS.md, 2026-09-15).
 *
 * So the outcome comes from the model that ANSWERED, not from the status line:
 *   • Haiku asked for first and Haiku answered  → ok
 *   • Haiku asked for first and Flash answered  → a BYOK credit/auth failure
 *   • Haiku was not the primary                 → null, say nothing at all;
 *     a Flash-primary verdict succeeding is no evidence about the credit and
 *     must not zero a counter another call is filling.
 *
 * OpenRouter sometimes also carries per-model error metadata beside a 200. It
 * is read when present and never depended on.
 */
export function outcomeFromServedModel(
  models: string[],
  payload: OpenRouterResponse | null,
): ByokOutcome | null {
  if (!isHaiku(models[0])) return null;
  const served = payload?.model;
  // No served model at all: trust what we asked for rather than invent a
  // failure out of a field OpenRouter simply did not send.
  if (!served) return "ok";
  if (!isHaiku(served)) return "byok-credit-or-auth-error";
  // Haiku answered. A hint attached to the same body still counts against it.
  if (payload?.error && isByokCreditOrAuthError(200, payload.error)) {
    return "byok-credit-or-auth-error";
  }
  return "ok";
}

export function isFakeMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return !env.OPENROUTER_API_KEY?.trim();
}

/**
 * One structured call. Sends `models: [primary, fallback]` so a failed Haiku
 * request is retried on Flash inside the same request, and provider
 * preferences that refuse any provider retaining our inputs — a checkpoint 3
 * screenshot can carry a student's real customers' details.
 */
export async function callStructured<T>(
  args: StructuredCallArgs<T>,
  deps: OpenRouterDeps = {},
): Promise<StructuredCallResult<T>> {
  const env = deps.env ?? process.env;
  const profile: RoutingProfileName = effectiveProfile(deps.routerState ?? null, env);
  const models = args.models ?? resolveRoute(args.task, profile).models;
  const temperature = Math.min(args.temperature ?? 0, MAX_TEMPERATURE);
  // Both models in the routing table THINK before they answer, and the
  // reasoning tokens come out of the same budget as the JSON. A verdict object
  // is ~1K tokens; GLM 5.3 Flash routinely spends two or three thousand more
  // reasoning about a long bar first, and a budget that runs out mid-thought
  // returns an EMPTY content string that looks exactly like a malformed reply.
  // (docs/LEARNINGS.md, 2026-09-15.)
  const maxTokens = args.maxTokens ?? 8192;

  if (isFakeMode(env)) {
    return fakeStructured(args, models);
  }

  const apiKey = env.OPENROUTER_API_KEY!.trim();
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  let correction = "";
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent: UserContent =
      typeof args.user === "string"
        ? args.user + correction
        : correction
          ? [...args.user, { type: "text" as const, text: correction }]
          : args.user;

    const body = {
      models,
      messages: [systemMessage(args.system), { role: "user" as const, content: userContent }],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" as const },
      reasoning: { max_tokens: Math.min(REASONING_TOKEN_CAP, Math.floor(maxTokens / 2)) },
      provider: { data_collection: "deny" as const, allow_fallbacks: true },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await doFetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://lms.praxel.in",
          "X-Title": "Praxel Shipyard",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = (await res.json().catch(() => null)) as OpenRouterResponse | null;
      if (!res.ok || payload?.error) {
        const outcome: ByokOutcome =
          usedByok(models) && isByokCreditOrAuthError(res.status, payload?.error ?? payload)
            ? "byok-credit-or-auth-error"
            : "other-error";
        await reportOutcome(deps, outcome);
        throw new Error(
          `openrouter: HTTP ${res.status}${payload?.error?.message ? ` — ${payload.error.message}` : ""}`,
        );
      }

      // A 200 is not proof the primary was served: see outcomeFromServedModel.
      await reportOutcome(deps, outcomeFromServedModel(models, payload));

      const choice = payload?.choices?.[0];
      const raw = choice?.message?.content ?? "";
      const modelUsed = payload?.model ?? models[0];
      const providerUsed = payload?.provider ?? "openrouter";
      const tokensIn = payload?.usage?.prompt_tokens ?? 0;
      const tokensOut = payload?.usage?.completion_tokens ?? 0;
      // Prefer the provider-reported cost — it already accounts for caching
      // discounts and promotional rates the price table does not know about —
      // but only when it is a real number. Under BYOK OpenRouter reports
      // `cost: 0` because IT charged nothing; the spend is real and lands on
      // the Anthropic credit, and `cost_details.upstream_inference_cost`
      // carries it. A cost meter showing zero for every Haiku review would be
      // worse than one computed from the published price table.
      const costUsd = pickCost(payload, modelUsed, tokensIn, tokensOut);

      if (raw.trim() === "") {
        // An empty content with finish_reason "length" is the reasoning budget
        // running out, not a malformed reply — say which, so the next person
        // raises maxTokens instead of rewriting the prompt.
        const reasoned = payload?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
        lastError = new Error(
          `openrouter: ${modelUsed} returned no content (finish_reason ${choice?.finish_reason ?? "unknown"}` +
            `${reasoned > 0 ? `, ${reasoned} reasoning tokens of a ${maxTokens} budget` : ""})`,
        );
        correction = "";
        continue;
      }

      try {
        const validated = args.schema.safeParse(extractJsonObject(raw));
        if (!validated.success) throw new Error(validated.error.message);
        return { data: validated.data, modelUsed, providerUsed, tokensIn, tokensOut, costUsd, raw };
      } catch (err) {
        lastError = err;
        correction = CORRECTIVE_INSTRUCTION + (err instanceof Error ? err.message : String(err));
        continue;
      }
    } catch (err) {
      lastError = err;
      // A transport or HTTP failure is not worth a second identical attempt:
      // `models` already gave the request its in-flight fallback.
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `callStructured(${args.task}): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/** OpenRouter's number, else the upstream BYOK number, else the price table. */
function pickCost(
  payload: OpenRouterResponse | null,
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const reported = payload?.usage?.cost;
  if (typeof reported === "number" && reported > 0) return reported;
  const upstream = payload?.usage?.cost_details?.upstream_inference_cost;
  if (typeof upstream === "number" && upstream > 0) return upstream;
  return computeCostUsd(model, tokensIn, tokensOut);
}

/**
 * Hand the outcome to whoever is persisting it, and take back the state they
 * ended up with.
 *
 * `applyByokOutcome` still computes the expected next state — it is the rule,
 * and a caller with no database (the eval harness) has nothing else. But the
 * persister's return value WINS when it gives one: under fifteen workers the
 * counter this call actually landed on is the database's, not the one derived
 * from a snapshot taken at the top of the job. Writing it back onto `deps`
 * means the second call in the same job reads the real number.
 */
async function reportOutcome(deps: OpenRouterDeps, outcome: ByokOutcome | null): Promise<void> {
  if (outcome === null) return;
  if (!deps.onRouterState || !deps.routerState) return;
  // A timeout or a provider 500 is not evidence about the credit either way.
  if (outcome === "other-error") return;
  const next = applyByokOutcome(deps.routerState, outcome);
  const persisted = await deps.onRouterState(next, outcome);
  deps.routerState = persisted ?? next;
}

function fakeStructured<T>(
  args: StructuredCallArgs<T>,
  models: string[],
): StructuredCallResult<T> {
  const ctx: FakeCallContext = {
    task: args.task,
    system: args.system,
    userText: flattenUser(args.user),
    models,
  };
  const fake = callOpenRouterFake(ctx);
  const validated = args.schema.safeParse(extractJsonObject(fake.content));
  if (!validated.success) {
    throw new Error(
      `openrouter fake: response did not match the caller's schema — ${validated.error.message}`,
    );
  }
  return {
    data: validated.data,
    modelUsed: fake.modelUsed,
    providerUsed: fake.providerUsed,
    tokensIn: fake.tokensIn,
    tokensOut: fake.tokensOut,
    costUsd: computeCostUsd(fake.modelUsed, fake.tokensIn, fake.tokensOut),
    raw: fake.content,
  };
}

/** Build the image content part OpenRouter expects for a base64 image. */
export function imagePart(base64: string, contentType = "image/png"): ImageContentPart {
  return { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } };
}
