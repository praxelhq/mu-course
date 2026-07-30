import { createHash } from "node:crypto";
import {
  S4_APP_INSPECTION_POLICY_V1,
  canonicalJson,
  parseS4AcceptanceStatuses,
  sha256Json,
  type S4AppInspectionArtifact,
  type S4AppInspectionPolicy,
  type S4RepositoryCheck,
  type S4RenderedSensitiveCategory,
  type S4SourceCheck,
} from "@/lib/assessments/s4-app-policy";
import { scanSensitiveText } from "@/lib/evidence/sensitive-data";
import {
  safeFetch,
  safeFetchResource,
  probeUrl,
  SafeFetchBlockedError,
  type LookupFn,
} from "@/lib/net/safe-fetch";

export type S4RenderedObservation = {
  /** Structural signal only; raw rendered text is never persisted. */
  domStructure: string;
  screenshot: Uint8Array;
  bodyTextLength: number;
  interactiveControlCount: number;
  editableControlCount: number;
  publicLinkCount: number;
  mobileNoHorizontalScroll: boolean;
  renderedAnalyticsClaim: boolean;
  analyticsLabelledDemo: boolean;
  /** Transient local-only text used by scanSensitiveText; never persisted. */
  sensitiveText: string;
};

export type S4AppRenderer = (
  url: string,
  policy: S4AppInspectionPolicy,
  deps: Pick<S4AppInspectionDeps, "fetchImpl" | "lookup">,
) => Promise<S4RenderedObservation>;

export type S4AppInspectionInput = {
  submissionId: string;
  assessmentVersionId: string;
  assessmentSha256: string;
  evaluatorSha256: string;
  submissionVersion: number;
  attempt: number;
  appUrl: string;
  githubUrl: string | null;
  acceptanceTestLog: unknown;
  cleanEvidenceCount: number;
  screenshotReceiptSha256: string | null;
  sourceUrls: string[];
  sourceContext: S4AppInspectionArtifact["sourceContext"];
  previousArtifactSha256: string | null;
};

export type S4AppInspectionDeps = {
  policy?: S4AppInspectionPolicy;
  now?: () => Date;
  lookup?: LookupFn;
  fetchImpl?: typeof fetch;
  render?: S4AppRenderer;
};

type InspectionPage = {
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
  goto(url: string, options: { timeout: number; waitUntil: "load" }): Promise<unknown>;
  evaluate<Result>(callback: () => Result): Promise<Result>;
  screenshot(options: { type: "png" }): Promise<Uint8Array>;
};

type InspectionBrowser = {
  newPage(): Promise<InspectionPage>;
  close(): Promise<void>;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const RENDERED_SENSITIVE_CATEGORIES = new Set<S4RenderedSensitiveCategory>([
  "secret-token",
  "sensitive-key",
  "email",
  "phone",
  "prompt-injection",
]);

function isRenderedSensitiveCategory(value: string): value is S4RenderedSensitiveCategory {
  return RENDERED_SENSITIVE_CATEGORIES.has(value as S4RenderedSensitiveCategory);
}

function hostMatches(host: string, allowed: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  const normalizedAllowed = allowed.toLowerCase().replace(/\.$/, "");
  if (!normalizedAllowed.startsWith("*.")) return normalizedHost === normalizedAllowed;
  const suffix = normalizedAllowed.slice(1);
  return normalizedHost.endsWith(suffix) && normalizedHost.length > suffix.length;
}

function allowedFinalUrl(url: string, policy: S4AppInspectionPolicy): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      policy.allowedFinalHosts.some((host) => hostMatches(parsed.hostname, host))
    );
  } catch {
    return false;
  }
}

function acceptedStatuses(value: unknown): S4AppInspectionArtifact["acceptance"] {
  const statuses = parseS4AcceptanceStatuses(value);
  const referencedIds = Object.keys(statuses).sort();
  return {
    statuses,
    referencedIds,
    corePassCount: referencedIds.filter(
      (id) => Number(id.slice(3)) <= 15 && statuses[id] === "PASS",
    ).length,
    publishAccessPassCount: referencedIds.filter(
      (id) => Number(id.slice(3)) >= 16 && statuses[id] === "PASS",
    ).length,
  };
}

function sourceUrlHash(url: string): string {
  try {
    const normalized = new URL(url).toString();
    return sha256(normalized);
  } catch {
    return sha256(url.trim());
  }
}

function retainedPublicUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

async function inspectSources(
  urls: readonly string[],
  policy: S4AppInspectionPolicy,
  deps: Pick<S4AppInspectionDeps, "fetchImpl" | "lookup">,
): Promise<S4SourceCheck[]> {
  return Promise.all(
    [...new Set(urls.map((url) => url.trim()).filter(Boolean))].slice(0, 8).map(async (url) => {
      try {
        const result = await probeUrl(
          url,
          {
            method: "HEAD",
            timeoutMs: Math.min(policy.network.timeoutMs, 8_000),
            maxRedirects: policy.network.maxRedirects,
            fetchImpl: deps.fetchImpl,
            lookup: deps.lookup,
          },
          (response) => response.status === 405 || response.status === 501,
        );
        return { urlHash: sourceUrlHash(url), ok: result.ok, status: result.status };
      } catch {
        return { urlHash: sourceUrlHash(url), ok: false, status: 0 };
      }
    }),
  );
}

function submittedGitHubRepositoryUrl(
  value: string,
  policy: S4AppInspectionPolicy,
): URL | null {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.toLowerCase() !== policy.repository.allowedFinalHost ||
      parsed.search ||
      parsed.hash ||
      segments.length !== 2
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function inspectRepository(
  repositoryUrl: string | null,
  policy: S4AppInspectionPolicy,
  deps: Pick<S4AppInspectionDeps, "fetchImpl" | "lookup">,
): Promise<S4RepositoryCheck | null> {
  const value = repositoryUrl?.trim();
  if (!value) return null;
  const urlHash = sourceUrlHash(value);
  const submitted = submittedGitHubRepositoryUrl(value, policy);
  if (!submitted) return { urlHash, ok: false, status: 0, finalHost: null };

  try {
    const result = await safeFetch(submitted.toString(), {
      method: "HEAD",
      timeoutMs: Math.min(policy.network.timeoutMs, 8_000),
      maxRedirects: policy.network.maxRedirects,
      fetchImpl: deps.fetchImpl,
      lookup: deps.lookup,
    });
    const final = new URL(result.finalUrl);
    const finalHost = final.hostname.toLowerCase().replace(/\.$/, "");
    const allowedFinal =
      final.protocol === "https:" &&
      !final.username &&
      !final.password &&
      finalHost === policy.repository.allowedFinalHost;
    return {
      urlHash,
      ok: result.ok && allowedFinal,
      status: result.status,
      finalHost,
    };
  } catch {
    return { urlHash, ok: false, status: 0, finalHost: null };
  }
}

async function launchInspectionBrowser(): Promise<InspectionBrowser> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--host-resolver-rules=MAP * ~NOTFOUND", "--disable-quic"],
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  return {
    newPage: async () => (await context.newPage()) as unknown as InspectionPage,
    close: () => browser.close(),
  };
}

/**
 * Render through the exact screenshot route policy: direct Chromium DNS is
 * disabled and every GET is fulfilled from safeFetchResource's pinned bytes.
 */
async function renderWithPinnedBrowser(
  url: string,
  policy: S4AppInspectionPolicy,
  deps: Pick<S4AppInspectionDeps, "fetchImpl" | "lookup">,
): Promise<S4RenderedObservation> {
  const { makeRoutePolicy } = await import("./screenshot-capture");
  const lookup =
    deps.lookup ??
    (async (hostname: string) => {
      const { lookup } = await import("node:dns/promises");
      return lookup(hostname, { all: true, verbatim: true });
    });
  const browser = await launchInspectionBrowser();
  let incomplete = false;
  try {
    const page = await browser.newPage();
    await page.setViewportSize({
      width: policy.render.viewportWidth,
      height: policy.render.viewportHeight,
    });
    await page.route(
      "**/*",
      makeRoutePolicy({
        lookup,
        fetchImpl: deps.fetchImpl,
        onIncomplete: () => {
          incomplete = true;
        },
      }),
    );
    if (page.routeWebSocket) {
      await page.routeWebSocket("**/*", async (socket) => {
        incomplete = true;
        await socket.close({ code: 1008, reason: "S4 inspection is read-only" });
      });
    }
    await page.goto(url, { timeout: policy.network.timeoutMs, waitUntil: "load" });
    if (incomplete) throw new SafeFetchBlockedError("Incomplete browser resource graph");

    const signals = await page.evaluate(() => {
      const visible = (element: Element): boolean => {
        const box = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const controls = [...document.querySelectorAll("a[href],button,input,select,textarea,[role='button'],[contenteditable='true']")].filter(visible);
      const editable = controls.filter((element) =>
        element.matches("input,select,textarea,[contenteditable='true']"),
      );
      const publicLinks = [...document.querySelectorAll("a[href]")].filter((element) => {
        if (!visible(element)) return false;
        const href = element.getAttribute("href") ?? "";
        return /^(?:https?:|\/|#)/i.test(href) && !/^javascript:/i.test(href);
      });
      const structural = [...document.body.querySelectorAll("main,form,nav,section,a,button,input,select,textarea,[role],[contenteditable='true']")]
        .slice(0, 500)
        .map((element) => {
          const role = element.getAttribute("role") ?? "";
          const type = element.getAttribute("type") ?? "";
          return `${element.tagName.toLowerCase()}:${role}:${type}`;
        })
        .join("|");
      const bodyText = (document.body.innerText ?? "").replace(/\s+/g, " ").trim();
      const resolvedHrefs = [...document.querySelectorAll("a[href]")]
        .slice(0, 500)
        .map((element) =>
          (element instanceof HTMLAnchorElement ? element.href : element.getAttribute("href") ?? "")
            .slice(0, 2_048),
        )
        .join("\n");
      return {
        domStructure: structural,
        sensitiveText: `${bodyText}\n${resolvedHrefs}`,
        bodyTextLength: Math.min(bodyText.length, 100_000),
        interactiveControlCount: controls.length,
        editableControlCount: editable.length,
        publicLinkCount: publicLinks.length,
        mobileNoHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        renderedAnalyticsClaim:
          /\b\d[\d,]*(?:\.\d+)?\s*(?:visitors?|views?|clicks?|signups?|%|ctr)\b/i.test(bodyText),
        analyticsLabelledDemo:
          /\b(?:browser-local|local (?:demo )?(?:data|analytics|events?)|demo (?:data|analytics|events?)|simulated analytics)\b/i.test(bodyText),
      };
    });
    const { sensitiveText, ...persistableSignals } = signals;
    return {
      ...persistableSignals,
      sensitiveText,
      screenshot: await page.screenshot({ type: "png" }),
    };
  } finally {
    await browser.close();
  }
}

function finalizeArtifact(
  artifact: Omit<S4AppInspectionArtifact, "artifactSha256">,
): S4AppInspectionArtifact {
  return { ...artifact, artifactSha256: sha256(canonicalJson(artifact)) };
}

function baseArtifact(
  input: S4AppInspectionInput,
  policy: S4AppInspectionPolicy,
  now: Date,
  sourceChecks: S4SourceCheck[],
  repositoryCheck: S4RepositoryCheck | null,
): Pick<
  S4AppInspectionArtifact,
  | "schemaVersion"
  | "policyId"
  | "policySha256"
  | "binding"
  | "sourceContext"
  | "previousArtifactSha256"
  | "inspectedAt"
  | "submittedUrl"
  | "submittedUrlSha256"
  | "acceptance"
  | "repositoryCheck"
  | "sourceChecks"
  | "evidence"
> {
  const submittedUrl = input.appUrl.trim();
  return {
    schemaVersion: 1,
    policyId: policy.policyId,
    policySha256: sha256Json(policy),
    binding: {
      submissionId: input.submissionId,
      assessmentVersionId: input.assessmentVersionId,
      assessmentSha256: input.assessmentSha256,
      evaluatorSha256: input.evaluatorSha256,
      submissionVersion: input.submissionVersion,
      attempt: input.attempt,
    },
    sourceContext: input.sourceContext,
    previousArtifactSha256: input.previousArtifactSha256,
    inspectedAt: now.toISOString(),
    submittedUrl: retainedPublicUrl(submittedUrl),
    submittedUrlSha256: sourceUrlHash(submittedUrl),
    acceptance: acceptedStatuses(input.acceptanceTestLog),
    repositoryCheck,
    sourceChecks,
    evidence: {
      cleanEvidenceCount: Math.max(0, Math.trunc(input.cleanEvidenceCount)),
      screenshotReceiptSha256: input.screenshotReceiptSha256,
    },
  };
}

export async function inspectS4App(
  input: S4AppInspectionInput,
  deps: S4AppInspectionDeps = {},
): Promise<S4AppInspectionArtifact> {
  const policy = deps.policy ?? S4_APP_INSPECTION_POLICY_V1;
  const now = (deps.now ?? (() => new Date()))();
  const [sourceChecks, repositoryCheck] = await Promise.all([
    inspectSources(input.sourceUrls, policy, deps),
    inspectRepository(input.githubUrl, policy, deps),
  ]);
  const base = baseArtifact(input, policy, now, sourceChecks, repositoryCheck);
  let page;
  try {
    page = await safeFetchResource(input.appUrl.trim(), {
      method: "GET",
      timeoutMs: policy.network.timeoutMs,
      maxBytes: policy.network.maxHtmlBytes,
      maxRedirects: policy.network.maxRedirects,
      allowedContentTypes: ["text/html", "application/xhtml+xml"],
      fetchImpl: deps.fetchImpl,
      lookup: deps.lookup,
    });
  } catch (error) {
    return finalizeArtifact({
      ...base,
      finalUrl: null,
      finalUrlSha256: null,
      state: error instanceof SafeFetchBlockedError ? "blocked" : "unreachable",
      httpStatus: 0,
      document: null,
      render: null,
    });
  }

  const document = {
    contentType: page.contentType,
    byteCount: page.body.byteLength,
    sha256: sha256(page.body),
  };
  if (!page.ok) {
    return finalizeArtifact({
      ...base,
      finalUrl: retainedPublicUrl(page.finalUrl),
      finalUrlSha256: sourceUrlHash(page.finalUrl),
      state: "dead",
      httpStatus: page.status,
      document,
      render: null,
    });
  }
  if (!allowedFinalUrl(page.finalUrl, policy)) {
    return finalizeArtifact({
      ...base,
      finalUrl: retainedPublicUrl(page.finalUrl),
      finalUrlSha256: sourceUrlHash(page.finalUrl),
      state: "blocked",
      httpStatus: page.status,
      document,
      render: null,
    });
  }

  try {
    const rendered = await (deps.render ?? renderWithPinnedBrowser)(page.finalUrl, policy, deps);
    let decodedSensitiveText = rendered.sensitiveText;
    try {
      decodedSensitiveText = decodeURIComponent(rendered.sensitiveText);
    } catch {
      // Scan the exact captured string when a malformed escape cannot decode.
    }
    const sensitiveFindings = scanSensitiveText(decodedSensitiveText, "s4-rendered-app");
    const sensitiveFindingCategories = [...new Set(
      sensitiveFindings
        .map((finding) => finding.detector)
        .filter(isRenderedSensitiveCategory),
    )].sort();
    const render = {
      domSha256: sha256(rendered.domStructure),
      screenshotSha256: sha256(rendered.screenshot),
      screenshotByteCount: rendered.screenshot.byteLength,
      bodyTextLength: rendered.bodyTextLength,
      interactiveControlCount: rendered.interactiveControlCount,
      editableControlCount: rendered.editableControlCount,
      publicLinkCount: rendered.publicLinkCount,
      mobileNoHorizontalScroll: rendered.mobileNoHorizontalScroll,
      renderedAnalyticsClaim: rendered.renderedAnalyticsClaim,
      analyticsLabelledDemo: rendered.analyticsLabelledDemo,
      sensitiveFindingCount: sensitiveFindings.length,
      sensitiveFindingCategories,
      sensitiveTextSha256: rendered.sensitiveText ? sha256(rendered.sensitiveText) : null,
    };
    const staticShell =
      render.bodyTextLength === 0 ||
      render.interactiveControlCount < policy.render.minimumInteractiveControls ||
      (policy.render.requireEditableControl && render.editableControlCount === 0) ||
      (policy.render.requirePublicLink && render.publicLinkCount === 0);
    return finalizeArtifact({
      ...base,
      finalUrl: retainedPublicUrl(page.finalUrl),
      finalUrlSha256: sourceUrlHash(page.finalUrl),
      state: staticShell ? "static" : "inspectable",
      httpStatus: page.status,
      document,
      render,
    });
  } catch {
    return finalizeArtifact({
      ...base,
      finalUrl: retainedPublicUrl(page.finalUrl),
      finalUrlSha256: sourceUrlHash(page.finalUrl),
      state: "uninspectable",
      httpStatus: page.status,
      document,
      render: null,
    });
  }
}
