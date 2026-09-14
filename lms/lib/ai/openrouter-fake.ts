// A deterministic OpenRouter stand-in, so `pnpm seed`, the tests, and the demo
// stack run the whole reviewer pipeline with no API key and no spend.
//
// It is deliberately dumb: it reads a hint out of the user content and returns
// a plausible object shaped like the caller's schema. It is not a model and it
// never pretends to judge anything — a fixture marked `[fixture:return]` comes
// back as a return, everything else passes.
//
// It answers in the REAL contract (lib/shipyard/reviewer/schemas.ts), including
// one reason and one score per rubric criterion, because a fake whose shape the
// parser has to repair would send every keyless review to the human queue and
// the demo would show a queue instead of a walkthrough.

import type { RouterTask } from "./router";
import { MODEL_FLASH } from "./router";

export type FakeCallContext = {
  task: RouterTask;
  system: string;
  /** The user content, flattened to text (image parts become a placeholder). */
  userText: string;
  models: string[];
};

export type FakeCallResult = {
  content: string;
  modelUsed: string;
  providerUsed: string;
  tokensIn: number;
  tokensOut: number;
};

export type FakeHandler = (ctx: FakeCallContext) => FakeCallResult;

/** Marker a fixture or a seed row puts in the content to force a `return`. */
export const FIXTURE_RETURN_HINT = "[fixture:return]";
export const FIXTURE_PASS_HINT = "[fixture:pass]";
export const FIXTURE_LOW_CONFIDENCE_HINT = "[fixture:low-confidence]";

/** Same text in, same numbers out — so a re-seed produces identical rows. */
function pseudoTokens(text: string, floor: number, span: number): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return floor + (Math.abs(hash) % span);
}

function decide(userText: string): { verdict: "pass" | "return"; confidence: number } {
  const blank = userText.replace(/\s+/g, "") === "";
  if (userText.includes(FIXTURE_RETURN_HINT) || blank) {
    return { verdict: "return", confidence: 0.86 };
  }
  if (userText.includes(FIXTURE_LOW_CONFIDENCE_HINT)) {
    return { verdict: "return", confidence: 0.41 };
  }
  return { verdict: "pass", confidence: 0.88 };
}

/**
 * The criterion ids the system prompt names. `buildVerdictSystemPrompt` ends
 * the rubric block with "The criterion ids, exactly: a, b, c", which is there
 * for the model and is exactly what the fake needs to answer in the real
 * contract. Without it the fake would return a verdict the parser has to
 * repair, every seeded pass would come back flagged for a human, and the
 * keyless demo would show a review queue full of nothing.
 */
export function criterionIdsFrom(system: string): string[] {
  const match = /The criterion ids, exactly:\s*(.+)/.exec(system);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "" && /^[a-z0-9-]+$/i.test(id));
}

export const defaultFakeHandler: FakeHandler = (ctx) => {
  const { verdict, confidence } = decide(ctx.userText);
  const ids = criterionIdsFrom(ctx.system);
  const criteria = ids.length > 0 ? ids : ["overall"];

  let payload: unknown;
  if (ctx.task === "preflight") {
    payload = {
      isBlank: ctx.userText.replace(/\s+/g, "") === "",
      isSpam: false,
      note: "fake pre-flight: no model was called",
    };
  } else {
    const failing = verdict === "return" ? criteria[0] : null;
    const base = {
      verdict,
      confidence,
      reasons: criteria.map((id) => ({
        criterion: id,
        met: id !== failing,
        note:
          id === failing
            ? "Fake reviewer: this is the clause the deterministic responder marks unmet. Set OPENROUTER_API_KEY to run the real reviewer."
            : "Fake reviewer: treated as met.",
      })),
      rubricScores: Object.fromEntries(
        criteria.map((id) => [id, id === failing ? 35 : 78]),
      ),
      contradictions: [],
      flags: [],
      summaryForStudent:
        verdict === "pass"
          ? "Fake reviewer: this submission would be passed."
          : "Fake reviewer: this submission would be returned.",
    };
    payload =
      ctx.task === "escalation"
        ? { ...base, agreesWithFirstVerdict: true, humanNote: "Fake escalation: no model was called." }
        : base;
  }

  const content = JSON.stringify(payload);
  return {
    content,
    modelUsed: ctx.models[0] ?? MODEL_FLASH,
    providerUsed: "fake",
    tokensIn: pseudoTokens(ctx.system + ctx.userText, 1_800, 9_000),
    tokensOut: pseudoTokens(content, 200, 1_100),
  };
};

let handler: FakeHandler = defaultFakeHandler;

/** Tests swap the responder; pass nothing to restore the default. */
export function __setOpenRouterFake(next?: FakeHandler): void {
  handler = next ?? defaultFakeHandler;
}

export function callOpenRouterFake(ctx: FakeCallContext): FakeCallResult {
  return handler(ctx);
}
