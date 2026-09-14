// A deterministic OpenRouter stand-in, so `pnpm seed`, the tests, and the demo
// stack run the whole reviewer pipeline with no API key and no spend.
//
// It is deliberately dumb: it reads a hint out of the user content and returns
// a plausible object shaped like the caller's schema. It is not a model and it
// never pretends to judge anything — a fixture marked `[fixture:return]` comes
// back as a return, everything else passes.

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

export const defaultFakeHandler: FakeHandler = (ctx) => {
  const { verdict, confidence } = decide(ctx.userText);
  const payload =
    ctx.task === "preflight"
      ? {
          linksLive: verdict === "pass",
          blank: verdict === "return" && ctx.userText.trim() === "",
          spam: false,
          duplicate: false,
          extractedText: ctx.userText.slice(0, 280),
          notes: "fake pre-flight: no network call was made",
        }
      : {
          verdict,
          confidence,
          reasons:
            verdict === "pass"
              ? []
              : [
                  {
                    criterionId: "unknown",
                    clause: "The bar this submission did not meet",
                    what: "This is a fake reviewer response used by the seed and the tests.",
                    fix: "Set OPENROUTER_API_KEY to run the real reviewer.",
                  },
                ],
          rubricScores: { overall: verdict === "pass" ? 78 : 44 },
          summary:
            verdict === "pass"
              ? "Fake reviewer: this submission would be passed."
              : "Fake reviewer: this submission would be returned.",
        };
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
