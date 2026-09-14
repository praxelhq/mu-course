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
  /** Called with the new state after a BYOK outcome. Persist it here. */
  onRouterState?: (state: RouterState, outcome: ByokOutcome) => void | Promise<void>;
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
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number | string };
};

/** Did this attempt draw on the Anthropic BYOK key? Only then does it count. */
function usedByok(models: string[]): boolean {
  return models.includes(MODEL_HAIKU);
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
  const maxTokens = args.maxTokens ?? 2048;

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

      await reportOutcome(deps, "ok");

      const raw = payload?.choices?.[0]?.message?.content ?? "";
      const modelUsed = payload?.model ?? models[0];
      const providerUsed = payload?.provider ?? "openrouter";
      const tokensIn = payload?.usage?.prompt_tokens ?? 0;
      const tokensOut = payload?.usage?.completion_tokens ?? 0;
      // Prefer the provider-reported cost: it already accounts for caching
      // discounts and promotional rates the price table does not know about.
      const costUsd =
        typeof payload?.usage?.cost === "number"
          ? payload.usage.cost
          : computeCostUsd(modelUsed, tokensIn, tokensOut);

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

async function reportOutcome(deps: OpenRouterDeps, outcome: ByokOutcome): Promise<void> {
  if (!deps.onRouterState || !deps.routerState) return;
  const next = applyByokOutcome(deps.routerState, outcome);
  if (next === deps.routerState) return;
  await deps.onRouterState(next, outcome);
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
