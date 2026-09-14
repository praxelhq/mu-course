// The render's sandbox, tested where it is decidable without a browser, plus
// one end-to-end pass over an injected fake page and one real-network test
// that is opt-in.
//
// SPEC §8: "Playwright runs in the worker only, against student URLs, with a
// timeout, no credentials, and network limited to the target origin, so a
// malicious page cannot reach internal services."

import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_ASSET_HOSTS,
  checkPublicAddress,
  computeCapturePlan,
  decideRequest,
  DOM_TEXT_CAP,
  EMPTY_SHELL_CHARS,
  isEmptyShell,
  MAX_SCREENSHOT_HEIGHT,
  MAX_SCREENSHOT_WIDTH,
  renderLiveProduct,
  renderTimeoutFromEnv,
  type BrowserLike,
  type PageLike,
  type RouteLike,
} from "@/lib/shipyard/reviewer/render";

const TARGET = "https://dabbaroute.vercel.app";

describe("decideRequest — default deny", () => {
  it("allows the target host", () => {
    expect(decideRequest(TARGET, `${TARGET}/api/routes`).allowed).toBe(true);
  });

  it("allows a subdomain of the target host", () => {
    expect(decideRequest(TARGET, "https://cdn.dabbaroute.vercel.app/app.js").allowed).toBe(true);
  });

  it("does not treat a host that merely ends with the same letters as a subdomain", () => {
    expect(decideRequest(TARGET, "https://evildabbaroute.vercel.app/x").allowed).toBe(false);
  });

  it("allows only the named asset CDNs", () => {
    for (const host of ALLOWED_ASSET_HOSTS) {
      expect(decideRequest(TARGET, `https://${host}/a.css`).allowed).toBe(true);
    }
    expect(decideRequest(TARGET, "https://ads.doubleclick.net/pixel.gif").allowed).toBe(false);
    expect(decideRequest(TARGET, "https://www.google-analytics.com/g").allowed).toBe(false);
  });

  it("refuses an internal host outright", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:5432/",
      "http://10.0.0.7/admin",
      "http://shipyard-worker.railway.internal/health",
    ]) {
      const decision = decideRequest(TARGET, url);
      expect(decision.allowed, url).toBe(false);
      expect(decision.reason).toMatch(/not on the allow list/);
    }
  });

  it("refuses every scheme but http(s)", () => {
    for (const url of ["file:///etc/passwd", "data:text/html,<h1>x", "ws://x.example.com/s"]) {
      expect(decideRequest(TARGET, url).allowed, url).toBe(false);
    }
  });

  it("fails closed on junk", () => {
    expect(decideRequest(TARGET, "not a url").allowed).toBe(false);
    expect(decideRequest("not a url", TARGET).allowed).toBe(false);
  });
});

describe("isEmptyShell", () => {
  it("calls a Next.js default shell empty", () => {
    expect(isEmptyShell("")).toBe(true);
    expect(isEmptyShell("   \n  ")).toBe(true);
    expect(isEmptyShell("Loading…")).toBe(true);
    expect(isEmptyShell("x".repeat(EMPTY_SHELL_CHARS - 1))).toBe(true);
  });

  it("calls a real page not empty", () => {
    expect(isEmptyShell("x".repeat(EMPTY_SHELL_CHARS))).toBe(false);
  });
});

describe("computeCapturePlan", () => {
  it("captures a normal page whole", () => {
    expect(computeCapturePlan({ width: 1280, height: 3200 })).toEqual({ clip: null, note: null });
  });

  it("clips a very tall page and says so", () => {
    const plan = computeCapturePlan({ width: 1280, height: 31_000 });
    expect(plan.clip).toEqual({ x: 0, y: 0, width: 1280, height: MAX_SCREENSHOT_HEIGHT });
    expect(plan.note).toMatch(/31000px tall/);
    expect(plan.note).toMatch(/top 6000px/);
  });

  it("clips a very wide page and says so", () => {
    const plan = computeCapturePlan({ width: 4000, height: 900 });
    expect(plan.clip).toEqual({ x: 0, y: 0, width: MAX_SCREENSHOT_WIDTH, height: 900 });
    expect(plan.note).toMatch(/left 1600px/);
  });

  it("clips both and never returns a zero dimension", () => {
    const plan = computeCapturePlan({ width: 0, height: 0 });
    expect(plan).toEqual({ clip: null, note: null });
  });
});

describe("renderTimeoutFromEnv", () => {
  it("defaults to twenty seconds", () => {
    expect(renderTimeoutFromEnv({})).toBe(20_000);
    expect(renderTimeoutFromEnv({ SHIPYARD_RENDER_TIMEOUT_MS: "nope" })).toBe(20_000);
    expect(renderTimeoutFromEnv({ SHIPYARD_RENDER_TIMEOUT_MS: "-5" })).toBe(20_000);
  });

  it("takes the env value when it is a positive number", () => {
    expect(renderTimeoutFromEnv({ SHIPYARD_RENDER_TIMEOUT_MS: "45000" })).toBe(45_000);
  });
});

describe("checkPublicAddress", () => {
  it("refuses a loopback literal without any DNS", async () => {
    const result = await checkPublicAddress("127.0.0.1");
    expect(result.ok).toBe(false);
  });

  it("refuses a link-local literal", async () => {
    expect((await checkPublicAddress("169.254.169.254")).ok).toBe(false);
  });

  it("accepts a public literal", async () => {
    expect(await checkPublicAddress("93.184.216.34")).toEqual({
      ok: true,
      addresses: ["93.184.216.34"],
    });
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const result = await checkPublicAddress("internal.example.com", async () => [
      { address: "10.1.2.3", family: 4 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/private or reserved/);
  });

  it("fails closed on a mixed public and private answer set", async () => {
    const result = await checkPublicAddress("rebind.example.com", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    expect(result.ok).toBe(false);
  });

  it("fails closed when the name does not resolve", async () => {
    const result = await checkPublicAddress("gone.example.com", async () => {
      throw new Error("ENOTFOUND");
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The whole function, over a fake browser
// ---------------------------------------------------------------------------

type FakePageOptions = {
  domText: string;
  status?: number;
  size?: { width: number; height: number };
  title?: string;
};

function fakeBrowser(opts: FakePageOptions) {
  const routes: ((route: RouteLike) => void | Promise<void>)[] = [];
  const screenshotCalls: unknown[] = [];
  let closed = false;

  const page: PageLike = {
    route: async (_pattern, handler) => {
      routes.push(handler);
    },
    on: () => {},
    goto: async () => ({ status: () => opts.status ?? 200, url: () => TARGET }),
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    title: async () => opts.title ?? "DabbaRoute",
    url: () => TARGET,
    evaluate: (async (fn: () => unknown) => {
      const source = fn.toString();
      return source.includes("scrollWidth")
        ? (opts.size ?? { width: 1280, height: 2400 })
        : opts.domText;
    }) as PageLike["evaluate"],
    screenshot: async (o) => {
      screenshotCalls.push(o);
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  };

  const browser: BrowserLike = {
    newContext: async () => ({ newPage: async () => page }),
    close: async () => {
      closed = true;
    },
  };

  return {
    launch: async () => browser,
    routes,
    screenshotCalls,
    wasClosed: () => closed,
  };
}

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("renderLiveProduct", () => {
  it("refuses a private address before a browser is launched", async () => {
    const launch = vi.fn();
    const result = await renderLiveProduct("http://127.0.0.1:3000/", { launch });
    expect(launch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ")).toMatch(/refused before launching a browser/);
    expect(result.screenshotPng).toBeNull();
  });

  it("refuses a URL carrying credentials", async () => {
    const launch = vi.fn();
    const result = await renderLiveProduct("https://user:pw@dabbaroute.vercel.app/", { launch });
    expect(launch).not.toHaveBeenCalled();
    expect(result.notes.join(" ")).toMatch(/credentials/);
  });

  it("refuses a non-http scheme", async () => {
    const result = await renderLiveProduct("file:///etc/passwd", { launch: vi.fn() });
    expect(result.notes.join(" ")).toMatch(/only http\(s\)/);
  });

  it("renders a real page, caps the text and closes the browser", async () => {
    const fake = fakeBrowser({ domText: "Plan tomorrow's route. ".repeat(20) });
    const result = await renderLiveProduct(TARGET, {
      launch: fake.launch,
      lookup: publicLookup,
      corePath: "Open the link, add a kitchen, import today's list, press Plan.",
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.title).toBe("DabbaRoute");
    expect(result.domText.length).toBeLessThanOrEqual(DOM_TEXT_CAP);
    expect(result.screenshotPng).toBeInstanceOf(Buffer);
    expect(fake.wasClosed()).toBe(true);
    expect(result.notes.join(" ")).toContain("core path");
  });

  it("says so when the page is an empty shell", async () => {
    const fake = fakeBrowser({ domText: "Loading…" });
    const result = await renderLiveProduct(TARGET, { launch: fake.launch, lookup: publicLookup });
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ")).toMatch(/empty shell/);
  });

  it("is not ok on a 4xx", async () => {
    const fake = fakeBrowser({ domText: "Not found. ".repeat(20), status: 404 });
    const result = await renderLiveProduct(TARGET, { launch: fake.launch, lookup: publicLookup });
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ")).toMatch(/answered 404/);
  });

  it("clips the screenshot of a very tall page", async () => {
    const fake = fakeBrowser({
      domText: "Long page. ".repeat(40),
      size: { width: 1280, height: 40_000 },
    });
    await renderLiveProduct(TARGET, { launch: fake.launch, lookup: publicLookup });
    expect(fake.screenshotCalls[0]).toEqual({
      type: "png",
      clip: { x: 0, y: 0, width: 1280, height: MAX_SCREENSHOT_HEIGHT },
    });
  });

  it("installs a route policy that aborts cross-origin requests and counts them", async () => {
    const fake = fakeBrowser({ domText: "A real page. ".repeat(20) });
    const result = await renderLiveProduct(TARGET, { launch: fake.launch, lookup: publicLookup });
    expect(fake.routes).toHaveLength(1);

    const handler = fake.routes[0];
    const aborted: string[] = [];
    const continued: string[] = [];
    const routeFor = (url: string): RouteLike => ({
      request: () => ({ url: () => url }),
      abort: async () => {
        aborted.push(url);
      },
      continue: async () => {
        continued.push(url);
      },
    });

    await handler(routeFor(`${TARGET}/app.js`));
    await handler(routeFor("https://fonts.gstatic.com/x.woff2"));
    await handler(routeFor("http://169.254.169.254/latest/meta-data/"));
    await handler(routeFor("https://ads.example.net/pixel.gif"));

    expect(continued).toEqual([`${TARGET}/app.js`, "https://fonts.gstatic.com/x.woff2"]);
    expect(aborted).toEqual([
      "http://169.254.169.254/latest/meta-data/",
      "https://ads.example.net/pixel.gif",
    ]);
    expect(result.blockedRequests).toBe(2);
  });

  it("closes the browser even when the page throws", async () => {
    let closed = false;
    const browser: BrowserLike = {
      newContext: async () => {
        throw new Error("chromium died");
      },
      close: async () => {
        closed = true;
      },
    };
    const result = await renderLiveProduct(TARGET, {
      launch: async () => browser,
      lookup: publicLookup,
    });
    expect(result.ok).toBe(false);
    expect(result.notes.join(" ")).toMatch(/chromium died/);
    expect(closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A real local server, refused by the private-address rule
// ---------------------------------------------------------------------------

describe("a real page on 127.0.0.1", () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body><h1>Internal admin</h1><p>Secrets live here.</p></body></html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("is refused, and no browser is ever launched at it", async () => {
    const launch = vi.fn();
    const result = await renderLiveProduct(`http://127.0.0.1:${port}/`, { launch });
    expect(launch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.domText).toBe("");
    expect(result.notes.join(" ")).toMatch(/not a public address/);
  });
});

// ---------------------------------------------------------------------------
// The opt-in live render
// ---------------------------------------------------------------------------

const LIVE = process.env.SHIPYARD_RENDER_LIVE_TEST === "1";

describe.skipIf(!LIVE)("a real render (SHIPYARD_RENDER_LIVE_TEST=1)", () => {
  it("renders example.com with a real chromium", async () => {
    const result = await renderLiveProduct("https://example.com", { timeoutMs: 30_000 });
    expect(result.ok).toBe(true);
    expect(result.domText).toMatch(/Example Domain/i);
    expect(result.screenshotPng?.length ?? 0).toBeGreaterThan(1000);
  }, 60_000);
});
