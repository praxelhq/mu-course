import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

// The ONLY module importing @anthropic-ai/sdk (CLAUDE.md invariant: all AI
// provider calls live behind lib/ai/). Anthropic is called exclusively from
// the queue worker — never in a request handler. This module performs calls
// and parsing only; it records nothing (the caller owns CostLog/promptLog).

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Anthropic is not configured (missing ANTHROPIC_API_KEY)");
    this.name = "AiNotConfiguredError";
  }
}

/**
 * Grading model. claude-sonnet-4-5 accepts a temperature parameter (we grade
 * near-deterministically at temperature 0); newer 4.7+ models reject sampling
 * params, so if ANTHROPIC_MODEL is overridden to one of those we omit it.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-5";

export function gradingModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

let client: Anthropic | null = null;

/** The real Anthropic client. Throws AiNotConfiguredError without an API key. */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// ---------------------------------------------------------------------------
// structuredCall — one JSON object out, Zod-validated, one corrective retry
// ---------------------------------------------------------------------------

export type ModelUsage = { inputTokens: number; outputTokens: number };

/**
 * Minimal text-completion seam so tests (and the eval stub) can substitute
 * the model without touching the Anthropic SDK.
 */
export interface ModelClient {
  complete(args: {
    system: string;
    user: string;
    maxTokens: number;
    temperature: number | undefined;
    model: string;
  }): Promise<{ text: string; usage: ModelUsage }>;
}

export interface StructuredCallArgs<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
  /** Clamped to <= 0.2 — grading must be near-deterministic. Default 0. */
  temperature?: number;
  model?: string;
}

export interface StructuredCallResult<T> {
  data: T;
  usage: ModelUsage;
  raw: string;
  /** 0 when the first response validated; 1 when the corrective retry did. */
  retries: number;
  model: string;
}

/** Generic signature the worker takes as a DI seam. */
export type StructuredCaller = <T>(args: StructuredCallArgs<T>) => Promise<StructuredCallResult<T>>;

/** Models that reject sampling params entirely (omit temperature for them). */
const NO_TEMPERATURE = /claude-(opus-4-[7-9]|opus-5|sonnet-5|fable|mythos)/;

function realModelClient(): ModelClient {
  return {
    async complete({ system, user, maxTokens, temperature, model }) {
      const anthropic = getAnthropic();
      const res = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        ...(temperature !== undefined && !NO_TEMPERATURE.test(model)
          ? { temperature }
          : {}),
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return {
        text,
        usage: {
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
        },
      };
    },
  };
}

/** Extract the first top-level JSON object from a model response. */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("no JSON object found in model response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

const CORRECTIVE_INSTRUCTION =
  "\n\nYour previous reply was not a single valid JSON object matching the required schema. " +
  "Respond again with ONLY one valid JSON object that conforms exactly to the schema described " +
  "in the system prompt — no prose, no code fences, no explanations.";

/**
 * One structured model call: sends system+user, parses a single JSON object
 * from the response, Zod-validates it, and retries ONCE with a corrective
 * instruction appended on schema failure. Throws on the second failure.
 */
export async function structuredCall<T>(
  args: StructuredCallArgs<T>,
  clientImpl?: ModelClient,
): Promise<StructuredCallResult<T>> {
  const impl = clientImpl ?? realModelClient();
  const model = args.model ?? gradingModel();
  const maxTokens = args.maxTokens ?? 2048;
  const temperature = Math.min(args.temperature ?? 0, 0.2);

  const usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let lastError: unknown;
  let raw = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const user = attempt === 0 ? args.user : args.user + CORRECTIVE_INSTRUCTION;
    const res = await impl.complete({ system: args.system, user, maxTokens, temperature, model });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    raw = res.text;
    try {
      const parsed = extractJsonObject(res.text);
      const validated = args.schema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(`schema validation failed: ${validated.error.message}`);
      }
      return { data: validated.data, usage, raw, retries: attempt, model };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `structuredCall: model response failed schema validation after retry: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
