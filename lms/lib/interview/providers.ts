// Thin fetch-based clients for the interview loop's external providers:
// Gemini (dialog), ElevenLabs (TTS), Deepgram (STT). No heavy SDKs — plain
// fetch against each provider's REST API (CLAUDE.md: all AI provider calls
// live behind lib/ai/ or, for interview transports, this module).
//
// EVERY provider is optional-by-env. A missing key throws the typed
// ProviderNotConfiguredError, which routes turn into a friendly 503 and the
// session layer turns into graceful degradation (text-only questions, typed
// answers, or the scripted dev fallback).

export type InterviewProvider = "gemini" | "elevenlabs" | "deepgram";

/**
 * Per-call ceiling for a provider fetch. These calls sit on the live student
 * interview request path, so a stalled provider must abort rather than hang the
 * request forever. Overridable via env for slow networks.
 */
const PROVIDER_TIMEOUT_MS = Number(process.env.INTERVIEW_PROVIDER_TIMEOUT_MS || 30_000);

/** fetch with an AbortController timeout; clears the timer in all paths. */
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class ProviderNotConfiguredError extends Error {
  readonly provider: InterviewProvider;
  constructor(provider: InterviewProvider) {
    super(`Provider not configured: ${provider} (missing API key)`);
    this.name = "ProviderNotConfiguredError";
    this.provider = provider;
  }
}

// ---------------------------------------------------------------------------
// Cost estimates (USD). Small const table; recorded into CostLog by callers.
// ---------------------------------------------------------------------------

export const PROVIDER_COSTS = {
  /** Gemini flash, USD per 1M tokens. */
  gemini: { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  /** ElevenLabs turbo, USD per character. */
  elevenlabs: { perChar: 0.00005 },
  /** Deepgram nova, USD per second of audio. */
  deepgram: { perSecond: 0.0043 / 60 },
} as const;

export function estimateGeminiCostUsd(usage: { inputTokens: number; outputTokens: number }): number {
  return (
    (usage.inputTokens * PROVIDER_COSTS.gemini.inputPerMTok +
      usage.outputTokens * PROVIDER_COSTS.gemini.outputPerMTok) /
    1_000_000
  );
}

export function estimateTtsCostUsd(chars: number): number {
  return chars * PROVIDER_COSTS.elevenlabs.perChar;
}

export function estimateSttCostUsd(seconds: number): number {
  return seconds * PROVIDER_COSTS.deepgram.perSecond;
}

// ---------------------------------------------------------------------------
// Gemini — adaptive question generation (dialog)
// ---------------------------------------------------------------------------

export type ChatMessage = { role: "agent" | "student"; text: string };

export type GeminiChatResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Absent for DI mocks; the real client reports the configured model. */
  model?: string;
};

/** DI seam: the session layer only depends on this shape. */
export interface GeminiClient {
  chat(args: { system: string; messages: ChatMessage[] }): Promise<GeminiChatResult>;
}

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * One Gemini generateContent call over the running transcript. Agent turns
 * map to role "model", student turns to role "user". Gemini requires the
 * conversation to end on a user turn; when the transcript is empty or ends
 * with an agent turn we append a neutral "continue" user message.
 */
export async function geminiChat(args: {
  system: string;
  messages: ChatMessage[];
}): Promise<GeminiChatResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("gemini");
  const model = geminiModel();

  const contents = args.messages.map((m) => ({
    role: m.role === "agent" ? "model" : "user",
    parts: [{ text: m.text }],
  }));
  if (contents.length === 0 || contents[contents.length - 1].role === "model") {
    contents.push({ role: "user", parts: [{ text: "(Continue the interview.)" }] });
  }

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini request failed: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 500));
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  if (!text) throw new Error("Gemini returned an empty response");
  return {
    text,
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    },
    model,
  };
}

export function realGeminiClient(): GeminiClient {
  return { chat: geminiChat };
}

// ---------------------------------------------------------------------------
// ElevenLabs — TTS for agent questions
// ---------------------------------------------------------------------------

export type TtsResult = { bytes: Uint8Array; contentType: string; chars: number };

export interface TtsClient {
  synthesize(text: string): Promise<TtsResult>;
}

const DEFAULT_ELEVENLABS_VOICE = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" stock voice

export function elevenlabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function elevenlabsTts(text: string): Promise<TtsResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("elevenlabs");
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE;
  const res = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5",
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs request failed: HTTP ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType: "audio/mpeg", chars: text.length };
}

export function realTtsClient(): TtsClient {
  return { synthesize: elevenlabsTts };
}

// ---------------------------------------------------------------------------
// Deepgram — STT for student answers
// ---------------------------------------------------------------------------

export type SttSource = { url: string } | { bytes: Uint8Array; contentType: string };
export type SttResult = { text: string; seconds: number };

export interface SttClient {
  transcribe(source: SttSource): Promise<SttResult>;
}

export function deepgramConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

export const DEEPGRAM_MODEL = "nova-3";

/**
 * Transcribe one answer clip. Preferred source is a (presigned) URL so the
 * app tier never proxies audio bytes; raw bytes are accepted for tests.
 */
export async function deepgramTranscribe(source: SttSource): Promise<SttResult> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("deepgram");
  const endpoint = `https://api.deepgram.com/v1/listen?model=${DEEPGRAM_MODEL}&smart_format=true`;
  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers:
      "url" in source
        ? { authorization: `Token ${key}`, "content-type": "application/json" }
        : { authorization: `Token ${key}`, "content-type": source.contentType },
    body: "url" in source ? JSON.stringify({ url: source.url }) : (source.bytes as BodyInit),
  });
  if (!res.ok) {
    throw new Error(`Deepgram request failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    metadata?: { duration?: number };
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  return { text, seconds: json.metadata?.duration ?? 0 };
}

export function realSttClient(): SttClient {
  return { transcribe: deepgramTranscribe };
}
