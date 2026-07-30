import type { ZodType } from "zod";

type JsonSchema = Record<string, unknown>;
type Usage = { prompt_tokens?: number; completion_tokens?: number };

export type ModelReceipt = {
  requestedModel: string;
  servedModel: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export async function requestStructured<T>(input: {
  name: string;
  system: string;
  prompt: string;
  schema: JsonSchema;
  validator: ZodType<T>;
  fallback?: boolean;
}): Promise<{ data: T; receipt: ModelReceipt }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter is not configured.");
  const requestedModel = input.fallback
    ? process.env.OPENROUTER_FALLBACK_MODEL ?? "~openai/gpt-mini-latest"
    : process.env.OPENROUTER_MODEL ?? "qwen/qwen3.7-plus";
  const timeoutMs = Math.max(30_000, Number(process.env.OPENROUTER_TIMEOUT_MS ?? "180000"));
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesclone.com",
      "X-Title": "VibesClone",
    },
    body: JSON.stringify({
      model: requestedModel,
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
      temperature: 0.2,
      max_tokens: 9_000,
      provider: { require_parameters: true },
      plugins: [{ id: "response-healing" }],
      response_format: { type: "json_schema", json_schema: { name: input.name, strict: true, schema: input.schema } },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = (await response.json()) as {
    model?: string;
    usage?: Usage;
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `OpenRouter returned ${response.status}.`);
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenRouter returned no structured content.");
  const data = input.validator.parse(JSON.parse(raw));
  const inputTokens = payload.usage?.prompt_tokens ?? 0;
  const outputTokens = payload.usage?.completion_tokens ?? 0;
  const inputRate = Number(process.env.OPENROUTER_INPUT_USD_PER_MILLION ?? "0.32");
  const outputRate = Number(process.env.OPENROUTER_OUTPUT_USD_PER_MILLION ?? "1.28");
  return {
    data,
    receipt: {
      requestedModel,
      servedModel: payload.model ?? requestedModel,
      inputTokens,
      outputTokens,
      estimatedCostUsd: (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000,
    },
  };
}
