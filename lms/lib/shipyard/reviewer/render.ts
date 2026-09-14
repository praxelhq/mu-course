// Opening a student's live product in a real browser (SPEC §6).
//
// A plain HTTP fetch of a Next.js app returns an empty shell, so checkpoint 3
// is judged from a headless render: the visible text after the app hydrates,
// and a full-page screenshot the reviewer looks at. This module is the only
// place the Shipyard launches a browser, and it runs in the worker only.
//
// Sandboxing (SPEC §8), in the order it is applied:
//   1. The hostname is resolved BEFORE a browser exists and every answer is
//      checked with safe-fetch's `isPrivateAddress`. A private, loopback,
//      link-local or mixed answer set refuses outright — no browser launches.
//   2. A fresh context with no credentials, no stored state, service workers
//      blocked, and a viewport of 1280x800.
//   3. `page.route("**/*")` is DEFAULT-DENY. Only the target host, its
//      subdomains, and a short list of public asset CDNs are allowed through;
//      every other request is aborted and counted. Non-http(s) schemes —
//      file:, data:, blob:, ws: — are always aborted.
//   4. Navigation and the whole render share a deadline, and the browser is
//      closed in `finally` whatever happens.
//
// The pure halves (the allow-list decision, empty-shell detection, the capture
// plan) are exported and unit-tested with no browser at all.

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "@/lib/net/safe-fetch";

export const DEFAULT_RENDER_TIMEOUT_MS = 20_000;
/** Visible text shorter than this after hydration is a shell, not a product. */
export const EMPTY_SHELL_CHARS = 80;
export const DOM_TEXT_CAP = 20_000;
export const MAX_SCREENSHOT_WIDTH = 1600;
export const MAX_SCREENSHOT_HEIGHT = 6000;
const VIEWPORT = { width: 1280, height: 800 };
/** networkidle OR this, whichever lands first — some apps never go idle. */
const NETWORK_SETTLE_MS = 8_000;
/** After settle, give React a beat to paint. */
const HYDRATION_MS = 1_500;

export type RenderResult = {
  ok: boolean;
  finalUrl: string;
  status: number | null;
  title: string;
  /** Visible text, capped at DOM_TEXT_CAP. */
  domText: string;
  screenshotPng: Buffer | null;
  consoleErrors: string[];
  blockedRequests: number;
  notes: string[];
};

// ---------------------------------------------------------------------------
// The pure halves
// ---------------------------------------------------------------------------

/**
 * Public asset CDNs a small product genuinely cannot render without. This is a
 * short, closed list on purpose: everything not named here is denied, so an
 * ad network, an analytics beacon, a third-party iframe or an internal host a
 * malicious page points at never gets a request. Bytes from these hosts are
 * stylesheets, fonts and library scripts, and none of them can carry our
 * credentials because the context has none.
 */
export const ALLOWED_ASSET_HOSTS: readonly string[] = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "unpkg.com",
];

export type AllowDecision = { allowed: boolean; reason: string };

/** Is `host` the target host or one of its subdomains? */
function isSameSite(targetHost: string, host: string): boolean {
  if (host === targetHost) return true;
  return host.endsWith(`.${targetHost}`);
}

/**
 * The default-deny rule, as a pure function so it can be tested without a
 * browser. `targetOrigin` is the origin of the URL the student submitted,
 * after redirects have been followed by the browser.
 */
export function decideRequest(targetOrigin: string, requestUrl: string): AllowDecision {
  let target: URL;
  try {
    target = new URL(targetOrigin);
  } catch {
    return { allowed: false, reason: "target origin is not a URL" };
  }

  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return { allowed: false, reason: "request URL is not a URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: `scheme ${url.protocol} is never allowed` };
  }
  if (isSameSite(target.hostname, url.hostname)) {
    return { allowed: true, reason: "same site as the submitted URL" };
  }
  if (ALLOWED_ASSET_HOSTS.includes(url.hostname)) {
    return { allowed: true, reason: "public asset CDN" };
  }
  return { allowed: false, reason: `cross-origin host ${url.hostname} is not on the allow list` };
}

export function isEmptyShell(domText: string): boolean {
  return domText.trim().length < EMPTY_SHELL_CHARS;
}

export type CapturePlan = {
  /** Null means capture the whole page as-is. */
  clip: { x: number; y: number; width: number; height: number } | null;
  note: string | null;
};

/**
 * A 30,000px-tall marketing page is not worth thirty megabytes of PNG, and no
 * model reads past the fold anyway. Cap both dimensions and SAY SO in a note,
 * so a reviewer never silently judges a crop it thinks is the whole page.
 */
export function computeCapturePlan(
  size: { width: number; height: number },
  limits: { maxWidth: number; maxHeight: number } = {
    maxWidth: MAX_SCREENSHOT_WIDTH,
    maxHeight: MAX_SCREENSHOT_HEIGHT,
  },
): CapturePlan {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const clipWidth = Math.min(width, limits.maxWidth);
  const clipHeight = Math.min(height, limits.maxHeight);
  if (clipWidth === width && clipHeight === height) return { clip: null, note: null };

  const parts: string[] = [];
  if (clipHeight < height) {
    parts.push(`the page is ${height}px tall and the screenshot shows the top ${clipHeight}px`);
  }
  if (clipWidth < width) {
    parts.push(`the page is ${width}px wide and the screenshot shows the left ${clipWidth}px`);
  }
  return {
    clip: { x: 0, y: 0, width: clipWidth, height: clipHeight },
    note: parts.join("; "),
  };
}

export function renderTimeoutFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = Number(env.SHIPYARD_RENDER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RENDER_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// The address check
// ---------------------------------------------------------------------------

export type LookupFn = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;

const defaultLookup: LookupFn = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

export type AddressCheck = { ok: true; addresses: string[] } | { ok: false; reason: string };

/**
 * Fails closed. A hostname that resolves to nothing, to a private address, or
 * to a MIX of public and private answers is refused — the mixed case is the
 * DNS-rebinding shape and there is no safe half of it.
 */
export async function checkPublicAddress(
  hostname: string,
  lookup: LookupFn = defaultLookup,
): Promise<AddressCheck> {
  if (isIP(hostname)) {
    return isPrivateAddress(hostname)
      ? { ok: false, reason: `${hostname} is not a public address` }
      : { ok: true, addresses: [hostname] };
  }
  let answers: { address: string; family: number }[];
  try {
    answers = await lookup(hostname);
  } catch (err) {
    return { ok: false, reason: `${hostname} did not resolve: ${errText(err)}` };
  }
  if (answers.length === 0) return { ok: false, reason: `${hostname} resolved to no addresses` };
  const privateOnes = answers.filter((a) => isPrivateAddress(a.address));
  if (privateOnes.length > 0) {
    return {
      ok: false,
      reason: `${hostname} resolves to a private or reserved address (${privateOnes
        .map((a) => a.address)
        .join(", ")})`,
    };
  }
  return { ok: true, addresses: answers.map((a) => a.address) };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// The browser seam
// ---------------------------------------------------------------------------

/**
 * Structural types, so this module never statically imports playwright — the
 * web tier type-checks without it and a test injects a fake in three lines.
 */
export interface RouteLike {
  request(): { url(): string; resourceType?(): string };
  abort(reason?: string): Promise<void>;
  continue(): Promise<void>;
}

export interface ResponseLike {
  status(): number;
  url(): string;
}

export interface PageLike {
  route(pattern: string, handler: (route: RouteLike) => void | Promise<void>): Promise<void>;
  on(event: "console", handler: (msg: { type(): string; text(): string }) => void): void;
  on(event: "pageerror", handler: (err: Error) => void): void;
  goto(
    url: string,
    opts: { timeout: number; waitUntil?: "load" | "domcontentloaded" | "networkidle" },
  ): Promise<ResponseLike | null>;
  waitForLoadState(state: "networkidle", opts: { timeout: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  title(): Promise<string>;
  url(): string;
  evaluate<T>(fn: () => T): Promise<T>;
  screenshot(opts: {
    type: "png";
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
  }): Promise<Uint8Array>;
}

export interface ContextLike {
  newPage(): Promise<PageLike>;
}

export interface BrowserLike {
  newContext(opts: {
    viewport: { width: number; height: number };
    javaScriptEnabled: boolean;
    serviceWorkers?: "block" | "allow";
    ignoreHTTPSErrors?: boolean;
  }): Promise<ContextLike>;
  close(): Promise<void>;
}

export type LaunchFn = () => Promise<BrowserLike>;

/**
 * Mirrors worker/jobs/screenshot-capture.ts: headless, QUIC off, and NO
 * `--no-sandbox` — the Forge does not pass it and the worker image does not
 * need it (PLAYWRIGHT_BROWSERS_PATH=0 puts Chromium inside node_modules, it
 * does not change the sandbox). Loaded lazily so the web tier never pulls
 * playwright into its bundle.
 */
const defaultLaunch: LaunchFn = async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--disable-quic"] });
  return browser as unknown as BrowserLike;
};

export type RenderOptions = {
  timeoutMs?: number;
  /** The core path the student named, logged into the notes for the reviewer. */
  corePath?: string;
  launch?: LaunchFn;
  lookup?: LookupFn;
};

const VISIBLE_TEXT_FN = () => {
  const body = document.body;
  if (!body) return "";
  return (body.innerText || body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
};

/**
 * Render one student URL. Never throws for a student's broken site: a refusal,
 * a timeout or a crash comes back as `ok: false` with the reason in `notes`,
 * because a dead product is a REVIEW outcome and not a dead job.
 */
export async function renderLiveProduct(
  url: string,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const timeoutMs = opts.timeoutMs ?? renderTimeoutFromEnv();
  const notes: string[] = [];
  const consoleErrors: string[] = [];
  let blockedRequests = 0;

  const base: RenderResult = {
    ok: false,
    finalUrl: url,
    status: null,
    title: "",
    domText: "",
    screenshotPng: null,
    consoleErrors,
    blockedRequests,
    notes,
  };

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    notes.push("the submitted URL is not a URL");
    return base;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    notes.push(`the submitted URL uses ${target.protocol}, and only http(s) is rendered`);
    return base;
  }
  if (target.username || target.password) {
    notes.push("the submitted URL carries credentials, which are never sent");
    return base;
  }

  const address = await checkPublicAddress(target.hostname, opts.lookup);
  if (!address.ok) {
    notes.push(`refused before launching a browser: ${address.reason}`);
    return base;
  }

  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1_000, deadline - Date.now());

  let browser: BrowserLike | null = null;
  try {
    browser = await (opts.launch ?? defaultLaunch)();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      javaScriptEnabled: true,
      serviceWorkers: "block",
      ignoreHTTPSErrors: false,
    });
    const page = await context.newPage();

    await page.route("**/*", async (route) => {
      const decision = decideRequest(target.origin, route.request().url());
      if (decision.allowed) {
        await route.continue();
        return;
      }
      blockedRequests++;
      base.blockedRequests = blockedRequests;
      await route.abort("blockedbyclient");
    });

    page.on("console", (msg) => {
      if (msg.type() === "error" && consoleErrors.length < 25) consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      if (consoleErrors.length < 25) consoleErrors.push(errText(err));
    });

    const response = await page.goto(url, {
      timeout: Math.min(remaining(), timeoutMs),
      waitUntil: "domcontentloaded",
    });
    base.status = response ? response.status() : null;

    // networkidle OR eight seconds, whichever lands first: a product with a
    // polling socket never goes idle and must not be called dead for it.
    await page
      .waitForLoadState("networkidle", { timeout: Math.min(NETWORK_SETTLE_MS, remaining()) })
      .catch(() => {
        notes.push("the page never went network-idle; rendered what was on screen at 8s");
      });
    await page.waitForTimeout(Math.min(HYDRATION_MS, remaining()));

    base.finalUrl = page.url();
    base.title = await page.title().catch(() => "");
    const text = await page.evaluate<string>(VISIBLE_TEXT_FN).catch(() => "");
    base.domText = text.slice(0, DOM_TEXT_CAP);
    if (text.length > DOM_TEXT_CAP) notes.push(`visible text truncated at ${DOM_TEXT_CAP} characters`);

    const size = await page
      .evaluate<{ width: number; height: number }>(() => ({
        width: Math.max(document.documentElement.scrollWidth, window.innerWidth),
        height: Math.max(document.documentElement.scrollHeight, window.innerHeight),
      }))
      .catch(() => ({ width: VIEWPORT.width, height: VIEWPORT.height }));
    const plan = computeCapturePlan(size);
    if (plan.note) notes.push(plan.note);

    const png = await page
      .screenshot(plan.clip ? { type: "png", clip: plan.clip } : { type: "png", fullPage: true })
      .catch((err) => {
        notes.push(`the screenshot failed: ${errText(err)}`);
        return null;
      });
    base.screenshotPng = png ? Buffer.from(png) : null;

    if (isEmptyShell(base.domText)) {
      notes.push(
        `the page rendered under ${EMPTY_SHELL_CHARS} characters of visible text after hydration — an empty shell, a build error or a permanent spinner`,
      );
    }
    if (base.status !== null && base.status >= 400) {
      notes.push(`the server answered ${base.status}`);
    }
    if (blockedRequests > 0) {
      notes.push(
        `${blockedRequests} cross-origin request${blockedRequests === 1 ? "" : "s"} were blocked by the render sandbox; a missing third-party widget is not the student's fault`,
      );
    }
    if (opts.corePath) {
      notes.push(`the student's named core path: ${opts.corePath.replace(/\s+/g, " ").slice(0, 400)}`);
    }

    base.ok = base.status !== null && base.status < 400 && !isEmptyShell(base.domText);
    return base;
  } catch (err) {
    notes.push(`the render failed: ${errText(err)}`);
    return base;
  } finally {
    await browser?.close().catch(() => {});
  }
}
