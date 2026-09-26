import { selectRelevantLinks, validatePublicUrl } from "./url-policy";

export type EvidencePage = { url: string; title: string; markdown: string };

type FirecrawlResponse = {
  success?: boolean;
  data?: { markdown?: string; links?: string[]; metadata?: { sourceURL?: string; url?: string; title?: string } };
};

type ExaResponse = {
  results?: Array<{ url?: string; title?: string; text?: string }>;
};

async function scrape(url: string, signal: AbortSignal): Promise<FirecrawlResponse["data"]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Firecrawl is not configured.");
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: true, timeout: 25_000 }),
    signal,
  });
  if (!response.ok) throw new Error(`Firecrawl returned ${response.status}.`);
  const payload = (await response.json()) as FirecrawlResponse;
  if (!payload.success || !payload.data?.markdown) throw new Error("Firecrawl returned no usable content.");
  return payload.data;
}

async function normalizePages(source: URL, candidates: Array<{ url?: string; title?: string; markdown?: string }>): Promise<EvidencePage[]> {
  const pages: EvidencePage[] = [];
  let totalCharacters = 0;
  for (const page of candidates.slice(0, 6)) {
    const acceptedUrl = await validatePublicUrl(page.url ?? source.toString(), source.hostname);
    const markdown = (page.markdown ?? "").slice(0, 24_000);
    if (!markdown || totalCharacters + markdown.length > 80_000) continue;
    totalCharacters += markdown.length;
    pages.push({ url: acceptedUrl.toString(), title: page.title?.slice(0, 180) ?? acceptedUrl.hostname, markdown });
  }
  if (pages.length === 0) throw new Error("No safe product evidence was returned.");
  return pages;
}

async function extractWithFirecrawl(source: URL, signal: AbortSignal): Promise<EvidencePage[]> {
  const home = await scrape(source.toString(), signal);
  const discovered = selectRelevantLinks(source, home?.links ?? [], 5);
  const remaining = await Promise.allSettled(discovered.map(async (url) => ({ url, page: await scrape(url, signal) })));
  const candidates = [
    { url: home?.metadata?.sourceURL ?? home?.metadata?.url ?? source.toString(), title: home?.metadata?.title, markdown: home?.markdown },
    ...remaining.flatMap((result) => result.status === "fulfilled"
      ? [{ url: result.value.page?.metadata?.sourceURL ?? result.value.page?.metadata?.url ?? result.value.url, title: result.value.page?.metadata?.title, markdown: result.value.page?.markdown }]
      : []),
  ];
  return normalizePages(source, candidates);
}

async function extractWithExa(source: URL, signal: AbortSignal): Promise<EvidencePage[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("Exa is not configured.");
  const response = await fetch("https://api.exa.ai/contents", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      urls: [source.toString()],
      text: { verbosity: "standard", maxCharacters: 24_000, excludeSections: ["navigation", "footer", "sidebar"] },
      maxAgeHours: 24,
      subpages: 5,
      subpageTarget: ["features", "product", "pricing", "solutions", "docs"],
      livecrawlTimeout: 25_000,
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Exa returned ${response.status}.`);
  const payload = (await response.json()) as ExaResponse;
  return normalizePages(source, (payload.results ?? []).map((result) => ({ url: result.url, title: result.title, markdown: result.text })));
}

export async function extractProductEvidence(rawUrl: string): Promise<EvidencePage[]> {
  const source = await validatePublicUrl(rawUrl);
  const runWithTimeout = async (run: (signal: AbortSignal) => Promise<EvidencePage[]>): Promise<EvidencePage[]> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  let firecrawlError: unknown;
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      return await runWithTimeout((signal) => extractWithFirecrawl(source, signal));
    } catch (error) {
      firecrawlError = error;
    }
  }
  if (process.env.EXA_API_KEY) return runWithTimeout((signal) => extractWithExa(source, signal));
  if (firecrawlError instanceof Error) throw firecrawlError;
  throw new Error("Evidence extraction is not configured.");
}
