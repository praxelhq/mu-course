import { describe, expect, it, afterEach } from "vitest";
import { z } from "zod";
import {
  applyByokOutcome,
  BYOK_FAILURE_THRESHOLD,
  computeCostUsd,
  DEFAULT_ROUTING_PROFILE,
  effectiveProfile,
  EVAL_MODELS,
  INITIAL_ROUTER_STATE,
  isByokCreditOrAuthError,
  MODEL_FLASH,
  MODEL_HAIKU,
  MODEL_PRICES,
  parseRoutingProfile,
  profileFromEnum,
  profileToEnum,
  resolveRoute,
  type RouterState,
} from "@/lib/ai/router";
import { callStructured, imagePart, isFakeMode } from "@/lib/ai/openrouter";
import {
  __setOpenRouterFake,
  defaultFakeHandler,
  FIXTURE_LOW_CONFIDENCE_HINT,
  FIXTURE_RETURN_HINT,
} from "@/lib/ai/openrouter-fake";

const verdictSchema = z.object({
  verdict: z.enum(["pass", "return"]),
  confidence: z.number(),
  reasons: z.array(z.object({}).loose()),
  rubricScores: z.record(z.string(), z.number()),
  summary: z.string(),
});

afterEach(() => __setOpenRouterFake());

describe("the routing table", () => {
  it("uses the exact slugs confirmed on OpenRouter", () => {
    expect(MODEL_HAIKU).toBe("anthropic/claude-haiku-4.5");
    expect(MODEL_FLASH).toBe("z-ai/glm-5.3-flash");
    expect(MODEL_PRICES[MODEL_HAIKU]).toEqual({ inPerMillion: 1.0, outPerMillion: 5.0 });
    expect(MODEL_PRICES[MODEL_FLASH]).toEqual({ inPerMillion: 0.15, outPerMillion: 0.5 });
    expect(EVAL_MODELS).toEqual([MODEL_HAIKU, MODEL_FLASH]);
  });

  it("routes flash-verdicts exactly as SPEC §6.5 describes", () => {
    expect(resolveRoute("preflight", "flash-verdicts").models).toEqual([MODEL_HAIKU, MODEL_FLASH]);
    expect(resolveRoute("verdict", "flash-verdicts").models).toEqual([MODEL_FLASH, MODEL_HAIKU]);
    expect(resolveRoute("escalation", "flash-verdicts").models).toEqual([MODEL_HAIKU, MODEL_FLASH]);
  });

  it("puts every task on Flash under flash-everywhere", () => {
    for (const task of ["preflight", "verdict", "escalation", "eval"] as const) {
      expect(resolveRoute(task, "flash-everywhere").models, task).toEqual([
        MODEL_FLASH,
        MODEL_FLASH,
      ]);
    }
  });

  it("defaults to flash-verdicts and hands back a fresh array each time", () => {
    expect(DEFAULT_ROUTING_PROFILE).toBe("flash-verdicts");
    const a = resolveRoute("verdict");
    const b = resolveRoute("verdict");
    expect(a.models).toEqual(b.models);
    expect(a.models).not.toBe(b.models);
  });

  it("maps profile names to and from the DB enum", () => {
    expect(profileToEnum("flash-verdicts")).toBe("flash_verdicts");
    expect(profileToEnum("flash-everywhere")).toBe("flash_everywhere");
    expect(profileFromEnum("flash_everywhere")).toBe("flash-everywhere");
    expect(parseRoutingProfile("flash_everywhere")).toBe("flash-everywhere");
    expect(parseRoutingProfile("  Flash-Verdicts ")).toBe("flash-verdicts");
    expect(parseRoutingProfile("turbo")).toBeNull();
    expect(parseRoutingProfile(undefined)).toBeNull();
  });
});

describe("computeCostUsd", () => {
  it("prices a typical verdict on each model", () => {
    // 11K in, 1.2K out — the SPEC §6.5 budget's assumption.
    expect(computeCostUsd(MODEL_FLASH, 11_000, 1_200)).toBeCloseTo(0.002250, 6);
    expect(computeCostUsd(MODEL_HAIKU, 11_000, 1_200)).toBeCloseTo(0.017, 6);
  });

  it("is zero for zero tokens and for a model it does not know", () => {
    expect(computeCostUsd(MODEL_FLASH, 0, 0)).toBe(0);
    expect(computeCostUsd("openai/gpt-nonexistent", 10_000, 1_000)).toBe(0);
  });

  it("never returns a negative cost", () => {
    expect(computeCostUsd(MODEL_HAIKU, -5_000, -1_000)).toBe(0);
  });

  it("scales linearly with tokens", () => {
    const one = computeCostUsd(MODEL_FLASH, 1_000_000, 0);
    expect(one).toBeCloseTo(0.15, 6);
    expect(computeCostUsd(MODEL_FLASH, 2_000_000, 0)).toBeCloseTo(2 * one, 6);
  });
});

describe("the BYOK kill-switch reducer", () => {
  const start: RouterState = { ...INITIAL_ROUTER_STATE };
  const at = new Date("2026-09-14T12:00:00Z");

  it("counts consecutive credit/auth failures and flips on the fifth", () => {
    let state = start;
    for (let i = 1; i < BYOK_FAILURE_THRESHOLD; i++) {
      state = applyByokOutcome(state, "byok-credit-or-auth-error", at);
      expect(state.consecutiveByokFailures).toBe(i);
      expect(state.anthropicExhausted).toBe(false);
      expect(state.activeProfile).toBe("flash-verdicts");
    }
    state = applyByokOutcome(state, "byok-credit-or-auth-error", at);
    expect(state.anthropicExhausted).toBe(true);
    expect(state.activeProfile).toBe("flash-everywhere");
    expect(state.exhaustedAt).toEqual(at);
  });

  it("a success in the middle resets the run", () => {
    let state = start;
    for (let i = 0; i < 4; i++) state = applyByokOutcome(state, "byok-credit-or-auth-error", at);
    state = applyByokOutcome(state, "ok", at);
    expect(state.consecutiveByokFailures).toBe(0);
    for (let i = 0; i < 4; i++) state = applyByokOutcome(state, "byok-credit-or-auth-error", at);
    expect(state.anthropicExhausted).toBe(false);
  });

  it("a plain provider error says nothing about the credit and is ignored", () => {
    let state = start;
    for (let i = 0; i < 10; i++) state = applyByokOutcome(state, "other-error", at);
    expect(state.consecutiveByokFailures).toBe(0);
    expect(state).toBe(start);
  });

  it("is pure: the input state is never mutated", () => {
    const before = { ...start };
    applyByokOutcome(start, "byok-credit-or-auth-error", at);
    expect(start).toEqual(before);
  });

  it("once exhausted, more failures do not move exhaustedAt", () => {
    let state = start;
    for (let i = 0; i < BYOK_FAILURE_THRESHOLD; i++) {
      state = applyByokOutcome(state, "byok-credit-or-auth-error", at);
    }
    const later = new Date("2026-09-15T12:00:00Z");
    const after = applyByokOutcome(state, "byok-credit-or-auth-error", later);
    expect(after.exhaustedAt).toEqual(at);
    expect(after.consecutiveByokFailures).toBe(BYOK_FAILURE_THRESHOLD + 1);
  });

  it("an ok outcome on an untouched state changes nothing at all", () => {
    expect(applyByokOutcome(start, "ok", at)).toBe(start);
  });
});

describe("isByokCreditOrAuthError", () => {
  it("classifies the plain auth and payment statuses", () => {
    expect(isByokCreditOrAuthError(401, null)).toBe(true);
    expect(isByokCreditOrAuthError(402, null)).toBe(true);
    expect(isByokCreditOrAuthError(403, null)).toBe(true);
  });

  it("reads OpenRouter's error bodies", () => {
    expect(isByokCreditOrAuthError(400, { message: "Insufficient credits" })).toBe(true);
    expect(isByokCreditOrAuthError(400, { message: "Invalid API key provided" })).toBe(true);
    expect(isByokCreditOrAuthError(404, { message: "No endpoints found for this model" })).toBe(
      true,
    );
  });

  it("does not misread an ordinary outage as the credit running out", () => {
    expect(isByokCreditOrAuthError(500, { message: "Internal server error" })).toBe(false);
    expect(isByokCreditOrAuthError(429, { message: "Rate limit exceeded" })).toBe(false);
    expect(isByokCreditOrAuthError(504, null)).toBe(false);
    expect(isByokCreditOrAuthError(200, undefined)).toBe(false);
  });
});

describe("effectiveProfile", () => {
  it("falls back to the env profile with no DB state", () => {
    expect(effectiveProfile(null, {})).toBe("flash-verdicts");
    expect(effectiveProfile(null, { OPENROUTER_ROUTING_PROFILE: "flash-everywhere" })).toBe(
      "flash-everywhere",
    );
  });

  it("the DB state wins once set, and exhaustion overrides everything", () => {
    const state: RouterState = { ...INITIAL_ROUTER_STATE, activeProfile: "flash-verdicts" };
    expect(effectiveProfile(state, { OPENROUTER_ROUTING_PROFILE: "flash-everywhere" })).toBe(
      "flash-verdicts",
    );
    expect(effectiveProfile({ ...state, anthropicExhausted: true }, {})).toBe("flash-everywhere");
  });
});

describe("callStructured with no API key", () => {
  const env = {} as Readonly<Record<string, string | undefined>>;

  it("recognises fake mode from the absent key", () => {
    expect(isFakeMode({})).toBe(true);
    expect(isFakeMode({ OPENROUTER_API_KEY: "  " })).toBe(true);
    expect(isFakeMode({ OPENROUTER_API_KEY: "sk-or-x" })).toBe(false);
  });

  it("returns a schema-valid verdict with usage and cost, and never calls out", async () => {
    let fetched = false;
    const result = await callStructured(
      { task: "verdict", system: "bar and rubric", user: "a good submission", schema: verdictSchema },
      {
        env,
        fetchImpl: (() => {
          fetched = true;
          throw new Error("must not be called");
        }) as unknown as typeof fetch,
      },
    );
    expect(fetched).toBe(false);
    expect(result.data.verdict).toBe("pass");
    expect(result.tokensIn).toBeGreaterThan(0);
    expect(result.tokensOut).toBeGreaterThan(0);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.modelUsed).toBe(MODEL_FLASH);
  });

  it("honours the fixture hints", async () => {
    const returned = await callStructured(
      {
        task: "verdict",
        system: "bar",
        user: `a weak submission ${FIXTURE_RETURN_HINT}`,
        schema: verdictSchema,
      },
      { env },
    );
    expect(returned.data.verdict).toBe("return");
    expect(returned.data.reasons.length).toBeGreaterThan(0);

    const low = await callStructured(
      { task: "verdict", system: "bar", user: FIXTURE_LOW_CONFIDENCE_HINT, schema: verdictSchema },
      { env },
    );
    expect(low.data.confidence).toBeLessThan(0.7);
  });

  it("is deterministic: the same content gives the same token counts", async () => {
    const call = () =>
      callStructured(
        { task: "verdict", system: "bar", user: "same content", schema: verdictSchema },
        { env },
      );
    const [a, b] = [await call(), await call()];
    expect(a.tokensIn).toBe(b.tokensIn);
    expect(a.tokensOut).toBe(b.tokensOut);
    expect(a.costUsd).toBe(b.costUsd);
  });

  it("follows the active profile when picking the fake's model", async () => {
    const result = await callStructured(
      { task: "preflight", system: "bar", user: "x", schema: z.object({}).loose() },
      { env },
    );
    expect(result.modelUsed).toBe(MODEL_HAIKU);
  });

  it("lets a test swap the responder entirely", async () => {
    __setOpenRouterFake(() => ({
      content: JSON.stringify({
        verdict: "return",
        confidence: 0.33,
        reasons: [{ criterionId: "x" }],
        rubricScores: { overall: 12 },
        summary: "swapped",
      }),
      modelUsed: MODEL_HAIKU,
      providerUsed: "test",
      tokensIn: 5,
      tokensOut: 6,
    }));
    const result = await callStructured(
      { task: "verdict", system: "bar", user: "anything", schema: verdictSchema },
      { env },
    );
    expect(result.data.summary).toBe("swapped");
    expect(result.providerUsed).toBe("test");
    __setOpenRouterFake();
    const restored = await callStructured(
      { task: "verdict", system: "bar", user: "anything", schema: verdictSchema },
      { env },
    );
    expect(restored.providerUsed).toBe("fake");
  });

  it("throws rather than returning junk when the fake misses the schema", async () => {
    __setOpenRouterFake(() => ({
      content: "{}",
      modelUsed: MODEL_FLASH,
      providerUsed: "test",
      tokensIn: 1,
      tokensOut: 1,
    }));
    await expect(
      callStructured(
        { task: "verdict", system: "bar", user: "x", schema: verdictSchema },
        { env },
      ),
    ).rejects.toThrow(/schema/);
  });

  it("flattens image content parts for the fake's hint search", async () => {
    const result = await callStructured(
      {
        task: "verdict",
        system: "bar",
        user: [
          { type: "text", text: `sketches ${FIXTURE_RETURN_HINT}` },
          imagePart("aGVsbG8=", "image/png"),
        ],
        schema: verdictSchema,
      },
      { env },
    );
    expect(result.data.verdict).toBe("return");
  });

  it("builds a data: URL image part the way OpenRouter expects", () => {
    expect(imagePart("QUJD", "image/jpeg")).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,QUJD" },
    });
  });

  it("the default handler produces a pre-flight shape for the pre-flight task", () => {
    const out = defaultFakeHandler({
      task: "preflight",
      system: "s",
      userText: "https://a.example.com",
      models: [MODEL_HAIKU, MODEL_FLASH],
    });
    const parsed = JSON.parse(out.content) as { linksLive: boolean; spam: boolean };
    expect(parsed.linksLive).toBe(true);
    expect(parsed.spam).toBe(false);
  });
});

describe("callStructured against a stubbed OpenRouter", () => {
  const env = { OPENROUTER_API_KEY: "sk-or-test" };

  function stub(payload: unknown, status = 200) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return { ok: status < 400, status, json: async () => payload };
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }

  const goodPayload = {
    model: MODEL_FLASH,
    provider: "z-ai",
    choices: [
      {
        message: {
          content:
            '```json\n{"verdict":"pass","confidence":0.9,"reasons":[],"rubricScores":{"overall":80},"summary":"fine"}\n```',
        },
      },
    ],
    usage: { prompt_tokens: 11_000, completion_tokens: 1_200 },
  };

  it("sends the fallback array, the provider hygiene block, and the cache_control prefix", async () => {
    const { calls, fetchImpl } = stub(goodPayload);
    await callStructured(
      { task: "verdict", system: "the bar", user: "a submission", schema: verdictSchema },
      { env, fetchImpl },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = calls[0].body as {
      models: string[];
      provider: Record<string, unknown>;
      response_format: { type: string };
      temperature: number;
      messages: { role: string; content: { cache_control?: unknown }[] }[];
    };
    expect(body.models).toEqual([MODEL_FLASH, MODEL_HAIKU]);
    expect(body.provider).toEqual({ data_collection: "deny", allow_fallbacks: true });
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("parses a fenced JSON response and prices it from the table", async () => {
    const { fetchImpl } = stub(goodPayload);
    const result = await callStructured(
      { task: "verdict", system: "the bar", user: "a submission", schema: verdictSchema },
      { env, fetchImpl },
    );
    expect(result.data.verdict).toBe("pass");
    expect(result.modelUsed).toBe(MODEL_FLASH);
    expect(result.providerUsed).toBe("z-ai");
    expect(result.tokensIn).toBe(11_000);
    expect(result.costUsd).toBeCloseTo(computeCostUsd(MODEL_FLASH, 11_000, 1_200), 6);
  });

  it("prefers the provider-reported cost when OpenRouter sends one", async () => {
    const { fetchImpl } = stub({ ...goodPayload, usage: { ...goodPayload.usage, cost: 0.00091 } });
    const result = await callStructured(
      { task: "verdict", system: "bar", user: "x", schema: verdictSchema },
      { env, fetchImpl },
    );
    expect(result.costUsd).toBe(0.00091);
  });

  it("caps the temperature at 0.2 whatever the caller asks for", async () => {
    const { calls, fetchImpl } = stub(goodPayload);
    await callStructured(
      { task: "verdict", system: "bar", user: "x", schema: verdictSchema, temperature: 1 },
      { env, fetchImpl },
    );
    expect((calls[0].body as { temperature: number }).temperature).toBe(0.2);
  });

  it("retries ONCE with the validation error appended, then succeeds", async () => {
    let attempt = 0;
    const bodies: string[] = [];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { messages: { content: string }[] };
      bodies.push(body.messages[1].content);
      attempt += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          attempt === 1
            ? { ...goodPayload, choices: [{ message: { content: '{"verdict":"maybe"}' } }] }
            : goodPayload,
      };
    }) as unknown as typeof fetch;

    const result = await callStructured(
      { task: "verdict", system: "bar", user: "x", schema: verdictSchema },
      { env, fetchImpl },
    );
    expect(attempt).toBe(2);
    expect(bodies[1]).toContain("not a single valid JSON object");
    expect(result.data.verdict).toBe("pass");
  });

  it("gives up after the second schema failure", async () => {
    const { fetchImpl } = stub({
      ...goodPayload,
      choices: [{ message: { content: '{"verdict":"maybe"}' } }],
    });
    await expect(
      callStructured({ task: "verdict", system: "b", user: "x", schema: verdictSchema }, { env, fetchImpl }),
    ).rejects.toThrow(/callStructured\(verdict\)/);
  });

  it("feeds a 402 on a Haiku route into the kill-switch, and a 500 not", async () => {
    const seen: { state: RouterState; outcome: string }[] = [];
    const routerState: RouterState = { ...INITIAL_ROUTER_STATE, consecutiveByokFailures: 4 };
    const onRouterState = (state: RouterState, outcome: string) => {
      seen.push({ state, outcome });
    };

    const paymentRequired = stub({ error: { message: "Insufficient credits" } }, 402);
    await expect(
      callStructured(
        { task: "escalation", system: "b", user: "x", schema: verdictSchema },
        { env, fetchImpl: paymentRequired.fetchImpl, routerState, onRouterState },
      ),
    ).rejects.toThrow();
    expect(seen).toHaveLength(1);
    expect(seen[0].outcome).toBe("byok-credit-or-auth-error");
    expect(seen[0].state.activeProfile).toBe("flash-everywhere");

    seen.length = 0;
    const outage = stub({ error: { message: "Internal server error" } }, 500);
    await expect(
      callStructured(
        { task: "escalation", system: "b", user: "x", schema: verdictSchema },
        { env, fetchImpl: outage.fetchImpl, routerState, onRouterState },
      ),
    ).rejects.toThrow();
    expect(seen).toHaveLength(0);
  });

  it("does not blame the BYOK key for a failure on an all-Flash route", async () => {
    const seen: string[] = [];
    const routerState: RouterState = {
      ...INITIAL_ROUTER_STATE,
      activeProfile: "flash-everywhere",
      consecutiveByokFailures: 4,
    };
    const { fetchImpl } = stub({ error: { message: "Insufficient credits" } }, 402);
    await expect(
      callStructured(
        { task: "verdict", system: "b", user: "x", schema: verdictSchema },
        { env, fetchImpl, routerState, onRouterState: (_s, o) => {
          seen.push(o);
        } },
      ),
    ).rejects.toThrow();
    // Neither a flip nor a counter bump: the route never touched the BYOK key,
    // and a no-op outcome is not persisted at all.
    expect(seen).toEqual([]);
    expect(routerState.consecutiveByokFailures).toBe(4);
    expect(routerState.activeProfile).toBe("flash-everywhere");
  });

  it("resets the failure run after a successful call", async () => {
    const seen: RouterState[] = [];
    const routerState: RouterState = { ...INITIAL_ROUTER_STATE, consecutiveByokFailures: 3 };
    const { fetchImpl } = stub({ ...goodPayload, model: MODEL_HAIKU });
    await callStructured(
      { task: "escalation", system: "b", user: "x", schema: verdictSchema },
      { env, fetchImpl, routerState, onRouterState: (s) => {
        seen.push(s);
      } },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].consecutiveByokFailures).toBe(0);
  });
});
