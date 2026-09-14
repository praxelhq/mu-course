import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  createSubmission,
  SubmissionError,
  collectFileKeys,
  allowedContentTypes,
  type SubmissionFileInput,
} from "@/lib/shipyard/submissions";
import { parseTrackerSlug } from "@/lib/shipyard/products";
import { ShipyardError } from "@/lib/shipyard/errors";
import {
  displayNameFromKey,
  normaliseContentType,
  shipyardUploadCap,
  keyPrefixForProduct,
} from "@/lib/shipyard/uploads";
import { resetRateLimits, takeToken } from "@/lib/shipyard/rate-limit";
import { SafeFetchBlockedError } from "@/lib/net/safe-fetch";
import type { FieldSpec } from "@/lib/shipyard/fields";

// ---------------------------------------------------------------------------
// A fake database, small enough to read
// ---------------------------------------------------------------------------

const IDEA_FIELDS: FieldSpec[] = [
  { key: "productName", label: "Product name", kind: "text", required: true },
  { key: "oneLiner", label: "One line", kind: "text", required: true },
  { key: "waitlistUrl", label: "Waitlist URL", kind: "url", required: true },
  {
    key: "signupScreenshot",
    label: "Screenshot",
    kind: "images",
    required: false,
    maxFiles: 3,
    accept: ["image/png", "image/jpeg", "image/webp"],
  },
];

const GOOD_FIELDS = {
  productName: "TiffinTrail",
  oneLiner: "Weekly tiffin subscriptions from verified home kitchens",
  waitlistUrl: "https://tiffintrail.example.com/waitlist",
};

type FakeWorld = {
  product?: { id: string } | null;
  checkpoint?: Record<string, unknown> | null;
  state?: { state: "locked" | "open" | "passed" } | null;
  prior?: { id: string; version: number; status: string; submittedAt: Date | null }[];
};

type Recorder = {
  created: Record<string, unknown>[];
  productUpdates: Record<string, unknown>[];
  enqueued: string[];
};

function fakeDb(world: FakeWorld, rec: Recorder) {
  const tx = {
    shipyardSubmission: {
      create: async (args: { data: Record<string, unknown> }) => {
        rec.created.push(args.data);
        return { id: "sub_new" };
      },
    },
    shipyardProduct: {
      update: async (args: { data: Record<string, unknown> }) => {
        rec.productUpdates.push(args.data);
        return {};
      },
    },
  };
  return {
    shipyardProduct: {
      findUnique: async () => (world.product === undefined ? { id: "prod_1" } : world.product),
      update: tx.shipyardProduct.update,
    },
    shipyardCheckpoint: {
      findUnique: async () =>
        world.checkpoint === undefined
          ? {
              id: "cp_idea",
              key: "idea",
              order: 1,
              fieldSchema: IDEA_FIELDS,
              resubmitCooldownMinutes: 15,
            }
          : world.checkpoint,
    },
    shipyardCheckpointState: {
      findUnique: async () => (world.state === undefined ? { state: "open" } : world.state),
    },
    shipyardSubmission: {
      findMany: async () => world.prior ?? [],
      create: tx.shipyardSubmission.create,
    },
    $transaction: async <T>(fn: (t: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;
}

function deps(world: FakeWorld, rec: Recorder, over: Record<string, unknown> = {}) {
  return {
    db: fakeDb(world, rec),
    storageConfigured: () => false,
    probe: async () => ({ ok: true, status: 200 }),
    enqueue: async (id: string) => {
      rec.enqueued.push(id);
      return null;
    },
    ...over,
  };
}

function recorder(): Recorder {
  return { created: [], productUpdates: [], enqueued: [] };
}

async function refusal(fn: () => Promise<unknown>): Promise<SubmissionError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof SubmissionError) return err;
    throw err;
  }
  throw new Error("expected a SubmissionError");
}

const NOW = new Date("2026-09-14T12:00:00Z");

// ---------------------------------------------------------------------------

describe("createSubmission guards", () => {
  it("refuses a student with no product", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
        deps({ product: null }, rec),
      ),
    );
    expect(err.status).toBe(404);
  });

  it("refuses a locked checkpoint with 'not open'", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
        deps({ state: { state: "locked" } }, rec),
      ),
    );
    expect(err.status).toBe(409);
    expect(err.body.error).toMatch(/not open/i);
  });

  it("refuses a checkpoint with no state row at all", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
        deps({ state: null }, rec),
      ),
    );
    expect(err.status).toBe(409);
  });

  it("refuses a cleared checkpoint with 'already cleared'", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
        deps({ state: { state: "passed" } }, rec),
      ),
    );
    expect(err.status).toBe(409);
    expect(err.body.error).toMatch(/already cleared/i);
  });

  it("returns every field error at once, not the first", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: { waitlistUrl: "not-a-url" }, now: NOW },
        deps({}, rec),
      ),
    );
    expect(err.status).toBe(400);
    expect(err.body.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("productName"),
        expect.stringContaining("oneLiner"),
        expect.stringContaining("waitlistUrl"),
      ]),
    );
  });

  it("refuses while a prior attempt is still in review", async () => {
    const rec = recorder();
    for (const status of ["submitted", "in_review"]) {
      const err = await refusal(() =>
        createSubmission(
          { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
          deps(
            { prior: [{ id: "s1", version: 1, status, submittedAt: new Date("2026-09-14T11:00:00Z") }] },
            rec,
          ),
        ),
      );
      expect(err.status, status).toBe(409);
      expect(err.body.error).toMatch(/in review/i);
    }
  });

  it("refuses inside the cooldown, and says exactly when it lifts", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
        deps(
          {
            prior: [
              {
                id: "s1",
                version: 1,
                status: "returned",
                submittedAt: new Date("2026-09-14T11:50:00Z"),
              },
            ],
          },
          rec,
        ),
      ),
    );
    expect(err.status).toBe(429);
    expect(err.body.nextAllowedResubmitAt).toBe("2026-09-14T12:05:00.000Z");
    expect(err.body.humanText).toBe("5 minutes");
    expect(rec.created).toHaveLength(0);
  });

  it("lets a resubmit through once the cooldown has lapsed, at version 2", async () => {
    const rec = recorder();
    const result = await createSubmission(
      { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
      deps(
        {
          prior: [
            {
              id: "s1",
              version: 1,
              status: "returned",
              submittedAt: new Date("2026-09-14T11:00:00Z"),
            },
          ],
        },
        rec,
      ),
    );
    expect(result.version).toBe(2);
    expect(result.status).toBe("submitted");
    expect(rec.created[0].version).toBe(2);
  });
});

describe("createSubmission file handling", () => {
  it("refuses a key that belongs to somebody else's product", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        {
          userId: "u1",
          checkpointKey: "idea",
          fields: { ...GOOD_FIELDS, signupScreenshot: ["shipyard/prod_OTHER/idea/x-a.png"] },
          now: NOW,
        },
        deps({}, rec),
      ),
    );
    expect(err.status).toBe(400);
    expect(err.body.error).toMatch(/does not belong to your product/i);
  });

  it("refuses a file list entry outside the product prefix", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        {
          userId: "u1",
          checkpointKey: "idea",
          fields: GOOD_FIELDS,
          files: [{ key: "submissions/u1/a.png", name: "a.png", contentType: "image/png", bytes: 5 }],
          now: NOW,
        },
        deps({}, rec),
      ),
    );
    expect(err.status).toBe(400);
  });

  it("refuses a file S3 has never seen when storage is on", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        {
          userId: "u1",
          checkpointKey: "idea",
          fields: GOOD_FIELDS,
          files: [
            {
              key: "shipyard/prod_1/idea/u-shot.png",
              name: "shot.png",
              contentType: "image/png",
              bytes: 5,
            },
          ],
          now: NOW,
        },
        deps({}, rec, {
          storageConfigured: () => true,
          headObject: async () => {
            throw new Error("404");
          },
        }),
      ),
    );
    expect(err.status).toBe(400);
    expect(err.body.error).toContain("shot.png");
  });

  it("accepts a file under its own product prefix", async () => {
    const rec = recorder();
    const head = vi.fn(async () => ({ contentType: "image/png", contentLength: 5 }));
    await createSubmission(
      {
        userId: "u1",
        checkpointKey: "idea",
        fields: { ...GOOD_FIELDS, signupScreenshot: ["shipyard/prod_1/idea/u-shot.png"] },
        files: [
          {
            key: "shipyard/prod_1/idea/u-shot.png",
            name: "shot.png",
            contentType: "image/png",
            bytes: 5,
          },
        ],
        now: NOW,
      },
      deps({}, rec, { storageConfigured: () => true, headObject: head }),
    );
    expect(head).toHaveBeenCalledTimes(1);
    expect(rec.created).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // What S3 holds beats what the body claimed (SEC-4)
  // -------------------------------------------------------------------------

  const pngKey = "shipyard/prod_1/idea/u-shot.png";
  const lie = {
    key: pngKey,
    name: "../../../etc/passwd",
    contentType: "image/png",
    bytes: 5,
  };

  function submitWith(
    rec: ReturnType<typeof recorder>,
    headResult: { contentType: string; contentLength: number },
  ) {
    return createSubmission(
      {
        userId: "u1",
        checkpointKey: "idea",
        fields: { ...GOOD_FIELDS, signupScreenshot: [pngKey] },
        files: [lie],
        now: NOW,
      },
      deps({}, rec, {
        storageConfigured: () => true,
        headObject: async () => headResult,
      }),
    );
  }

  it("stores the OBSERVED type and size, not the ones the body claimed", async () => {
    const rec = recorder();
    await submitWith(rec, { contentType: "image/JPEG", contentLength: 4096 });
    const stored = (rec.created[0].files as SubmissionFileInput[])[0];
    expect(stored.contentType).toBe("image/jpeg");
    expect(stored.bytes).toBe(4096);
  });

  it("derives the display name from the sanitised key, not from `name`", async () => {
    const rec = recorder();
    await submitWith(rec, { contentType: "image/png", contentLength: 5 });
    const stored = (rec.created[0].files as SubmissionFileInput[])[0];
    expect(stored.name).toBe("u-shot.png");
    expect(stored.name).not.toContain("..");
  });

  it("refuses an object stored as a type this checkpoint does not accept", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      submitWith(rec, { contentType: "application/pdf", contentLength: 100 }),
    );
    expect(err.status).toBe(400);
    expect(err.body.error).toContain("application/pdf");
    expect(rec.created).toHaveLength(0);
  });

  it("refuses an object stored as a type the Shipyard does not take at all", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      submitWith(rec, { contentType: "text/html", contentLength: 100 }),
    );
    expect(err.status).toBe(400);
    expect(err.body.error).toMatch(/does not take/);
  });

  it("refuses an object over its type's cap however small the body said it was", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      submitWith(rec, { contentType: "image/png", contentLength: 40 * 1024 * 1024 }),
    );
    expect(err.status).toBe(400);
    expect(err.body.error).toMatch(/over the 25MB limit/);
    expect(rec.created).toHaveLength(0);
  });

  it("names the file by its key when storage cannot find it", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        {
          userId: "u1",
          checkpointKey: "idea",
          fields: GOOD_FIELDS,
          files: [lie],
          now: NOW,
        },
        deps({}, rec, {
          storageConfigured: () => true,
          headObject: async () => {
            throw new Error("404");
          },
        }),
      ),
    );
    expect(err.body.error).toContain("u-shot.png");
    expect(err.body.error).not.toContain("etc/passwd");
  });

  it("rejects a malformed files payload before touching the database", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, files: [{ key: 7 }], now: NOW },
        deps({}, rec),
      ),
    );
    expect(err.status).toBe(400);
    expect(rec.created).toHaveLength(0);
  });
});

describe("collectFileKeys", () => {
  it("gathers keys from the file list and from every file-kind field", () => {
    expect(
      collectFileKeys(
        IDEA_FIELDS,
        { signupScreenshot: ["a", "b"] },
        [{ key: "b", name: "b", contentType: "image/png", bytes: 1 }],
      ).sort(),
    ).toEqual(["a", "b"]);
  });
});

describe("createSubmission link liveness", () => {
  it("names the field when a link is dead", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
        deps({}, rec, { probe: async () => ({ ok: false, status: 404 }) }),
      ),
    );
    expect(err.status).toBe(400);
    expect(err.body.field).toBe("waitlistUrl");
    expect(err.body.error).toContain("404");
  });

  it("says a private address is not reachable from here", async () => {
    const rec = recorder();
    const err = await refusal(() =>
      createSubmission(
        { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
        deps({}, rec, {
          probe: async () => {
            throw new SafeFetchBlockedError("Blocked address 127.0.0.1");
          },
        }),
      ),
    );
    expect(err.status).toBe(400);
    expect(err.body.error).toMatch(/not reachable from here/i);
    expect(err.body.field).toBe("waitlistUrl");
  });
});

describe("createSubmission happy path", () => {
  it("writes the submission, names the product, and enqueues the review", async () => {
    const rec = recorder();
    const result = await createSubmission(
      { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
      deps({}, rec),
    );
    expect(result).toMatchObject({
      submissionId: "sub_new",
      status: "submitted",
      version: 1,
      nextAllowedResubmitAt: "2026-09-14T12:15:00.000Z",
    });
    expect(rec.created[0]).toMatchObject({
      status: "submitted",
      version: 1,
      submittedAt: NOW,
    });
    // Checkpoint 1 is where a product gets its name.
    expect(rec.productUpdates[0]).toEqual({
      name: "TiffinTrail",
      oneLiner: "Weekly tiffin subscriptions from verified home kitchens",
      waitlistUrl: "https://tiffintrail.example.com/waitlist",
    });
    expect(rec.enqueued).toEqual(["sub_new"]);
  });

  it("saves the submission even when the queue is down", async () => {
    const rec = recorder();
    const result = await createSubmission(
      { userId: "u1", checkpointKey: "idea", fields: GOOD_FIELDS, now: NOW },
      deps({}, rec, { enqueue: async () => null }),
    );
    expect(result.submissionId).toBe("sub_new");
    expect(rec.created).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Connecting the tracker
// ---------------------------------------------------------------------------

describe("parseTrackerSlug", () => {
  it("takes a project URL", () => {
    expect(parseTrackerSlug("https://shipped.money/p/tiffintrail")).toBe("tiffintrail");
    expect(parseTrackerSlug("  https://web-production.up.railway.app/p/keel-yard/  ")).toBe("keel-yard");
  });

  it("takes a bare slug", () => {
    expect(parseTrackerSlug("tiffintrail")).toBe("tiffintrail");
  });

  it("rejects anything that is not a project link", () => {
    for (const bad of [
      "",
      "https://shipped.money/",
      "https://shipped.money/p/",
      "https://shipped.money/cohorts/2026/p/x",
      "https://shipped.money/projects/tiffintrail",
      "ftp://shipped.money/p/x",
      "javascript:alert(1)",
      "not a slug at all",
      "../../etc/passwd",
    ]) {
      expect(() => parseTrackerSlug(bad), bad).toThrow(ShipyardError);
    }
  });
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

describe("shipyard upload rules", () => {
  it("normalises the types browsers actually send", () => {
    expect(normaliseContentType("IMAGE/JPG")).toBe("image/jpeg");
    expect(normaliseContentType("text/markdown; charset=utf-8")).toBe("text/markdown");
  });

  it("caps each kind where the spec says", () => {
    expect(shipyardUploadCap("image/png")).toBe(25 * 1024 * 1024);
    expect(shipyardUploadCap("application/pdf")).toBe(50 * 1024 * 1024);
    expect(shipyardUploadCap("video/mp4")).toBe(200 * 1024 * 1024);
    expect(shipyardUploadCap("text/markdown")).toBe(2 * 1024 * 1024);
    expect(shipyardUploadCap("image/heic")).toBe(25 * 1024 * 1024);
  });

  it("takes nothing else", () => {
    expect(shipyardUploadCap("application/zip")).toBeNull();
    expect(shipyardUploadCap("text/html")).toBeNull();
  });

  it("scopes a key by product", () => {
    expect(keyPrefixForProduct("syp_001")).toBe("shipyard/syp_001/");
  });
});

// ---------------------------------------------------------------------------
// The route's spam bound
// ---------------------------------------------------------------------------

describe("takeToken", () => {
  beforeEach(() => resetRateLimits());

  it("allows ten in a minute and refuses the eleventh", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      expect(takeToken("u1", { now: now + i }).allowed, `attempt ${i}`).toBe(true);
    }
    const refused = takeToken("u1", { now: now + 10 });
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("forgets attempts once the window has passed", () => {
    for (let i = 0; i < 10; i++) takeToken("u1", { now: 1_000_000 });
    expect(takeToken("u1", { now: 1_000_000 + 60_001 }).allowed).toBe(true);
  });

  it("counts each user separately", () => {
    for (let i = 0; i < 10; i++) takeToken("u1", { now: 1_000_000 });
    expect(takeToken("u2", { now: 1_000_000 }).allowed).toBe(true);
  });
});

describe("displayNameFromKey", () => {
  it("strips the server-minted uploadId and keeps the sanitised filename", () => {
    expect(
      displayNameFromKey(
        "shipyard/prod_1/design/3f2504e0-4f89-11d3-9a0c-0305e82c3301-sketch-4.jpg",
      ),
    ).toBe("sketch-4.jpg");
  });

  it("falls back to the last segment when there is no uploadId", () => {
    expect(displayNameFromKey("shipyard/prod_1/idea/u-shot.png")).toBe("u-shot.png");
  });

  it("never returns a path", () => {
    expect(displayNameFromKey("shipyard/prod_1/idea/")).toBe("idea");
    expect(displayNameFromKey("")).toBe("file");
  });
});

describe("allowedContentTypes", () => {
  it("is the union of the checkpoint's own accept lists", () => {
    const specs: FieldSpec[] = [
      {
        key: "shots",
        label: "Shots",
        kind: "images",
        required: true,
        accept: ["image/png", "image/JPG"],
      },
    ];
    expect(allowedContentTypes(specs)).toEqual(new Set(["image/png", "image/jpeg"]));
  });

  it("is null — the Shipyard's own list stands — when a field names none", () => {
    const specs: FieldSpec[] = [
      { key: "files", label: "Files", kind: "files", required: false },
    ];
    expect(allowedContentTypes(specs)).toBeNull();
  });

  it("is null on a checkpoint with no upload fields at all", () => {
    expect(allowedContentTypes([{ key: "a", label: "A", kind: "text", required: true }])).toBeNull();
  });
});
