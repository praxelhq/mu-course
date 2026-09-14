import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import type { DpdpErasureCounts } from "@/lib/dpdp-erasure";
import {
  EMPTY_SHIPYARD_COUNTS,
  NEAR_DUPLICATE_REDACTION,
  redactOtherStudentIds,
  reviewArtifactKeys,
  shipyardBadges,
  SHIPYARD_BADGES,
  SHIPYARD_ERASURE_TABLES,
  shipyardObjectRefs,
  submissionFileKeys,
} from "@/lib/dpdp-erasure-shipyard";
import { CHECKPOINT_ORDER } from "@/lib/shipyard/constants";

// ---------------------------------------------------------------------------
// The delete: every Shipyard table is accounted for
// ---------------------------------------------------------------------------

describe("Shipyard DPDP coverage", () => {
  it("counts every Shipyard table a learner owns rows in", () => {
    // If a Shipyard table is added to the schema and not to this list, a
    // deletion receipt would stop describing what it deleted.
    expect([...SHIPYARD_ERASURE_TABLES]).toEqual([
      "ShipyardReview",
      "ShipyardSubmission",
      "ShipyardCheckpointState",
      "ShipyardGrade",
      "ShipyardTrackerOverride",
      "ShipyardProduct",
    ]);
    expect(Object.keys(EMPTY_SHIPYARD_COUNTS).sort()).toEqual(
      [
        "shipyardCheckpointStates",
        "shipyardGrades",
        "shipyardProducts",
        "shipyardReviews",
        "shipyardSubmissions",
        "shipyardTrackerOverrides",
      ],
    );
  });

  it("is part of the erasure receipt's counts, not a separate ledger", () => {
    // A compile-time assertion made runtime-visible: the Shipyard counts are
    // keys of DpdpErasureCounts, so they land in the same receipt.
    const counts: Partial<DpdpErasureCounts> = { ...EMPTY_SHIPYARD_COUNTS };
    for (const key of Object.keys(EMPTY_SHIPYARD_COUNTS)) {
      expect(counts).toHaveProperty(key);
    }
  });

  it("claims every S3 key a Shipyard row points at", () => {
    const refs = shipyardObjectRefs(
      [
        {
          id: "sub_1",
          files: [
            { key: "shipyard/p1/idea/screenshot.png", name: "s.png", bytes: 10 },
            { key: "shipyard/p1/idea/second.png", name: "2.png", bytes: 10 },
            { key: "  ", name: "blank" },
            "not an object",
          ],
        },
        { id: "sub_2", files: null },
      ],
      [
        { id: "rev_1", renderArtifacts: { screenshotS3Key: "shipyard/p1/working/render.png" } },
        { id: "rev_2", renderArtifacts: null },
        { id: "rev_3", renderArtifacts: { domTextExcerpt: "no screenshot here" } },
      ],
    );
    expect(refs.map((r) => r.key)).toEqual([
      "shipyard/p1/working/render.png",
      "shipyard/p1/idea/screenshot.png",
      "shipyard/p1/idea/second.png",
    ]);
    expect(refs.map((r) => r.databaseTable)).toEqual([
      "ShipyardReview",
      "ShipyardSubmission",
      "ShipyardSubmission",
    ]);
  });

  it("reads nothing out of a malformed files or renderArtifacts blob", () => {
    expect(submissionFileKeys(undefined)).toEqual([]);
    expect(submissionFileKeys("shipyard/p1/a.png")).toEqual([]);
    expect(submissionFileKeys([{ key: 7 }])).toEqual([]);
    expect(reviewArtifactKeys(undefined)).toEqual([]);
    expect(reviewArtifactKeys({ screenshotS3Key: 7 })).toEqual([]);
    expect(reviewArtifactKeys([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The Praxy payload: badges, never numbers
// ---------------------------------------------------------------------------

describe("Shipyard badges", () => {
  it("has a badge for each of the six checkpoints", () => {
    expect(Object.keys(SHIPYARD_BADGES).sort()).toEqual([...CHECKPOINT_ORDER].sort());
  });

  it("names the two the spec calls out", () => {
    const badges = shipyardBadges([...CHECKPOINT_ORDER]);
    expect(badges).toContain("shipped-working-product");
    expect(badges).toContain("first-paying-customer");
    expect(badges).toContain("shipyard-graduate");
  });

  it("gives nothing for a student who has cleared nothing", () => {
    expect(shipyardBadges([])).toEqual([]);
  });

  it("gives only what was actually cleared", () => {
    const badges = shipyardBadges(["idea", "design", "working"]);
    expect(badges).toEqual([
      "validated-demand",
      "designed-before-building",
      "shipped-working-product",
    ]);
    expect(badges).not.toContain("first-paying-customer");
    expect(badges).not.toContain("shipyard-graduate");
  });

  it("is derived from gate state alone — every badge name is a boolean fact", () => {
    // No badge may carry, or be named after, a score or an amount.
    for (const badge of Object.values(SHIPYARD_BADGES)) {
      expect(badge).toMatch(/^[a-z][a-z-]*$/);
      expect(badge).not.toMatch(/grade|score|total|revenue|usd|inr|\d/);
    }
  });
});

// ---------------------------------------------------------------------------
// Live DB: the two payloads, in shape
// ---------------------------------------------------------------------------

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

describe.skipIf(!live)("Shipyard export payloads (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let userId: string | null = null;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    if ((await prisma.shipyardCheckpoint.count()) !== 6) return;
    const product = await prisma.shipyardProduct.findFirst({
      where: {
        id: { startsWith: "syp_" },
        submissions: { some: {} },
        checkpointStates: { some: { state: "passed" } },
      },
      orderBy: { id: "asc" },
      select: { userId: true },
    });
    userId = product?.userId ?? null;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("the DPDP export carries the whole Shipyard record", async () => {
    if (!userId) return;
    const { loadShipyardExport } = await import("@/lib/dpdp-erasure-shipyard");
    const section = await loadShipyardExport(prisma, userId);

    expect(section).not.toBeNull();
    expect(section!.product.name).toBeTruthy();
    expect(section!.submissions.length).toBeGreaterThan(0);
    expect(section!.checkpointStates).toHaveLength(6);
    expect(Array.isArray(section!.s3Keys)).toBe(true);
    // A subject-access request asks for what we hold, so the reviews come with
    // their internal scores AND the promptLog SPEC §6 requires us to keep.
    for (const review of section!.reviews) {
      expect(review).toHaveProperty("rubricScores");
      expect(review).toHaveProperty("promptLog");
      expect(review).toHaveProperty("checkpointKey");
    }
  });

  it("the Praxy payload carries badges and never a number", async () => {
    if (!userId) return;
    const { loadShipyardPraxy } = await import("@/lib/dpdp-erasure-shipyard");
    const payload = await loadShipyardPraxy(prisma, userId);

    expect(payload).not.toBeNull();
    expect(Object.keys(payload!).sort()).toEqual(["badges", "checkpointsCleared", "product"]);
    expect(Object.keys(payload!.product).sort()).toEqual(["liveUrl", "name", "oneLiner"]);
    for (const cleared of payload!.checkpointsCleared) {
      expect(Object.keys(cleared).sort()).toEqual(["key", "passedAt"]);
    }

    // The whole point: nothing in here is a grade, a score, or money.
    const serialised = JSON.stringify(payload);
    for (const forbidden of [
      "total",
      "components",
      "rubricScores",
      "grossTotal",
      "netTotal",
      "payingCustomers",
      "weightsVersion",
      "provisional",
      "confidence",
    ]) {
      expect(serialised, forbidden).not.toContain(forbidden);
    }
  });

  it("is null for a user with no Shipyard product", async () => {
    const { loadShipyardExport, loadShipyardPraxy } = await import(
      "@/lib/dpdp-erasure-shipyard"
    );
    expect(await loadShipyardExport(prisma, "user-who-does-not-exist")).toBeNull();
    expect(await loadShipyardPraxy(prisma, "user-who-does-not-exist")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A student's export may not carry a classmate's submission id (SEC-7)
// ---------------------------------------------------------------------------

describe("redactOtherStudentIds", () => {
  const promptLog = {
    promptVersion: "2026-09-15.2",
    system: "…",
    preflight: {
      isBlank: false,
      isSpam: false,
      nearDuplicateOf: "sub_someone_else",
      linkStatuses: [],
      extractedText: "",
      notes: [
        "waitlist reached (200)",
        "near-duplicate of submission sub_someone_else (similarity 0.94)",
      ],
    },
  };

  it("drops nearDuplicateOf and the note that repeats it", () => {
    const out = redactOtherStudentIds(promptLog) as typeof promptLog;
    expect(JSON.stringify(out)).not.toContain("sub_someone_else");
    expect(out.preflight).not.toHaveProperty("nearDuplicateOf");
    expect(out.preflight.notes).toContain(NEAR_DUPLICATE_REDACTION);
  });

  it("keeps the finding itself — the student is told they were flagged", () => {
    const out = redactOtherStudentIds(promptLog) as typeof promptLog;
    expect(out.preflight.notes.join(" ")).toMatch(/near-duplicate/i);
  });

  it("keeps every other note and every other field untouched", () => {
    const out = redactOtherStudentIds(promptLog) as typeof promptLog;
    expect(out.preflight.notes).toContain("waitlist reached (200)");
    expect(out.promptVersion).toBe("2026-09-15.2");
    expect(out.system).toBe("…");
  });

  it("redacts a note naming a submission the field never held", () => {
    const out = redactOtherStudentIds({
      preflight: { notes: ["near-duplicate of submission sub_zzz (similarity 0.91)"] },
    }) as { preflight: { notes: string[] } };
    expect(JSON.stringify(out)).not.toContain("sub_zzz");
  });

  it("leaves a clean prompt log, a null and a non-object alone", () => {
    const clean = { preflight: { isBlank: false, notes: ["waitlist reached (200)"] } };
    expect(redactOtherStudentIds(clean)).toEqual(clean);
    expect(redactOtherStudentIds(null)).toBeNull();
    expect(redactOtherStudentIds("not a log")).toBe("not a log");
    expect(redactOtherStudentIds({ promptVersion: "x" })).toEqual({ promptVersion: "x" });
  });
});
