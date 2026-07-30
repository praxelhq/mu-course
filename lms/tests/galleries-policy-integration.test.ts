import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getGalleryWalls } from "../lib/galleries";
import { fingerprintPublicationSource, type PublicationPolicy } from "../lib/publication-policy";

const policy: PublicationPolicy = {
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
      allowedHosts: ["eu1.make.com"],
      urlKind: "make-scenario",
      requireReviewedFingerprint: true,
    },
    { label: "View sample output", role: "sampleOutputFile", kind: "roster-file" },
  ],
};

const externalMarker = `external-fingerprint:sha256:${"a".repeat(64)}`;
const publicSchema = {
  fields: [
    {
      key: "workflowPngFile",
      label: "Workflow PNG",
      kind: "file",
      required: true,
      acceptedMimeTypes: ["image/png"],
      maxBytes: 10_000_000,
      fileRole: "workflowPngFile",
    },
    {
      key: "sampleOutputFile",
      label: "Sample output",
      kind: "file",
      required: true,
      acceptedMimeTypes: ["application/json"],
      maxBytes: 10_000_000,
      fileRole: "sampleOutputFile",
    },
    {
      key: "blueprintFile",
      label: "Private blueprint",
      kind: "file",
      required: false,
      acceptedMimeTypes: ["application/json"],
      maxBytes: 1_999_999,
      fileRole: "blueprintFile",
    },
  ],
};

function fakePrisma(
  ownerConsent = true,
  marker: string | null = externalMarker,
  newestRevoked = !ownerConsent,
  options: {
    itemCount?: number;
    newestMissing?: boolean;
    metrics?: { newestChainQueries: number };
  } = {},
) {
  const fields = {
    workflowTitle: "Lead routing guard",
    gallerySummary: "Routes safe sample leads through approval.",
    scenarioShareUrl: "https://eu1.make.com/public/shared-scenario/abc",
    workflowPngFile: "evidence-png",
    sampleOutputFile: "evidence-sample",
    blueprintFile: "evidence-blueprint",
    promptLog: "PRIVATE PROMPT",
    rawRunLog: "PRIVATE LOG",
    trustMrrMetrics: { mrr: 30_800 },
  };
  const evidence = [
    {
      id: "evidence-png",
      fieldKey: "workflowPngFile",
      fileRole: "workflowPngFile",
      scanState: "clean",
      sha256: "png-sha",
      s3VersionId: "png-v1",
      byteCount: 120,
    },
    {
      id: "evidence-sample",
      fieldKey: "sampleOutputFile",
      fileRole: "sampleOutputFile",
      scanState: "clean",
      sha256: "sample-sha",
      s3VersionId: "sample-v1",
      byteCount: 60,
    },
    {
      id: "evidence-blueprint",
      fieldKey: "blueprintFile",
      fileRole: "blueprintFile",
      scanState: "clean",
      sha256: "blueprint-sha",
      s3VersionId: "blueprint-v1",
      byteCount: 900,
    },
  ];
  const reviewedFingerprint = fingerprintPublicationSource({
    policy,
    fields,
    evidence: evidence.map((item) => ({
      role: item.fileRole,
      sha256: item.sha256,
      s3VersionId: item.s3VersionId,
      byteCount: item.byteCount,
    })),
    previewRef: marker,
  });
  const itemCount = options.itemCount ?? 1;
  const galleryRows = Array.from({ length: itemCount }, (_, index) => {
    const position = index + 1;
    return {
      id: `gallery-${position}`,
      featured: true,
      caption: "legacy mutable caption",
      screenshotS3Key: marker,
      submission: {
        id: `submission-${position}`,
        assignmentId: "assignment-5",
        fields,
        files: ["private/raw-blueprint.json", "private/raw-run-log.json"],
        ownerKind: "individual",
        ownerId: `student-${position}`,
        assessmentVersionId: "assessment-v1",
        assessmentVersion: { publicationPolicy: policy, publicSchema },
        assessmentResult: { publishable: true },
        publicationDecision: {
          ownerConsent,
          ownerRevokedAt: ownerConsent ? null : new Date("2026-08-12T00:00:00Z"),
          instructorState: "approved",
          reviewedFingerprint,
          previewS3Key: marker,
        },
        evidence,
        assignment: { title: "S5 · Make workflow", assignmentType: { slug: "workflow" } },
        user: { name: "Asha", section: { id: "sec-a", code: "A" } },
        team: {
          name: "Team A",
          sectorName: "SaaS",
          section: { id: "sec-a", code: "A" },
        },
      },
    };
  });
  const newestRows = galleryRows.map(({ submission }) => ({
    assignmentId: submission.assignmentId,
    ownerKind: submission.ownerKind,
    ownerId: submission.ownerId,
    publicationDecision: {
      ownerRevokedAt: newestRevoked ? new Date("2026-08-12T00:00:00Z") : null,
      instructorState: "approved",
    },
  }));
  const countNewestChainQuery = () => {
    if (options.metrics) options.metrics.newestChainQueries += 1;
  };
  return {
    galleryItem: {
      findMany: async () => galleryRows,
    },
    submission: {
      findFirst: async () => {
        countNewestChainQuery();
        return options.newestMissing ? null : newestRows[0];
      },
      findMany: async () => {
        countNewestChainQuery();
        return options.newestMissing ? [] : newestRows;
      },
    },
    section: {
      findMany: async () => [{ id: "sec-a", code: "A" }],
    },
  } as unknown as PrismaClient;
}

function fakeLegacyWorkflowPrisma() {
  return {
    galleryItem: {
      findMany: async () => [
        {
          id: "legacy-gallery-1",
          featured: true,
          caption: "A curated legacy workflow card.",
          screenshotS3Key: null,
          submission: {
            id: "legacy-submission-1",
            assignmentId: "legacy-assignment",
            fields: { summary: "A safe summary." },
            files: ["private/raw-blueprint.json", "private/run-recording.mp4"],
            ownerKind: null,
            ownerId: null,
            assessmentVersionId: null,
            assessmentVersion: null,
            assessmentResult: null,
            publicationDecision: null,
            evidence: [],
            assignment: { title: "Legacy workflow", assignmentType: { slug: "workflow" } },
            user: { name: "Asha", section: { id: "sec-a", code: "A" } },
            team: null,
          },
        },
      ],
    },
    section: {
      findMany: async () => [{ id: "sec-a", code: "A" }],
    },
  } as unknown as PrismaClient;
}

describe("gallery query projection", () => {
  it("serializes PNG + optional Make action + sanitized sample output, never private evidence", async () => {
    const walls = await getGalleryWalls({ deps: { prisma: fakePrisma() } });
    expect(walls.workflow).toHaveLength(1);
    expect(walls.workflow[0]).toMatchObject({
      displayName: "Asha",
      screenshotUrl: "/api/gallery/evidence/submission-1/workflowPngFile",
      actions: [
        { label: "Clone in Make", url: "https://eu1.make.com/public/shared-scenario/abc" },
        {
          label: "View sample output",
          url: "/api/gallery/evidence/submission-1/sampleOutputFile",
        },
      ],
    });
    const raw = JSON.stringify(walls).toLowerCase();
    for (const forbidden of [
      "blueprint",
      "raw-run-log",
      "private prompt",
      "private log",
      "trustmrr",
      "30800",
      "confidence",
      "grade",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("removes every projection immediately after owner revocation", async () => {
    const walls = await getGalleryWalls({ deps: { prisma: fakePrisma(false) } });
    expect(walls.workflow).toEqual([]);
  });

  it("honors newest-chain revocation even when projection sync left a safe V1 item behind", async () => {
    const walls = await getGalleryWalls({
      deps: { prisma: fakePrisma(true, externalMarker, true) },
    });
    expect(walls.workflow).toEqual([]);
  });

  it("fails closed when a versioned owner chain has no newest row", async () => {
    const walls = await getGalleryWalls({
      deps: {
        prisma: fakePrisma(true, externalMarker, false, { newestMissing: true }),
      },
    });
    expect(walls.workflow).toEqual([]);
  });

  it("loads newest-chain publication decisions in one query for many cards", async () => {
    const metrics = { newestChainQueries: 0 };
    const walls = await getGalleryWalls({
      deps: {
        prisma: fakePrisma(true, externalMarker, false, {
          itemCount: 25,
          metrics,
        }),
      },
    });

    expect(walls.workflow).toHaveLength(25);
    expect(metrics.newestChainQueries).toBe(1);
  });

  it("withholds a dynamic clone action until a server recrawl marker is reviewed", async () => {
    const walls = await getGalleryWalls({ deps: { prisma: fakePrisma(true, null) } });
    expect(walls.workflow[0]?.actions).toEqual([
      {
        label: "View sample output",
        url: "/api/gallery/evidence/submission-1/sampleOutputFile",
      },
    ]);
  });

  it("never exposes legacy workflow files, even on a featured card", async () => {
    const walls = await getGalleryWalls({ deps: { prisma: fakeLegacyWorkflowPrisma() } });
    expect(walls.workflow).toHaveLength(1);
    expect(walls.workflow[0]).toMatchObject({
      featured: true,
      files: [],
      actions: [],
      filesWithheld: true,
    });
    expect(JSON.stringify(walls)).not.toContain("raw-blueprint");
    expect(JSON.stringify(walls)).not.toContain("run-recording");
  });
});
