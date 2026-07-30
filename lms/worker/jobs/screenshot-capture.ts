import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { writeGeneratedObject } from "@/lib/generated-object-reservations";
import {
  safeFetch,
  safeFetchBytes,
  safeFetchResource,
  SafeFetchBlockedError,
  type LookupFn,
} from "@/lib/net/safe-fetch";
import {
  keyForReservedScreenshot,
  putObject,
  s3Configured,
  type PutObjectReceipt,
} from "@/lib/s3";
import {
  EXTERNAL_FINGERPRINT_PREFIX,
  SCREENSHOT_BLOCKED,
  syncGalleryItem,
} from "@/lib/galleries";
import { lookup as dnsLookup } from "node:dns/promises";
import {
  parsePublicationPolicy,
} from "@/lib/publication-policy";

// The screenshot.capture consumer: renders an app-type submission's
// appUrl in headless Chromium (1280x800) and stores a PNG at
// gallery/screenshots/{submissionId}.png.
//
// SSRF posture:
//   1. The appUrl itself is validated through the safe-fetch policy BEFORE
//      any browser launches; a blocked URL marks the item 'blocked' and stops.
//   2. Chromium has direct hostname resolution disabled. Every GET is
//      intercepted, resolved and connection-pinned by safeFetchResource, then
//      supplied to the page via route.fulfill. Private/reserved addresses,
//      redirects to them, non-http(s), writes, WebSockets, service workers and
//      interception misses fail closed without browser egress.
//
// Fallback: when navigation fails, GET the HTML through safeFetchBytes,
// parse an og:image meta tag, and store those bytes (size-capped) instead.
// If that also fails the key stays null — the UI renders a placeholder card.
// A dead app link is already flagged on the grade by U9's link checks; this
// job never touches grades.

const NAV_TIMEOUT_MS = 15_000;
const HTML_CAP_BYTES = 512 * 1024;
const IMAGE_CAP_BYTES = 5 * 1024 * 1024;
const BROWSER_RESOURCE_CAP_BYTES = 8 * 1024 * 1024;
const BROWSER_PAGE_BUDGET_BYTES = 25 * 1024 * 1024;
const BROWSER_RESOURCE_LIMIT = 64;
const BROWSER_PAGE_BUDGET_MS = NAV_TIMEOUT_MS;

const SAFE_BROWSER_RESPONSE_HEADERS = new Set([
  "access-control-allow-origin",
  "cache-control",
  "content-language",
  "content-security-policy",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "etag",
  "last-modified",
  "timing-allow-origin",
  "vary",
  "x-content-type-options",
]);

function browserResponseHeaders(
  headers: Record<string, string>,
  contentType: string | null,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (SAFE_BROWSER_RESPONSE_HEADERS.has(normalized)) safe[normalized] = value;
  }
  if (contentType) safe["content-type"] = contentType;
  // Never forward Set-Cookie, WWW-Authenticate, Location or body transfer
  // metadata. Playwright computes the body length and decoded representation.
  return safe;
}

export function fingerprintExternalPublicationContent(args: {
  finalUrl: string;
  contentType: string | null;
  body: Uint8Array;
}): string {
  const digest = createHash("sha256")
    .update(args.finalUrl)
    .update("\0")
    .update(args.contentType ?? "")
    .update("\0")
    .update(args.body)
    .digest("hex");
  return `${EXTERNAL_FINGERPRINT_PREFIX}${digest}`;
}

// Minimal structural types so tests can inject a fake browser (and so this
// module never imports playwright statically — it is loaded lazily in the
// worker only).
export interface PageLike {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  route(
    pattern: string,
    handler: (route: {
      request(): { url(): string; method(): string };
      abort(): Promise<void>;
      fulfill(options: {
        status: number;
        headers: Record<string, string>;
        body: Buffer;
      }): Promise<void>;
    }) => void | Promise<void>,
  ): Promise<void>;
  routeWebSocket?(
    pattern: string,
    handler: (route: {
      close(options?: { code?: number; reason?: string }): Promise<void>;
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
    putObject?: (
      key: string,
      body: Uint8Array,
      contentType: string,
    ) => Promise<PutObjectReceipt>;
  };
  /** Full lifecycle seam; tests can model reserve/attach without a real DB. */
  writeGeneratedObject?: typeof writeGeneratedObject;
  /** Network seams forwarded to safeFetch/safeFetchBytes and the router. */
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
  /** Projection seam; staging remains authoritative if materialization is delayed. */
  syncProjection?: (submissionId: string) => Promise<void>;
}

async function defaultLaunch(): Promise<BrowserLike> {
  const { chromium } = await import("playwright");
  // Browser network is fail-closed. HTTP(S) bytes are supplied only through
  // the route.fulfill proxy below; direct DNS/socket attempts (including
  // WebSockets or an interception miss) resolve to nowhere.
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP * ~NOTFOUND", "--disable-quic"],
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  return {
    newPage: async () => (await context.newPage()) as unknown as PageLike,
    close: () => browser.close(),
  };
}

const defaultLookup: LookupFn = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

/**
 * Browser egress proxy. Every request is fetched through safeFetchResource,
 * whose request-scoped Undici agent connects only to the validated address.
 * Chromium never resolves or connects to the destination itself.
 */
export function makeRoutePolicy(args: {
  lookup: LookupFn;
  fetchImpl?: typeof fetch;
  onIncomplete?: (reason: string) => void;
  now?: () => number;
}) {
  const now = args.now ?? Date.now;
  const deadlineAt = now() + BROWSER_PAGE_BUDGET_MS;
  let remainingBytes = BROWSER_PAGE_BUDGET_BYTES;
  let remainingRequests = BROWSER_RESOURCE_LIMIT;
  const abortIncomplete = async (
    route: { abort(): Promise<void> },
    reason: string,
  ): Promise<void> => {
    args.onIncomplete?.(reason);
    await route.abort();
  };
  return async (route: {
    request(): { url(): string; method(): string };
    abort(): Promise<void>;
    fulfill(options: {
      status: number;
      headers: Record<string, string>;
      body: Buffer;
    }): Promise<void>;
  }) => {
    try {
      const url = new URL(route.request().url());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return await abortIncomplete(route, `blocked scheme ${url.protocol}`);
      }
      const method = route.request().method().toUpperCase();
      // The renderer is read-only. HEAD responses cannot correctly hydrate a
      // browser resource, and POST/PUT/etc. must never leave the worker.
      if (method !== "GET") {
        return await abortIncomplete(route, `blocked browser method ${method}`);
      }
      const remainingMs = deadlineAt - now();
      if (remainingRequests <= 0 || remainingBytes <= 0 || remainingMs <= 0) {
        return await abortIncomplete(route, "browser page budget exhausted");
      }
      remainingRequests -= 1;
      const reservation = Math.min(BROWSER_RESOURCE_CAP_BYTES, remainingBytes);
      remainingBytes -= reservation;
      try {
        const response = await safeFetchResource(url.toString(), {
          method,
          timeoutMs: Math.min(10_000, remainingMs),
          maxBytes: reservation,
          lookup: args.lookup,
          fetchImpl: args.fetchImpl,
        });
        remainingBytes += reservation - response.body.byteLength;
        if (now() > deadlineAt) {
          return await abortIncomplete(route, "browser page time budget exhausted");
        }

        // safeFetchResource validates every redirect hop. Send the browser a
        // synthetic redirect so its document URL/base becomes the validated
        // final URL; otherwise relative assets would resolve against the stale
        // intercepted URL. The next hop is intercepted and pinned again.
        if (new URL(response.finalUrl).href !== url.href) {
          return await route.fulfill({
            status: 302,
            headers: { location: response.finalUrl, "cache-control": "no-store" },
            body: Buffer.alloc(0),
          });
        }
        return await route.fulfill({
          status: response.status,
          headers: browserResponseHeaders(response.headers, response.contentType),
          body: Buffer.from(response.body),
        });
      } catch {
        // A failed request may already have consumed up to its reserved bytes;
        // keep the reservation spent so repeated failures cannot evade the
        // whole-page budget.
        return await abortIncomplete(route, "browser resource fetch blocked or incomplete");
      }
    } catch {
      args.onIncomplete?.("invalid browser resource request");
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
  const writeObject = deps.writeGeneratedObject ?? writeGeneratedObject;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: { include: { assignmentType: true } },
      assessmentVersion: { select: { publicationPolicy: true } },
      assessmentResult: { select: { publishable: true } },
      publicationDecision: {
        select: {
          id: true,
          ownerConsent: true,
          ownerRevokedAt: true,
          instructorState: true,
          reviewedFingerprint: true,
          previewS3Key: true,
          previewS3VersionId: true,
        },
      },
    },
  });
  if (!submission) {
    console.warn(`[screenshot] ${submissionId}: submission missing — skipping`);
    return;
  }
  const versioned = submission.assessmentVersionId !== null;
  const publicationPolicy = versioned
    ? parsePublicationPolicy(submission.assessmentVersion?.publicationPolicy)
    : null;
  if (!versioned && submission.assignment.assignmentType.slug !== "app") {
    console.warn(`[screenshot] ${submissionId}: not an app submission — skipping`);
    return;
  }
  if (versioned && !publicationPolicy) {
    console.warn(`[screenshot] ${submissionId}: invalid publication policy — skipping`);
    return;
  }
  if (
    versioned &&
    (!submission.assessmentResult?.publishable ||
      !submission.publicationDecision?.ownerConsent ||
      submission.publicationDecision.ownerRevokedAt ||
      (submission.publicationDecision.instructorState !== "pending" &&
        submission.publicationDecision.instructorState !== "approved"))
  ) {
    console.warn(`[screenshot] ${submissionId}: publication policy not active — skipping`);
    return;
  }
  const fields = (submission.fields as Record<string, unknown> | null) ?? {};
  const fingerprintAction = publicationPolicy?.actions.find(
    (
      action,
    ): action is Extract<
      (typeof publicationPolicy.actions)[number],
      { kind: "external-url" }
    > => action.kind === "external-url" && Boolean(action.requireReviewedFingerprint),
  );
  const urlField = versioned
    ? fingerprintAction?.field ??
      publicationPolicy?.actions.find((action) => action.kind === "external-url")?.field
    : "appUrl";
  const appUrl = urlField ? fields[urlField] : null;
  if (typeof appUrl !== "string" || appUrl.trim() === "") {
    console.warn(`[screenshot] ${submissionId}: no appUrl — skipping`);
    return;
  }

  const stageVersionedPreview = async (
    previewS3Key: string,
    previewS3VersionId: string | null = null,
  ): Promise<void> => {
    if (!versioned) return;
    await db.publicationDecision.updateMany({
      where: {
        submissionId,
        ownerConsent: true,
        ownerRevokedAt: null,
        instructorState: { in: ["pending", "approved"] },
      },
      data: { previewS3Key, previewS3VersionId },
    });
    if (deps.syncProjection) await deps.syncProjection(submissionId);
    else await syncGalleryItem(submissionId, { prisma: db });
  };

  if (versioned && publicationPolicy?.wall !== "app") {
    if (!fingerprintAction) {
      console.warn(`[screenshot] ${submissionId}: no external action to recheck — skipping`);
      return;
    }
    try {
      const result = await safeFetchBytes(appUrl, {
        timeoutMs: 10_000,
        maxBytes: HTML_CAP_BYTES,
        fetchImpl: deps.fetchImpl,
        lookup,
      });
      if (!result.ok || result.truncated) {
        console.warn(`[screenshot] ${submissionId}: external fingerprint recheck incomplete`);
        await stageVersionedPreview(SCREENSHOT_BLOCKED);
        return;
      }
      const marker = fingerprintExternalPublicationContent(result);
      await stageVersionedPreview(marker);
      console.log(`[screenshot] ${submissionId}: refreshed external publication fingerprint`);
    } catch (err) {
      console.warn(
        `[screenshot] ${submissionId}: external fingerprint recheck failed`,
        err instanceof Error ? err.message : err,
      );
      await stageVersionedPreview(SCREENSHOT_BLOCKED);
    }
    return;
  }

  // Legacy capture requires an existing/current item. Versioned V2 capture is
  // deliberately staged before the item moves so V1 stays visible until the
  // new preview is safely stored.
  const legacyItem = versioned ? null : await syncGalleryItem(submissionId, { prisma: db });
  if (!versioned && (!legacyItem || legacyItem.submissionId !== submissionId)) {
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
      if (versioned) {
        await stageVersionedPreview(SCREENSHOT_BLOCKED);
      } else if (legacyItem) {
        await db.galleryItem.update({
          where: { id: legacyItem.id },
          data: {
            screenshotS3Key: SCREENSHOT_BLOCKED,
            screenshotS3VersionId: null,
          },
        });
      }
      console.warn(`[screenshot] ${submissionId}: blocked by policy — ${err.message}`);
      return;
    }
    // Network flake / HEAD rejection: not a policy block — carry on.
  }

  if (!configured()) {
    console.warn(`[screenshot] ${submissionId}: S3 not configured — skipping capture`);
    await stageVersionedPreview(SCREENSHOT_BLOCKED);
    return;
  }

  // 2. Real capture: headless chromium with the private-address route policy.
  let capturedBytes: Uint8Array | null = null;
  let capturedContentType = "image/png";
  let browserPolicyIncomplete = false;
  try {
    const browser = await (deps.launchBrowser ?? defaultLaunch)();
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      const markIncomplete = () => {
        browserPolicyIncomplete = true;
      };
      await page.route(
        "**/*",
        makeRoutePolicy({
          lookup,
          fetchImpl: deps.fetchImpl,
          onIncomplete: markIncomplete,
        }),
      );
      if (page.routeWebSocket) {
        await page.routeWebSocket("**/*", async (socket) => {
          markIncomplete();
          await socket.close({ code: 1008, reason: "Screenshot renderer is read-only" });
        });
      }
      await page.goto(appUrl, { timeout: NAV_TIMEOUT_MS, waitUntil: "load" });
      if (browserPolicyIncomplete) {
        throw new SafeFetchBlockedError("browser resource graph was incomplete");
      }
      capturedBytes = await page.screenshot({ type: "png" });
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
  if (!capturedBytes && !browserPolicyIncomplete) {
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
          capturedBytes = img.body;
          capturedContentType = img.contentType ?? "image/png";
        }
      }
    } catch (err) {
      console.warn(
        `[screenshot] ${submissionId}: og:image fallback failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (capturedBytes) {
    const targetId = versioned ? submission.publicationDecision?.id : legacyItem?.id;
    if (!targetId) throw new Error("Screenshot target disappeared before reservation");
    const digest = createHash("sha256").update(capturedBytes).digest("hex");
    const written = await writeObject(
      {
        reservation: {
          purpose: versioned ? "publication_preview" : "gallery_screenshot",
          submissionId,
          targetId,
          s3Key: (reservationId) =>
            keyForReservedScreenshot(submissionId, reservationId, digest),
          declaredContentType: capturedContentType,
          declaredBytes: capturedBytes.byteLength,
        },
        body: capturedBytes,
        contentType: capturedContentType,
        attach: async (tx, coordinates) => {
          if (versioned) {
            const staged = await tx.publicationDecision.updateMany({
              where: {
                id: targetId,
                submissionId,
                ownerConsent: true,
                ownerRevokedAt: null,
                instructorState: { in: ["pending", "approved"] },
              },
              data: {
                previewS3Key: coordinates.s3Key,
                previewS3VersionId: coordinates.s3VersionId,
              },
            });
            if (staged.count !== 1) {
              throw new Error("Publication preview is no longer attachable");
            }
          } else {
            const attached = await tx.galleryItem.updateMany({
              where: { id: targetId, submissionId },
              data: {
                screenshotS3Key: coordinates.s3Key,
                screenshotS3VersionId: coordinates.s3VersionId,
              },
            });
            if (attached.count !== 1) throw new Error("Gallery item is no longer attachable");
          }
          return coordinates;
        },
      },
      { put },
    );
    const key = written.reservation.s3Key;
    if (versioned) {
      // Staging is authoritative after the atomic attach. Projection repair is
      // best-effort and never rolls back or deletes an already attached object.
      if (deps.syncProjection) await deps.syncProjection(submissionId);
      else await syncGalleryItem(submissionId, { prisma: db });
    }
    console.log(`[screenshot] ${submissionId}: stored ${key}`);
  } else {
    // A failed recrawl cannot leave a previously reviewed mutable destination
    // looking current. The old public preview stays visible, but its action is
    // withheld until a successful capture and fresh instructor review.
    await stageVersionedPreview(SCREENSHOT_BLOCKED);
    console.warn(`[screenshot] ${submissionId}: no screenshot captured`);
  }
}
