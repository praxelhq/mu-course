import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { __setS3TestOverrides } from "../lib/s3";
import { main as runSeed } from "../prisma/seed";
import {
  backfillGalleryItems,
  getGalleryWalls,
  SCREENSHOT_BLOCKED,
  syncGalleryItem,
} from "../lib/galleries";
import {
  handleScreenshotCapture,
  type BrowserLike,
  type PageLike,
} from "../worker/jobs/screenshot-capture";
import type { LookupFn } from "../lib/net/safe-fetch";

// U11 — galleries (App / Workflow / Map walls) + screenshot capture worker.
// Live-DB tests against the deterministic seed (self-skip without Postgres).
//
// Seed facts used below:
//   apps      sub_027 (graded, featured), sub_028 (graded), sub_029 (finalised),
//             sub_030 (graded) — owner user_s191 — all with GalleryItems.
//   workflows sub_033 (graded, featured, team_A2), sub_034 (graded, team_B3),
//             sub_035 (finalised, team_C4).
//   maps      sub_037 (graded, team_E1), sub_038 (graded, team_F2).
//   sub_001 is a *skill* submission (galleryEligible=false), status graded.

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

/** Every key appearing anywhere in a JSON-ish value (deep). */
function collectKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    for (const x of v) collectKeys(x, out);
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) {
      out.add(k);
      collectKeys(val, out);
    }
  }
  return out;
}

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const okFetch: typeof fetch = async () => new Response(null, { status: 200 });

function fakePage(opts: { failNav?: boolean } = {}): PageLike {
  return {
    setViewportSize: async () => {},
    route: async () => {},
    goto: async () => {
      if (opts.failNav) throw new Error("nav failed (fake)");
    },
    screenshot: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  };
}

function fakeLaunch(opts: { failNav?: boolean } = {}, log: string[] = []) {
  return async (): Promise<BrowserLike> => {
    log.push("launch");
    return {
      newPage: async () => fakePage(opts),
      close: async () => {
        log.push("close");
      },
    };
  };
}

describe.skipIf(!live)("U11 galleries + screenshot capture (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  const stored: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const s3ForJob = {
    configured: () => true,
    putObject: async (key: string, bytes: Uint8Array, contentType: string) => {
      stored.push({ key, bytes, contentType });
    },
  };

  beforeAll(async () => {
    await runSeed(); // pristine world — earlier test files mutate the DB
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    __setS3TestOverrides({
      configured: true,
      sign: (d) => `https://signed.example/${d.key}`,
    });
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    __setS3TestOverrides(null);
    await prisma?.$disconnect();
  });

  // --- syncGalleryItem -----------------------------------------------------

  it("does not create items for non-galleryEligible types", async () => {
    const res = await syncGalleryItem("sub_001"); // graded skill submission
    expect(res).toBeNull();
    const item = await prisma.galleryItem.findUnique({ where: { submissionId: "sub_001" } });
    expect(item).toBeNull();
  });

  it("does not create items for ungraded submissions", async () => {
    // sub_031 is an app submission with status 'submitted'.
    const res = await syncGalleryItem("sub_031");
    expect(res).toBeNull();
    expect(await prisma.galleryItem.findUnique({ where: { submissionId: "sub_031" } })).toBeNull();
  });

  it("is idempotent for an already-synced submission", async () => {
    const before = await prisma.galleryItem.count();
    const a = await syncGalleryItem("sub_027");
    const b = await syncGalleryItem("sub_027");
    expect(a?.id).toBe("gal_sub_027");
    expect(b?.id).toBe("gal_sub_027");
    expect(await prisma.galleryItem.count()).toBe(before);
  });

  it("supersedes: resubmission moves the item to the latest graded version", async () => {
    // sub_028: app, user user_s071. Create a graded v2 and sync it.
    const v1 = await prisma.submission.findUniqueOrThrow({ where: { id: "sub_028" } });
    await prisma.submission.create({
      data: {
        id: "sub_028_v2t",
        assignmentId: v1.assignmentId,
        userId: v1.userId,
        status: "graded",
        submittedAt: new Date(),
        fields: v1.fields as object,
        files: v1.files,
        version: 2,
        contentHash: "seedhash_sub_028_v2t",
      },
    });
    const moved = await syncGalleryItem("sub_028_v2t");
    expect(moved?.id).toBe("gal_sub_028"); // same row, refreshed
    expect(moved?.submissionId).toBe("sub_028_v2t");
    expect(moved?.screenshotS3Key).toBeNull(); // content changed → recapture
    expect(await prisma.galleryItem.findUnique({ where: { submissionId: "sub_028" } })).toBeNull();
    // Syncing the OLD version now is a no-op that keeps the item on v2.
    const again = await syncGalleryItem("sub_028");
    expect(again?.submissionId).toBe("sub_028_v2t");
  });

  it("backfillGalleryItems creates missing items and is idempotent", async () => {
    await prisma.galleryItem.delete({ where: { id: "gal_sub_037" } });
    const n1 = await backfillGalleryItems();
    expect(n1).toBeGreaterThanOrEqual(1);
    expect(await prisma.galleryItem.findUnique({ where: { submissionId: "sub_037" } })).toBeTruthy();
    const count = await prisma.galleryItem.count();
    await backfillGalleryItems();
    expect(await prisma.galleryItem.count()).toBe(count);
  });

  // --- getGalleryWalls -----------------------------------------------------

  it("returns three walls and NEVER leaks grade/score/prompt data", async () => {
    const walls = await getGalleryWalls({});
    expect(walls.app.length).toBeGreaterThan(0);
    expect(walls.workflow.length).toBeGreaterThan(0);
    expect(walls.maps.length).toBeGreaterThan(0);

    const keys = collectKeys(JSON.parse(JSON.stringify(walls)));
    for (const forbidden of ["total", "confidence", "rubricScores", "promptLog", "feedbackMd", "grades", "grade"]) {
      expect(keys.has(forbidden), `forbidden key leaked: ${forbidden}`).toBe(false);
    }

    const app = walls.app.find((i) => i.id === "gal_sub_027");
    expect(app?.featured).toBe(true);
    expect(app?.links.appUrl).toMatch(/^https:\/\/forge-sub_027/);
    expect(app?.links.githubUrl).toMatch(/^https:\/\/github\.com\//);
    expect(app?.sectionCode).toBeTruthy();
  });

  it("filters by section and sector", async () => {
    // team_A2 (workflow sub_033) lives in section A.
    const secA = await getGalleryWalls({ filter: { sectionId: "sec_A" } });
    const all = [...secA.app, ...secA.workflow, ...secA.maps];
    expect(all.length).toBeGreaterThan(0);
    for (const item of all) expect(item.sectionCode).toBe("A");

    const wf = await getGalleryWalls({});
    const sector = wf.workflow[0]?.sectorName;
    expect(sector).toBeTruthy();
    const bySector = await getGalleryWalls({ filter: { sector: sector! } });
    const flat = [...bySector.app, ...bySector.workflow, ...bySector.maps];
    expect(flat.length).toBeGreaterThan(0);
    for (const item of flat) expect(item.sectorName).toBe(sector);
  });

  it("withholds workflow files unless featured (company-engagement rule)", async () => {
    const walls = await getGalleryWalls({});
    const featured = walls.workflow.find((i) => i.featured);
    const plain = walls.workflow.find((i) => !i.featured);
    expect(featured).toBeTruthy();
    expect(plain).toBeTruthy();
    expect(featured!.files.length).toBeGreaterThan(0);
    expect(featured!.filesWithheld).toBe(false);
    expect(plain!.files).toEqual([]);
    expect(plain!.filesWithheld).toBe(true);
    // App + map walls always expose their links/files.
    expect(walls.maps.some((i) => i.files.length > 0)).toBe(true);
  });

  // --- feature endpoint ----------------------------------------------------

  function featureReq(userId: string, body: unknown) {
    return new Request("http://test.local/api/galleries/feature", {
      method: "POST",
      headers: {
        cookie: `${TEST_LOGIN_COOKIE}=${userId}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  it("instructor can feature/unfeature with an AuditLog row", async () => {
    const { POST } = await import("../app/api/galleries/feature/route");
    const res = await POST(
      featureReq("user_instructor", { galleryItemId: "gal_sub_034", featured: true, caption: "Ops win" }),
    );
    expect(res.status).toBe(200);
    const item = await prisma.galleryItem.findUniqueOrThrow({ where: { id: "gal_sub_034" } });
    expect(item.featured).toBe(true);
    expect(item.caption).toBe("Ops win");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "gallery.feature", targetId: "gal_sub_034" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.actorId).toBe("user_instructor");

    const res2 = await POST(featureReq("user_instructor", { galleryItemId: "gal_sub_034", featured: false }));
    expect(res2.status).toBe(200);
    const audit2 = await prisma.auditLog.findFirst({
      where: { action: "gallery.unfeature", targetId: "gal_sub_034" },
    });
    expect(audit2).toBeTruthy();
  });

  it("students get 403 from the feature endpoint", async () => {
    const { POST } = await import("../app/api/galleries/feature/route");
    const res = await POST(featureReq("user_s001", { galleryItemId: "gal_sub_034", featured: true }));
    expect(res.status).toBe(403);
  });

  // --- screenshot capture job ---------------------------------------------

  it("captures a screenshot via the DI'd browser and stores the png key", async () => {
    stored.length = 0;
    await prisma.galleryItem.update({
      where: { id: "gal_sub_030" },
      data: { screenshotS3Key: null },
    });
    const log: string[] = [];
    await handleScreenshotCapture("sub_030", {
      launchBrowser: fakeLaunch({}, log),
      s3: s3ForJob,
      fetchImpl: okFetch,
      lookup: publicLookup,
    });
    expect(log).toContain("launch");
    expect(log).toContain("close");
    expect(stored.map((s) => s.key)).toContain("gallery/screenshots/sub_030.png");
    const item = await prisma.galleryItem.findUniqueOrThrow({ where: { id: "gal_sub_030" } });
    expect(item.screenshotS3Key).toBe("gallery/screenshots/sub_030.png");
  });

  it("marks the item 'blocked' for private appUrls and never launches the browser", async () => {
    stored.length = 0;
    await prisma.submission.update({
      where: { id: "sub_027" },
      data: { fields: { appUrl: "http://10.0.0.5/internal", githubUrl: "https://github.com/x/y", writeup: "w" } },
    });
    const log: string[] = [];
    await handleScreenshotCapture("sub_027", {
      launchBrowser: fakeLaunch({}, log),
      s3: s3ForJob,
      fetchImpl: okFetch,
      lookup: publicLookup,
    });
    expect(log).toEqual([]); // browser never launched
    expect(stored).toEqual([]);
    const item = await prisma.galleryItem.findUniqueOrThrow({ where: { id: "gal_sub_027" } });
    expect(item.screenshotS3Key).toBe(SCREENSHOT_BLOCKED);
  });

  it("falls back to og:image when navigation fails", async () => {
    stored.length = 0;
    await prisma.galleryItem.update({
      where: { id: "gal_sub_029" },
      data: { screenshotS3Key: null },
    });
    const html = `<html><head><meta property="og:image" content="https://cdn.example.com/shot.png"/></head></html>`;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (init?.method === "HEAD") return new Response(null, { status: 200 });
      if (url.includes("cdn.example.com")) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    };
    await handleScreenshotCapture("sub_029", {
      launchBrowser: fakeLaunch({ failNav: true }),
      s3: s3ForJob,
      fetchImpl,
      lookup: publicLookup,
    });
    expect(stored.map((s) => s.key)).toContain("gallery/screenshots/sub_029.png");
    const item = await prisma.galleryItem.findUniqueOrThrow({ where: { id: "gal_sub_029" } });
    expect(item.screenshotS3Key).toBe("gallery/screenshots/sub_029.png");
  });

  it("leaves the key null on nav failure with no og:image (and does not throw)", async () => {
    stored.length = 0;
    await prisma.galleryItem.update({
      where: { id: "gal_sub_029" },
      data: { screenshotS3Key: null },
    });
    const fetchImpl: typeof fetch = async (_input, init) =>
      init?.method === "HEAD"
        ? new Response(null, { status: 200 })
        : new Response("<html><head></head></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          });
    await expect(
      handleScreenshotCapture("sub_029", {
        launchBrowser: fakeLaunch({ failNav: true }),
        s3: s3ForJob,
        fetchImpl,
        lookup: publicLookup,
      }),
    ).resolves.toBeUndefined();
    expect(stored).toEqual([]);
    const item = await prisma.galleryItem.findUniqueOrThrow({ where: { id: "gal_sub_029" } });
    expect(item.screenshotS3Key).toBeNull();
  });
});
