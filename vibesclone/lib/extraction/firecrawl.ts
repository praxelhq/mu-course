import { selectRelevantLinks, validatePublicUrl } from "./url-policy";

export type EvidencePage = { url: string; title: string; markdown: string };

type FirecrawlResponse = {
  success?: boolean;
  data?: { markdown?: string; links?: string[]; metadata?: { sourceURL?: string; url?: string; title?: string } };
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

export async function extractProductEvidence(rawUrl: string): Promise<EvidencePage[]> {
  const source = await validatePublicUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const home = await scrape(source.toString(), controller.signal);
    const discovered = selectRelevantLinks(source, home?.links ?? [], 5);
    const remaining = await Promise.allSettled(discovered.map((url) => scrape(url, controller.signal)));
    const candidates = [home, ...remaining.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))];
    const pages: EvidencePage[] = [];
    let totalCharacters = 0;
    for (const page of candidates) {
      const returnedUrl = page?.metadata?.sourceURL ?? page?.metadata?.url ?? source.toString();
      const acceptedUrl = await validatePublicUrl(returnedUrl, source.hostname);
      const markdown = (page?.markdown ?? "").slice(0, 24_000);
      if (!markdown || totalCharacters + markdown.length > 80_000) continue;
      totalCharacters += markdown.length;
      pages.push({ url: acceptedUrl.toString(), title: page?.metadata?.title?.slice(0, 180) ?? acceptedUrl.hostname, markdown });
    }
    if (pages.length === 0) throw new Error("No safe product evidence was returned.");
    return pages;
  } finally {
    clearTimeout(timeout);
  }
}
