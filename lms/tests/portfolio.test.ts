import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import type { Prisma } from "@prisma/client";
import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";
import { getGradeLine } from "../lib/scoring/assemble";
import { gatherCrawlUrls, parseValidations } from "../lib/portfolio";
import { crawlPortfolioForUser } from "../worker/jobs/portfolio-crawl";
import type { LookupFn } from "../lib/net/safe-fetch";

// U16 — portfolio: the liveness crawl (DI'd fetch, exact lastCrawl contract,
// evidence-integrity integration with the U15 scorer, private-IP policy), the
// own-entry-only portfolio API, and the instructor validation append.
//
// Seed facts used:
//   user_s001 owns pf_user_s001 (external link github.com/praxel-mu/user_s001)
//   and two SUBMITTED skill submissions with skillLink fields:
//   sub_001 → https://skills.praxel.in/sub_001 (graded, v1)
//   sub_041_v2 → https://skills.praxel.in/sub_041_v2 (graded, v2)
//   user_s025 owns pf_user_s025 and has no submissions of her own.

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect();
  }
}

const live = await dbReachable();

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];

describe.skipIf(!live)("U16 portfolio (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma?.$disconnect();
  });

  // --- crawl ---------------------------------------------------------------

  it("gathers portfolio links plus link-kind submission fields", async () => {
    const urls = await gatherCrawlUrls("user_s001");
    expect(urls).toContain("https://github.com/praxel-mu/user_s001");
    expect(urls).toContain("https://skills.praxel.in/sub_001");
    expect(urls).toContain("https://skills.praxel.in/sub_041_v2");
    expect(urls).toHaveLength(3);
  });

  it("crawls mixed ok/dead links, writes the EXACT lastCrawl contract, and feeds evidence integrity ok/total×15", async () => {
    const before = await getGradeLine("user_s001");
    const beforePortfolio = before.lines.find((l) => l.key === "portfolio")!;

    const calls: { url: string; method: string }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (url.includes("sub_001")) return new Response(null, { status: 404 });
      if (url.includes("sub_041_v2")) {
        // This host refuses HEAD — the crawler must retry with GET.
        return method === "HEAD"
          ? new Response(null, { status: 405 })
          : new Response("ok", { status: 200 });
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const result = await crawlPortfolioForUser("user_s001", {
      fetchImpl,
      lookup: publicLookup,
    });

    // Exact contract: { checkedAt: ISO string, links: [{url, ok, status?}] }.
    expect(Object.keys(result).sort()).toEqual(["checkedAt", "links"]);
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
    expect(result.links).toHaveLength(3);
    for (const link of result.links) {
      expect(typeof link.url).toBe("string");
      expect(typeof link.ok).toBe("boolean");
    }
    const byUrl = new Map(result.links.map((l) => [l.url, l]));
    expect(byUrl.get("https://github.com/praxel-mu/user_s001")).toEqual({
      url: "https://github.com/praxel-mu/user_s001",
      ok: true,
      status: 200,
    });
    expect(byUrl.get("https://skills.praxel.in/sub_001")).toEqual({
      url: "https://skills.praxel.in/sub_001",
      ok: false,
      status: 404,
    });
    expect(byUrl.get("https://skills.praxel.in/sub_041_v2")).toEqual({
      url: "https://skills.praxel.in/sub_041_v2",
      ok: true,
      status: 200,
    });
    // The 405 host was probed HEAD first, then GET.
    const v2Calls = calls.filter((c) => c.url.includes("sub_041_v2")).map((c) => c.method);
    expect(v2Calls).toEqual(["HEAD", "GET"]);

    // Persisted verbatim.
    const entry = await prisma.portfolioEntry.findUniqueOrThrow({
      where: { userId: "user_s001" },
    });
    expect(entry.lastCrawl).toEqual(result);

    // Evidence integrity in the assembled grade line: 2 of 3 ok → 2/3 × 15.
    const after = await getGradeLine("user_s001");
    const afterPortfolio = after.lines.find((l) => l.key === "portfolio")!;
    expect(afterPortfolio.raw! - (beforePortfolio.raw ?? 0)).toBeCloseTo((2 / 3) * 15, 2);
  });

  it("records a private-IP link as ok:false (no status) WITHOUT fetching it — the SSRF policy", async () => {
    await prisma.portfolioEntry.update({
      where: { userId: "user_s025" },
      data: {
        links: {
          external: [{ label: "internal", url: "http://10.9.9.9/secret" }],
        } as Prisma.InputJsonValue,
      },
    });

    const fetched: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      fetched.push(String(input));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const result = await crawlPortfolioForUser("user_s025", {
      fetchImpl,
      lookup: publicLookup,
    });
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toEqual({ url: "http://10.9.9.9/secret", ok: false });
    expect("status" in result.links[0]).toBe(false);
    expect(fetched.filter((u) => u.includes("10.9.9.9"))).toHaveLength(0);
  });

  // --- portfolio API (own entry only) --------------------------------------

  function postPortfolio(userId: string | null, body: unknown) {
    return import("../app/api/portfolio/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/portfolio", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(userId ? { cookie: `${TEST_LOGIN_COOKIE}=${userId}` } : {}),
          },
          body: JSON.stringify(body),
        }),
      ),
    );
  }

  it("rejects an unauthenticated save (401) and malformed links (422)", async () => {
    expect((await postPortfolio(null, { narrative: "x" })).status).toBe(401);
    const bad = await postPortfolio("user_s002", {
      links: [{ label: "x", url: "javascript:alert(1)" }],
    });
    expect(bad.status).toBe(422);
  });

  it("saves narrative + links to the CALLER'S entry only — student B cannot write A's", async () => {
    const s001Before = await prisma.portfolioEntry.findUniqueOrThrow({
      where: { userId: "user_s001" },
    });

    const res = await postPortfolio("user_s002", {
      narrative: "My term in three artifacts.",
      links: [{ label: "GitHub", url: "https://github.com/example/s002" }],
    });
    expect(res.status).toBe(200);

    const s002 = await prisma.portfolioEntry.findUniqueOrThrow({ where: { userId: "user_s002" } });
    expect(s002.narrative).toBe("My term in three artifacts.");
    expect(s002.links).toMatchObject({
      external: [{ label: "GitHub", url: "https://github.com/example/s002" }],
    });

    // s001's entry is untouched — the route has no way to name another user.
    const s001After = await prisma.portfolioEntry.findUniqueOrThrow({
      where: { userId: "user_s001" },
    });
    expect(s001After.narrative).toBe(s001Before.narrative);
    expect(s001After.links).toEqual(s001Before.links);
  });

  it("preserves non-external keys already stored in the links JSON (seeded submissions list)", async () => {
    const before = await prisma.portfolioEntry.findUniqueOrThrow({ where: { userId: "user_s001" } });
    const seededSubmissions = (before.links as { submissions?: string[] }).submissions;
    expect(Array.isArray(seededSubmissions)).toBe(true);

    const res = await postPortfolio("user_s001", {
      links: [{ label: "New", url: "https://example.com/new" }],
    });
    expect(res.status).toBe(200);
    const after = await prisma.portfolioEntry.findUniqueOrThrow({ where: { userId: "user_s001" } });
    expect((after.links as { submissions?: string[] }).submissions).toEqual(seededSubmissions);
    expect((after.links as { external?: unknown }).external).toEqual([
      { label: "New", url: "https://example.com/new" },
    ]);
  });

  // --- instructor validation append ----------------------------------------

  function postValidation(userId: string | null, body: unknown) {
    return import("../app/api/instructor/validations/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/instructor/validations", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(userId ? { cookie: `${TEST_LOGIN_COOKIE}=${userId}` } : {}),
          },
          body: JSON.stringify(body),
        }),
      ),
    );
  }

  it("a student cannot record validations (403); unknown student is 404", async () => {
    const forbidden = await postValidation("user_s001", {
      userId: "user_s003",
      kind: "external",
      note: "nope",
    });
    expect(forbidden.status).toBe(403);
    const unknown = await postValidation("user_instructor", {
      userId: "user_does_not_exist",
      kind: "external",
      note: "x",
    });
    expect(unknown.status).toBe(404);
  });

  it("instructor validation appends {kind, by, note, at} and is AuditLogged", async () => {
    const res = await postValidation("user_instructor", {
      userId: "user_s003",
      kind: "external",
      note: "Ops manager confirmed the automation is in weekly use.",
    });
    expect(res.status).toBe(200);

    const entry = await prisma.portfolioEntry.findUniqueOrThrow({ where: { userId: "user_s003" } });
    const validations = parseValidations(entry.validations);
    expect(validations).toHaveLength(1);
    expect(validations[0]).toMatchObject({
      kind: "external",
      by: "instructor@praxel.in",
      note: "Ops manager confirmed the automation is in weekly use.",
    });
    expect(new Date(validations[0].at).toISOString()).toBe(validations[0].at);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "validation-added", targetType: "portfolio", targetId: "user_s003" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe("user_instructor");
  });
});
