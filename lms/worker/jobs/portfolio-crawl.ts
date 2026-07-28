import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/db";
import { gatherCrawlUrls, type CrawledLink, type LastCrawl } from "../../lib/portfolio";
import {
  safeFetch,
  SafeFetchBlockedError,
  type SafeFetchOptions,
} from "../../lib/net/safe-fetch";

// U16 — the portfolio link-liveness crawl ('portfolio.crawl' consumer).
// For each student: gather every claimed URL (portfolio external links +
// link-kind submission fields), probe each through lib/net/safe-fetch (the
// SSRF policy module — a private-IP/blocked link is recorded ok:false WITHOUT
// any connection being made), and write PortfolioEntry.lastCrawl per the
// EXACT evidence-integrity contract shared with lib/scoring/assemble:
//   { checkedAt: ISO string, links: [{ url, ok, status? }] }
// Probes are HEAD-first (GET on 405/501 — some hosts refuse HEAD), with a
// small concurrency of 3 per student. No CostLog rows: no AI is involved.

const LINK_CONCURRENCY = 3;
const PROBE_TIMEOUT_MS = 8_000;

export type CrawlDeps = {
  /** DI seams for tests — forwarded into safeFetch. */
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  lookup?: SafeFetchOptions["lookup"];
  db?: PrismaClient;
};

async function probe(url: string, deps: CrawlDeps): Promise<CrawledLink> {
  const base: SafeFetchOptions = {
    timeoutMs: PROBE_TIMEOUT_MS,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.lookup ? { lookup: deps.lookup } : {}),
  };
  try {
    let res = await safeFetch(url, { ...base, method: "HEAD" });
    if (res.status === 405 || res.status === 501) {
      res = await safeFetch(url, { ...base, method: "GET" });
    }
    return { url, ok: res.ok, status: res.status };
  } catch (err) {
    // SafeFetchBlockedError (private address, bad scheme, DNS failure) and
    // network/timeout errors all record a dead link; blocked URLs never got a
    // connection at all — that's the policy, not an accident.
    if (!(err instanceof SafeFetchBlockedError)) {
      // timeouts/aborts/conn-refused — still just a dead link.
    }
    return { url, ok: false };
  }
}

/** Crawl every claimed URL for one student and return the lastCrawl JSON. */
export async function crawlLinksForUser(userId: string, deps: CrawlDeps = {}): Promise<LastCrawl> {
  const urls = await gatherCrawlUrls(userId);
  const results = new Array<CrawledLink>(urls.length);
  let next = 0;
  async function workerLoop() {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      results[i] = await probe(urls[i], deps);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(LINK_CONCURRENCY, urls.length) }, () => workerLoop()),
  );
  return { checkedAt: new Date().toISOString(), links: results };
}

/** Crawl one student and persist lastCrawl (entry created when absent). */
export async function crawlPortfolioForUser(userId: string, deps: CrawlDeps = {}): Promise<LastCrawl> {
  const db = deps.db ?? prisma;
  const lastCrawl = await crawlLinksForUser(userId, deps);
  await db.portfolioEntry.upsert({
    where: { userId },
    create: {
      userId,
      links: { external: [] } as Prisma.InputJsonValue,
      validations: [] as unknown as Prisma.InputJsonValue,
      lastCrawl: lastCrawl as unknown as Prisma.InputJsonValue,
    },
    update: { lastCrawl: lastCrawl as unknown as Prisma.InputJsonValue },
  });
  return lastCrawl;
}

/**
 * The 'portfolio.crawl' job handler: {userId} crawls one student, {all:true}
 * crawls every student serially (each student's links probed 3 at a time).
 */
export async function handlePortfolioCrawl(
  data: { userId?: string; all?: boolean },
  deps: CrawlDeps = {},
): Promise<{ crawled: number }> {
  const db = deps.db ?? prisma;
  if (data.userId) {
    const user = await db.user.findUnique({ where: { id: data.userId }, select: { id: true } });
    if (!user) {
      console.warn(`[portfolio-crawl] unknown user ${data.userId} — nothing to do`);
      return { crawled: 0 };
    }
    await crawlPortfolioForUser(data.userId, deps);
    return { crawled: 1 };
  }
  if (data.all) {
    const students = await db.user.findMany({
      where: { role: "student" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    for (const s of students) {
      await crawlPortfolioForUser(s.id, deps);
    }
    return { crawled: students.length };
  }
  console.warn("[portfolio-crawl] job carried neither userId nor all:true — ignored");
  return { crawled: 0 };
}
