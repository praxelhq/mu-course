// U9 — the ONLY Gemini-embedding module. Anthropic (the pinned grader) has no
// embeddings endpoint; the Gemini key already exists in the voice stack (see
// docs/DECISIONS.md). REST is used directly — no SDK dependency. The endpoint
// is a fixed trusted URL (never user-supplied), so safe-fetch is not required.

export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

export function geminiEmbeddingsConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type Embedder = (text: string) => Promise<number[]>;

export interface EmbedOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

/** Embed one text via the Gemini embeddings REST API. Throws on API errors. */
export async function embedText(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = opts.model ?? GEMINI_EMBEDDING_MODEL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8_000) }] } }),
  });
  if (!res.ok) {
    throw new Error(`Gemini embeddings HTTP ${res.status}`);
  }
  const body = (await res.json()) as { embedding?: { values?: number[] } };
  const values = body.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini embeddings: empty response");
  }
  return values;
}

/** Cosine similarity; 0 for empty or mismatched-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
