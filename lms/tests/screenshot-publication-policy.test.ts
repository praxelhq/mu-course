import { describe, expect, it } from "vitest";
import type { GeneratedObjectReservation, Prisma, PrismaClient } from "@prisma/client";
import { writeGeneratedObject } from "../lib/generated-object-reservations";
import { SCREENSHOT_BLOCKED } from "../lib/galleries";
import type { PublicationPolicy } from "../lib/publication-policy";
import {
  handleScreenshotCapture,
  makeRoutePolicy,
  type BrowserLike,
  type PageLike,
} from "../worker/jobs/screenshot-capture";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

const appPolicy: PublicationPolicy = {
  wall: "app",
  consentField: "galleryConsent",
  captionField: "galleryCaption",
  publicTextFields: ["galleryCaption"],
  previewRole: "appScreenshot",
  actions: [
    {
      label: "View app",
      field: "appUrl",
      kind: "external-url",
      allowedHosts: ["*.lovable.app"],
      urlKind: "generic",
      requireReviewedFingerprint: true,
    },
  ],
};

const workflowPolicy: PublicationPolicy = {
  wall: "workflow",
  consentField: "galleryConsent",
  captionField: "gallerySummary",
  publicTextFields: ["workflowTitle", "gallerySummary"],
  previewRole: "workflowPngFile",
  actions: [
    {
      label: "Clone in Make",
      field: "scenarioShareUrl",
      kind: "external-url",
      allowedHosts: ["*.make.com"],
      urlKind: "make-scenario",
      requireReviewedFingerprint: true,
    },
  ],
};

function submission(policy: PublicationPolicy, patch: Record<string, unknown> = {}) {
  return {
    id: "submission-1",
    assessmentVersionId: "assessment-v1",
    assignment: { assignmentType: { slug: policy.wall } },
    assessmentVersion: { publicationPolicy: policy },
    assessmentResult: { publishable: true },
    publicationDecision: {
      id: "publication-decision-1",
      ownerConsent: true,
      ownerRevokedAt: null,
      instructorState: "pending",
      reviewedFingerprint: null,
      previewS3Key: null,
      previewS3VersionId: null,
    },
    fields:
      policy.wall === "app"
        ? { appUrl: "https://signalshelf.lovable.app", galleryConsent: true }
        : {
            scenarioShareUrl: "https://eu1.make.com/public/shared-scenario/abc/demo",
            galleryConsent: true,
          },
    evidence: [],
    ...patch,
  };
}

function browser(png = new Uint8Array([1, 2, 3, 4])): BrowserLike {
  return {
    newPage: async () => ({
      setViewportSize: async () => {},
      route: async () => {},
      goto: async () => null,
      screenshot: async () => png,
    }),
    close: async () => {},
  };
}

function fakeGeneratedWriter(
  db: PrismaClient,
  stored: string[],
): typeof writeGeneratedObject {
  return (async (args: Parameters<typeof writeGeneratedObject>[0]) => {
    const reservationId = "generated-screenshot-reservation";
    const s3Key =
      typeof args.reservation.s3Key === "function"
        ? args.reservation.s3Key(reservationId)
        : args.reservation.s3Key;
    const s3VersionId = "screenshot-version-1";
    stored.push(s3Key);
    const value = await args.attach(db as unknown as Prisma.TransactionClient, {
      reservationId,
      s3Key,
      s3VersionId,
    });
    const reservation = {
      id: reservationId,
      purpose: args.reservation.purpose,
      submissionId: args.reservation.submissionId ?? null,
      interviewId: args.reservation.interviewId ?? null,
      targetId: args.reservation.targetId ?? null,
      s3Key,
      declaredContentType: args.reservation.declaredContentType ?? null,
      declaredBytes: args.reservation.declaredBytes ?? null,
      s3VersionId,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies GeneratedObjectReservation;
    return {
      value,
      reservation,
      receipt: { versionId: s3VersionId, etag: null },
    };
  }) as typeof writeGeneratedObject;
}

describe("versioned publication preview capture", () => {
  it("captures a private preview while approval is pending and never self-approves its bytes", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const stored: string[] = [];
    const synced: string[] = [];
    const db = {
      submission: { findUnique: async () => submission(appPolicy) },
      publicationDecision: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return { count: 1 };
        },
      },
    } as unknown as PrismaClient;

    await handleScreenshotCapture("submission-1", {
      prisma: db,
      lookup: publicLookup,
      fetchImpl: async () => new Response(null, { status: 200 }),
      launchBrowser: async () => browser(),
      s3: {
        configured: () => true,
        putObject: async () => ({ versionId: "unused", etag: null }),
      },
      writeGeneratedObject: fakeGeneratedWriter(db, stored),
      syncProjection: async (submissionId) => {
        synced.push(submissionId);
      },
    });

    expect(stored).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].previewS3Key).toMatch(
      /^gallery\/screenshots\/submission-1-[a-f0-9]{64}-generated-screenshot-reservation\.png$/,
    );
    expect(updates[0].previewS3VersionId).toBe("screenshot-version-1");
    expect(updates[0]).not.toHaveProperty("reviewedFingerprint");
    expect(updates[0]).not.toHaveProperty("reviewedAt");
    expect(synced).toEqual(["submission-1"]);
  });

  it("marks a failed dynamic recrawl stale without changing the reviewed fingerprint", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      submission: {
        findUnique: async () =>
          submission(workflowPolicy, {
            publicationDecision: {
              id: "publication-decision-1",
              ownerConsent: true,
              ownerRevokedAt: null,
              instructorState: "approved",
              reviewedFingerprint: "sha256:previous-review",
              previewS3Key: "external-fingerprint:sha256:old",
              previewS3VersionId: null,
            },
          }),
      },
      publicationDecision: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return { count: 1 };
        },
      },
    } as unknown as PrismaClient;

    await handleScreenshotCapture("submission-1", {
      prisma: db,
      lookup: publicLookup,
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
      syncProjection: async () => {},
    });

    expect(updates).toEqual([
      { previewS3Key: SCREENSHOT_BLOCKED, previewS3VersionId: null },
    ]);
  });

  it("stages an incomplete marker when the rendered app attempts a write", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const stored: string[] = [];
    let routeHandler: Parameters<PageLike["route"]>[1] | undefined;
    const blockedWriteBrowser: BrowserLike = {
      newPage: async () => ({
        setViewportSize: async () => {},
        route: async (_pattern, handler) => {
          routeHandler = handler;
        },
        goto: async () => {
          if (!routeHandler) throw new Error("route handler not installed");
          await routeHandler({
            request: () => ({
              url: () => "https://signalshelf.lovable.app/api/analytics",
              method: () => "POST",
            }),
            abort: async () => {},
            fulfill: async () => {},
          });
          return null;
        },
        screenshot: async () => new Uint8Array([1, 2, 3]),
      }),
      close: async () => {},
    };
    const db = {
      submission: { findUnique: async () => submission(appPolicy) },
      publicationDecision: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return { count: 1 };
        },
      },
    } as unknown as PrismaClient;

    await handleScreenshotCapture("submission-1", {
      prisma: db,
      lookup: publicLookup,
      fetchImpl: async () => new Response(null, { status: 200 }),
      launchBrowser: async () => blockedWriteBrowser,
      s3: {
        configured: () => true,
        putObject: async () => ({ versionId: "unused", etag: null }),
      },
      writeGeneratedObject: fakeGeneratedWriter(db, stored),
      syncProjection: async () => {},
    });

    expect(stored).toEqual([]);
    expect(updates).toEqual([
      { previewS3Key: SCREENSHOT_BLOCKED, previewS3VersionId: null },
    ]);
  });
});

describe("pinned browser resource routing", () => {
  it("fulfils vetted GET bytes without forwarding credential-setting headers", async () => {
    const fulfilled: Array<{
      status: number;
      headers: Record<string, string>;
      body: Buffer;
    }> = [];
    let aborted = false;
    const route = {
      request: () => ({
        url: () => "https://signalshelf.lovable.app/assets/app.css",
        method: () => "GET",
      }),
      abort: async () => {
        aborted = true;
      },
      fulfill: async (response: (typeof fulfilled)[number]) => {
        fulfilled.push(response);
      },
    };

    await makeRoutePolicy({
      lookup: publicLookup,
      fetchImpl: async (_input, init) => {
        expect(new Headers(init?.headers).has("authorization")).toBe(false);
        expect(new Headers(init?.headers).has("cookie")).toBe(false);
        return new Response("body{}", {
          status: 200,
          headers: {
            "content-type": "text/css; charset=utf-8",
            "set-cookie": "session=secret",
            "www-authenticate": "Bearer",
            etag: "v1",
          },
        });
      },
    })(route);

    expect(aborted).toBe(false);
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].body.toString()).toBe("body{}");
    expect(fulfilled[0].headers["content-type"]).toBe("text/css; charset=utf-8");
    expect(fulfilled[0].headers.etag).toBe("v1");
    expect(fulfilled[0].headers["set-cookie"]).toBeUndefined();
    expect(fulfilled[0].headers["www-authenticate"]).toBeUndefined();
  });

  it("aborts non-GET and private-address requests and marks them incomplete", async () => {
    const reasons: string[] = [];
    let fetches = 0;
    const routeFor = (method: string) => {
      let aborted = false;
      return {
        route: {
          request: () => ({
            url: () => "https://signalshelf.lovable.app/resource",
            method: () => method,
          }),
          abort: async () => {
            aborted = true;
          },
          fulfill: async () => {},
        },
        aborted: () => aborted,
      };
    };

    const write = routeFor("POST");
    await makeRoutePolicy({
      lookup: publicLookup,
      fetchImpl: async () => {
        fetches += 1;
        return new Response("unexpected", { headers: { "content-type": "text/plain" } });
      },
      onIncomplete: (reason) => reasons.push(reason),
    })(write.route);

    const privateRequest = routeFor("GET");
    await makeRoutePolicy({
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      fetchImpl: async () => {
        fetches += 1;
        return new Response("unexpected", { headers: { "content-type": "text/plain" } });
      },
      onIncomplete: (reason) => reasons.push(reason),
    })(privateRequest.route);

    expect(write.aborted()).toBe(true);
    expect(privateRequest.aborted()).toBe(true);
    expect(fetches).toBe(0);
    expect(reasons).toEqual([
      "blocked browser method POST",
      "browser resource fetch blocked or incomplete",
    ]);
  });

  it("returns a synthetic redirect so the browser adopts the validated final URL", async () => {
    const fulfilled: Array<{
      status: number;
      headers: Record<string, string>;
      body: Buffer;
    }> = [];
    const route = {
      request: () => ({
        url: () => "http://signalshelf.lovable.app",
        method: () => "GET",
      }),
      abort: async () => {},
      fulfill: async (response: (typeof fulfilled)[number]) => {
        fulfilled.push(response);
      },
    };
    const seen: string[] = [];

    await makeRoutePolicy({
      lookup: publicLookup,
      fetchImpl: async (input) => {
        const url = input.toString();
        seen.push(url);
        if (url.startsWith("http://")) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://signalshelf.lovable.app/app/" },
          });
        }
        return new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        });
      },
    })(route);

    expect(seen).toHaveLength(2);
    expect(fulfilled).toEqual([
      {
        status: 302,
        headers: {
          location: "https://signalshelf.lovable.app/app/",
          "cache-control": "no-store",
        },
        body: Buffer.alloc(0),
      },
    ]);
  });
});
