import { isIP } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import {
  isPrivateAddress,
  safeFetch,
  safeFetchBytes,
  SafeFetchBlockedError,
  type LookupFn,
} from "@/lib/net/safe-fetch";
import { keyForScreenshot, putObject, s3Configured } from "@/lib/s3";
import { SCREENSHOT_BLOCKED, syncGalleryItem } from "@/lib/galleries";
import { lookup as dnsLookup } from "node:dns/promises";

// U11 — the screenshot.capture consumer: renders an app-type submission's
// appUrl in headless Chromium (1280x800) and stores a PNG at
// gallery/screenshots/{submissionId}.png.
//
// SSRF posture:
//   1. The appUrl itself is validated through the safe-fetch policy BEFORE
//      any browser launches; a blocked URL marks the item 'blocked' and stops.
//   2. Inside the browser, every request is intercepted and its host resolved
//      via a per-request DNS lookup (cached per host); requests to private/
//      reserved addresses — and non-http(s) schemes — are aborted.
//   Limits (documented deliberately): the browser performs its own DNS
//   resolution after our check, so the same lookup→connect TOCTOU window as
//   lib/net/safe-fetch applies (DNS rebinding within that window can slip
//   through); we also cache verdicts per host for the page's lifetime.
//   Accepted as a v1 trade-off consistent with the safe-fetch module.
//
// Fallback: when navigation fails, GET the HTML through safeFetchBytes,
// parse an og:image meta tag, and store those bytes (size-capped) instead.
// If that also fails the key stays null — the UI renders a placeholder card.
// A dead app link is already flagged on the grade by U9's link checks; this
// job never touches grades.

const NAV_TIMEOUT_MS = 15_000;
const HTML_CAP_BYTES = 512 * 1024;
const IMAGE_CAP_BYTES = 5 * 1024 * 1024;

// Minimal structural types so tests can inject a fake browser (and so this
// module never imports playwright statically — it is loaded lazily in the
// worker only).
export interface PageLike {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  route(
    pattern: string,
    handler: (route: {
      request(): { url(): string };
      abort(): Promise<void>;
      continue(): Promise<void>;
    }) => void | Promise<void>,
  ): Promise<void>;
  goto(url: string, opts: { timeout: number; waitUntil?: "load" }): Promise<unknown>;
  screenshot(opts: { type: "png" }): Promise<Uint8Array>;
}

export interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

export interface ScreenshotJobDeps {
  prisma?: PrismaClient;
  /** Browser seam — defaults to a lazy playwright chromium launch. */
  launchBrowser?: () => Promise<BrowserLike>;
  /** S3 seam. */
  s3?: {
    configured?: () => boolean;
    putObject?: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  };
  /** Network seams forwarded to safeFetch/safeFetchBytes and the router. */
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
}

async function defaultLaunch(): Promise<BrowserLike> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  return {
    newPage: async () => (await browser.newPage()) as unknown as PageLike,
    close: () => browser.close(),
  };
}

const defaultLookup: LookupFn = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

/**
 * Route policy for in-page subresources: http(s) only, and the resolved host
 * must be public. Verdicts are cached per host for this page.
 */
export function makeRoutePolicy(lookup: LookupFn) {
  const verdicts = new Map<string, Promise<boolean>>();
  const hostAllowed = (host: string): Promise<boolean> => {
    let p = verdicts.get(host);
    if (!p) {
      p = (async () => {
        if (isIP(host)) return !isPrivateAddress(host);
        try {
          const records = await lookup(host);
          return records.length > 0 && records.every((r) => !isPrivateAddress(r.address));
        } catch {
          return false;
        }
      })();
      verdicts.set(host, p);
    }
    return p;
  };
  return async (route: {
    request(): { url(): string };
    abort(): Promise<void>;
    continue(): Promise<void>;
  }) => {
    try {
      const url = new URL(route.request().url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return await route.abort();
      const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
      if (await hostAllowed(host)) return await route.continue();
      return await route.abort();
    } catch {
      return route.abort().catch(() => {});
    }
  };
}

/** Parse an og:image URL out of an HTML document (both attribute orders). */
export function parseOgImage(html: string): string | null {
  const m =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    );
  if (!m) return null;
  const url = m[1].trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Capture one submission's screenshot. Never throws for content problems —
 * only unexpected infrastructure errors propagate (pg-boss retries those).
 */
export async function handleScreenshotCapture(
  submissionId: string,
  deps: ScreenshotJobDeps = {},
): Promise<void> {
  const db = deps.prisma ?? defaultPrisma;
  const lookup = deps.lookup ?? defaultLookup;
  const put = deps.s3?.putObject ?? putObject;
  const configured = deps.s3?.configured ?? s3Configured;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { include: { assignmentType: true } } },
  });
  if (!submission || submission.assignment.assignmentType.slug !== "app") {
    console.warn(`[screenshot] ${submissionId}: not an app submission — skipping`);
    return;
  }
  const appUrl = (submission.fields as Record<string, unknown> | null)?.appUrl;
  if (typeof appUrl !== "string" || appUrl.trim() === "") {
    console.warn(`[screenshot] ${submissionId}: no appUrl — skipping`);
    return;
  }

  // The item may not exist yet (backfill order) — sync creates/moves it.
  const item = await syncGalleryItem(submissionId, { prisma: db });
  if (!item || item.submissionId !== submissionId) {
    console.warn(`[screenshot] ${submissionId}: no current gallery item — skipping`);
    return;
  }

  // 1. Policy gate FIRST: a private/reserved appUrl never reaches a browser.
  try {
    await safeFetch(appUrl, {
      method: "HEAD",
      timeoutMs: 8_000,
      fetchImpl: deps.fetchImpl,
      lookup,
    });
  } catch (err) {
    if (err instanceof SafeFetchBlockedError) {
      await db.galleryItem.update({
        where: { id: item.id },
        data: { screenshotS3Key: SCREENSHOT_BLOCKED },
      });
      console.warn(`[screenshot] ${submissionId}: blocked by policy — ${err.message}`);
      return;
    }
    // Network flake / HEAD rejection: not a policy block — carry on.
  }

  if (!configured()) {
    console.warn(`[screenshot] ${submissionId}: S3 not configured — skipping capture`);
    return;
  }

  const key = keyForScreenshot(submissionId);

  // 2. Real capture: headless chromium with the private-address route policy.
  let captured = false;
  try {
    const browser = await (deps.launchBrowser ?? defaultLaunch)();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.route("**/*", makeRoutePolicy(lookup));
      await page.goto(appUrl, { timeout: NAV_TIMEOUT_MS, waitUntil: "load" });
      const png = await page.screenshot({ type: "png" });
      await put(key, png, "image/png");
      captured = true;
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn(
      `[screenshot] ${submissionId}: browser capture failed — trying og:image`,
      err instanceof Error ? err.message : err,
    );
  }

  // 3. Fallback: og:image from the page HTML (policy-checked, size-capped).
  if (!captured) {
    try {
      const page = await safeFetchBytes(appUrl, {
        timeoutMs: 10_000,
        maxBytes: HTML_CAP_BYTES,
        fetchImpl: deps.fetchImpl,
        lookup,
      });
      const ogUrl = page.ok ? parseOgImage(new TextDecoder().decode(page.body)) : null;
      if (ogUrl) {
        const img = await safeFetchBytes(ogUrl, {
          timeoutMs: 10_000,
          maxBytes: IMAGE_CAP_BYTES,
          fetchImpl: deps.fetchImpl,
          lookup,
        });
        if (img.ok && img.body.length > 0 && !img.truncated) {
          await put(key, img.body, img.contentType ?? "image/png");
          captured = true;
        }
      }
    } catch (err) {
      console.warn(
        `[screenshot] ${submissionId}: og:image fallback failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (captured) {
    await db.galleryItem.update({
      where: { id: item.id },
      data: { screenshotS3Key: key },
    });
    console.log(`[screenshot] ${submissionId}: stored ${key}`);
  } else {
    // Leave the key as-is (null/previous) — the UI shows a placeholder card.
    console.warn(`[screenshot] ${submissionId}: no screenshot captured`);
  }
}
