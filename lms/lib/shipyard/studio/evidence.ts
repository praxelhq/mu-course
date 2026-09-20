import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { sourceEnabled } from "./settings";

export type Evidence = {
  id: string;
  source: string;
  title: string;
  url: string;
  capturedAt: string;
  text: string;
  type: string;
};
const cut = (s: unknown, n = 5000) => String(s ?? "").slice(0, n);
export function searchTerms(query: string) {
  return [...new Set(query.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) || [])]
    .filter(
      (w) =>
        ![
          "please",
          "brainstorm",
          "thinking",
          "something",
          "software",
          "project",
          "chat",
          "tell",
          "know",
          "make",
          "good",
          "small",
          "really",
          "start",
          "does",
          "they",
          "students",
          "student",
          "eight",
          "weeks",
          "first",
          "release",
          "narrow",
          "simplify",
          "biggest",
          "untested",
          "monetisation",
          "assumption",
          "assumptions",
          "evidence",
          "saved",
          "suggest",
          "compare",
          "which",
          "using",
          "develop",
          "research",
          "validate",
          "features",
          "this",
          "that",
          "with",
          "from",
          "have",
          "will",
          "what",
          "could",
          "would",
          "should",
          "idea",
          "want",
          "help",
          "build",
          "product",
          "need",
          "them",
          "their",
          "about",
          "into",
          "your",
        ].includes(w),
    )
    .slice(0, 16);
}
export async function knowledgeSearch(query: string): Promise<Evidence[]> {
  if (!(await sourceEnabled("market"))) return [];
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const q = terms.join(" | ");
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      source: string;
      title: string;
      url: string;
      capturedAt: Date;
      text: string;
    }>
  >`
    SELECT id, source, title, url, "capturedAt", left(text,6000) AS text FROM "ShipyardStudioKnowledge"
    WHERE to_tsvector('english',title || ' ' || text) @@ to_tsquery('english',${q})
    ORDER BY ts_rank_cd(to_tsvector('english',title || ' ' || text),to_tsquery('english',${q})) DESC LIMIT 12`;
  return rows.map((r) => ({
    ...r,
    capturedAt: r.capturedAt.toISOString(),
    type: "marketplace observation; seller claims are unverified",
  }));
}
async function readJson(url: string, init?: RequestInit, timeoutMs = 25000) {
  const r = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
  if (!r.ok) throw new Error(`Source returned HTTP ${r.status}`);
  const length = Number(r.headers.get("content-length") || 0);
  if (length > 5_000_000) throw new Error("Source response exceeded limit");
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Empty source response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 5_000_000) {
      await reader.cancel();
      throw new Error("Source response exceeded limit");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function appRillSearch(
  query: string,
  options?: { listingsOnly?: boolean; timeoutMs?: number },
): Promise<Evidence[]> {
  const response = await readJson(
    `https://apprill.app/api/apps?q=${encodeURIComponent(query)}&page_size=6`,
    undefined,
    options?.timeoutMs,
  );
  const items = Array.isArray(response.items) ? response.items.slice(0, 6) : [];
  const results: Evidence[] = [];
  for (const app of items) {
    if (typeof app.slug !== "string") continue;
    const fields = {
      name: app.name,
      category: app.category_name,
      platform: app.platform,
      publisher: app.publisher_name,
      price: app.price,
      currency: app.currency,
      rating: app.rating,
      rating_count: app.rating_count,
      store_url: app.store_url,
      installs_text: app.installs_text,
    };
    results.push({
      id: `apprill:${app.slug}`,
      source: "AppRill",
      title: cut(app.name, 160),
      url: `https://apprill.app/apps/${encodeURIComponent(app.slug)}`,
      capturedAt: app.last_refreshed_at || new Date().toISOString(),
      text: JSON.stringify(fields),
      type: "observed store listing; ratings and installs do not prove willingness to pay",
    });
    if (!options?.listingsOnly && results.length <= 4) {
      try {
        const reviews = await readJson(
          `https://apprill.app/api/apps/${encodeURIComponent(app.slug)}/reviews?page_size=8`,
        );
        const rows = reviews.items || reviews.reviews || [];
        if (rows.length)
          results.push({
            id: `apprill-reviews:${app.slug}`,
            source: "AppRill reviews",
            title: `Customer reviews · ${cut(app.name, 140)}`,
            url: `https://apprill.app/apps/${encodeURIComponent(app.slug)}`,
            capturedAt: new Date().toISOString(),
            text: cut(JSON.stringify(rows), 6500),
            type: "sample of customer reviews; selection bias and capture gaps apply",
          });
      } catch {
        /* Listings remain usable when the reviews endpoint is unavailable. */
      }
    }
  }
  return results;
}
export function actorRequest(source: string, query: string, target: string) {
  if (source === "reddit")
    return {
      actor: "reddit-scraper",
      input: {
        queries: [query],
        maxResults: 12,
        includeComments: true,
        maxCommentsPerPost: 5,
        maxConcurrency: 1,
      },
    };
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    throw new Error("Provide a public post URL for this source.");
  }
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error("Provide a public HTTPS post URL.");
  if (
    source === "x" &&
    ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
      u.hostname,
    ) &&
    /^\/[^/]+\/status\/\d+\/?$/.test(u.pathname)
  )
    return {
      actor: "twitter-scraper",
      input: { tweetUrls: [target], maxTweetsPerUser: 12 },
    };
  if (
    source === "instagram" &&
    ["instagram.com", "www.instagram.com"].includes(u.hostname) &&
    /^\/(p|reel)\/[-_A-Za-z0-9]+\/?$/.test(u.pathname)
  )
    return {
      actor: "instagram-comment-scraper",
      input: { urls: [target], maxResults: 30 },
    };
  throw new Error(
    "Use a public X post or Instagram post/reel URL matching the selected source.",
  );
}
export async function socialResearch(
  jobId: string,
  source: string,
  query: string,
  target: string,
): Promise<{ evidence: Evidence[]; costUsd: number; notes: string[] }> {
  const token = process.env.SHIPYARD_APIFY_TOKEN;
  if (!token) throw new Error("Social research is not configured.");
  const request = actorRequest(source, query, target),
    prefix = process.env.SHIPYARD_APIFY_ACTOR_PREFIX || "thirdwatch";
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const job = await prisma.shipyardStudioJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  const saved = job.result as { runId?: string } | null;
  let runId = saved?.runId;
  if (!runId) {
    // An interrupted POST must never silently launch a second paid run.
    await prisma.shipyardStudioJob.update({
      where: { id: jobId },
      data: { result: { launching: true } },
    });
    const launched = await readJson(
      `https://api.apify.com/v2/acts/${prefix}~${request.actor}/runs?timeout=120&memory=512&maxTotalChargeUsd=0.5`,
      { method: "POST", headers, body: JSON.stringify(request.input) },
    );
    runId = launched.data?.id;
    if (!runId) throw new Error("Research run did not return an ID.");
    await prisma.shipyardStudioJob.update({
      where: { id: jobId },
      data: { result: { runId } },
    });
  }
  let run;
  const deadline = Date.now() + 160000;
  while (Date.now() < deadline) {
    const current = await prisma.shipyardStudioJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { status: true },
    });
    if (current.status === "cancelled") {
      await fetch(`https://api.apify.com/v2/actor-runs/${runId}/abort`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);
      return {
        evidence: [],
        costUsd: 0,
        notes: [
          "Cancelled. The provider may still charge for work already performed.",
        ],
      };
    }
    run = (
      await readJson(
        `https://api.apify.com/v2/actor-runs/${runId}?waitForFinish=10`,
        { headers },
      )
    ).data;
    if (!["READY", "RUNNING"].includes(run.status)) break;
  }
  if (!run || !["SUCCEEDED", "TIMED-OUT"].includes(run.status))
    throw new Error(
      "The source could not complete this research. Try another source or a public post.",
    );
  const rows = await readJson(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?limit=40&clean=true`,
    { headers },
  );
  const evidence: Evidence[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const url =
      row.url || row.postUrl || row.tweetUrl || row.post_url || target;
    if (typeof url !== "string" || !/^https:\/\//.test(url)) continue;
    const text = cut(
      row.text || row.body || row.content || row.comment || JSON.stringify(row),
      6500,
    );
    if (!text || /login_wall|login required|not_found/.test(text.slice(0, 150)))
      continue;
    evidence.push({
      id: `${source}:${createHash("sha256")
        .update(url + text)
        .digest("hex")
        .slice(0, 20)}`,
      source,
      title: cut(row.title || row.text || `${source} discussion`, 140),
      url,
      capturedAt: new Date().toISOString(),
      text,
      type: "public conversation sample; anecdotal, not proof of payment",
    });
  }
  return {
    evidence,
    costUsd: Number(run.usageTotalUsd || 0),
    notes: evidence.length
      ? [
          `Sampled ${evidence.length} items. This is not a representative market survey.`,
        ]
      : [
          "No usable public evidence was returned. An empty result does not invalidate the idea.",
        ],
  };
}
export async function cacheEvidence(rows: Evidence[]) {
  // Social conversations stay within the requesting workspace job; only public app catalog records join the reusable knowledge base.
  for (const row of rows.filter((r) => r.source.startsWith("AppRill"))) {
    await prisma.shipyardStudioKnowledge.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        source: row.source,
        title: row.title,
        url: row.url,
        capturedAt: new Date(row.capturedAt),
        text: row.text,
        data: row as unknown as Prisma.InputJsonValue,
      },
      update: {
        text: row.text,
        capturedAt: new Date(row.capturedAt),
        data: row as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
