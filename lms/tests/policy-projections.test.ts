import { describe, expect, it } from "vitest";
import {
  buildVersionedGalleryProjection,
  selectGalleryOwnerScope,
  selectLatestPublishableCandidate,
  type VersionedPublicationCandidate,
} from "../lib/galleries";
import type { PublicationPolicy } from "../lib/publication-policy";
import { fingerprintPublicationSource } from "../lib/publication-policy";

const appPolicy: PublicationPolicy = {
  wall: "app",
  consentField: "galleryConsent",
  captionField: "gallerySummary",
  publicTextFields: ["productName", "gallerySummary"],
  previewRole: "appScreenshot",
  actions: [
    {
      label: "Open app",
      field: "publishedUrl",
      kind: "external-url",
      allowedHosts: ["signalshelf.lovable.app"],
      requireReviewedFingerprint: true,
    },
  ],
};

function candidate(
  id: string,
  version: number,
  patch: Partial<VersionedPublicationCandidate> = {},
): VersionedPublicationCandidate {
  return {
    id,
    version,
    attempt: 1,
    status: "finalised",
    publishable: true,
    ownerConsent: true,
    ownerRevokedAt: null,
    instructorState: "approved",
    previewReady: true,
    reviewCurrent: true,
    ...patch,
  };
}

describe("policy-driven gallery selection", () => {
  it("fingerprints only public-policy inputs and changes when reviewed evidence changes", () => {
    const first = fingerprintPublicationSource({
      policy: appPolicy,
      fields: {
        productName: "SignalShelf",
        gallerySummary: "Safe",
        publishedUrl: "https://signalshelf.lovable.app/",
        promptLog: "secret-a",
      },
      evidence: [{ role: "appScreenshot", sha256: "a", s3VersionId: "v1", byteCount: 10 }],
      previewRef: "gallery/screenshots/sub-a.png",
    });
    const hiddenChanged = fingerprintPublicationSource({
      policy: appPolicy,
      fields: {
        productName: "SignalShelf",
        gallerySummary: "Safe",
        publishedUrl: "https://signalshelf.lovable.app/",
        promptLog: "secret-b",
      },
      evidence: [{ role: "appScreenshot", sha256: "a", s3VersionId: "v1", byteCount: 10 }],
      previewRef: "gallery/screenshots/sub-a.png",
    });
    const evidenceChanged = fingerprintPublicationSource({
      policy: appPolicy,
      fields: {
        productName: "SignalShelf",
        gallerySummary: "Safe",
        publishedUrl: "https://signalshelf.lovable.app/",
      },
      evidence: [{ role: "appScreenshot", sha256: "b", s3VersionId: "v2", byteCount: 11 }],
      previewRef: "gallery/screenshots/sub-b.png",
    });
    expect(first).toBe(hiddenChanged);
    expect(first).not.toBe(evidenceChanged);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps V1 until V2 is safe, consented, curated, and preview-ready", () => {
    expect(
      selectLatestPublishableCandidate([
        candidate("v1", 1),
        candidate("v2", 2, { publishable: false, instructorState: "pending" }),
      ])?.id,
    ).toBe("v1");
    expect(
      selectLatestPublishableCandidate([
        candidate("v1", 1),
        candidate("v2", 2, { previewReady: false }),
      ])?.id,
    ).toBe("v1");
    expect(
      selectLatestPublishableCandidate([
        candidate("v1", 1),
        candidate("v2", 2, { reviewCurrent: false }),
      ])?.id,
    ).toBe("v1");
    expect(selectLatestPublishableCandidate([candidate("v1", 1), candidate("v2", 2)])?.id).toBe(
      "v2",
    );
  });

  it("uses immutable canonical ownership for a versioned gallery chain", () => {
    expect(
      selectGalleryOwnerScope({
        assessmentVersionId: "assessment-v1",
        ownerKind: "individual",
        ownerId: "student-1",
        legacyTeamBased: true,
        teamId: "team-a",
        userId: "student-1",
      }),
    ).toEqual({ ownerKind: "individual", ownerId: "student-1" });
    expect(
      selectGalleryOwnerScope({
        assessmentVersionId: null,
        ownerKind: null,
        ownerId: null,
        legacyTeamBased: true,
        teamId: "team-a",
        userId: "student-1",
      }),
    ).toEqual({ teamId: "team-a" });
    expect(
      selectGalleryOwnerScope({
        assessmentVersionId: "assessment-v1",
        ownerKind: null,
        ownerId: null,
        legacyTeamBased: true,
        teamId: "team-a",
        userId: "student-1",
      }),
    ).toBeNull();
  });

  it("treats explicit owner revocation on the newest version as removal, not V1 fallback", () => {
    expect(
      selectLatestPublishableCandidate([
        candidate("v1", 1),
        candidate("v2", 2, {
          ownerConsent: false,
          ownerRevokedAt: new Date("2026-08-12T00:00:00.000Z"),
        }),
      ]),
    ).toBeNull();
    expect(
      selectLatestPublishableCandidate([
        candidate("v1", 1),
        candidate("v2", 2, {
          ownerConsent: true,
          ownerRevokedAt: new Date("2026-08-12T00:00:00.000Z"),
        }),
      ]),
    ).toBeNull();
    expect(
      selectLatestPublishableCandidate([
        candidate("v1", 1),
        candidate("v2", 2, { instructorState: "revoked" }),
      ]),
    ).toBeNull();
  });

  it("projects only allowlisted text, preview, and fingerprint-matched actions", () => {
    const projection = buildVersionedGalleryProjection({
      policy: appPolicy,
      fields: {
        productName: "SignalShelf",
        gallerySummary: "One public-safe sentence.",
        publishedUrl: "https://signalshelf.lovable.app/",
        grade: 40,
        confidence: 0.98,
        promptLog: "hidden",
        trustMrrRows: [{ mrr: 30_800 }],
      },
      evidence: [
        {
          role: "appScreenshot",
          publicUrl: "/api/gallery/evidence/sub-v2/appScreenshot",
          state: "clean",
        },
        {
          role: "blueprintFile",
          publicUrl: "/private/blueprint.json",
          state: "clean",
        },
      ],
      ownerConsent: true,
      instructorState: "approved",
      reviewedFingerprint: "sha256:reviewed",
      currentFingerprint: "sha256:reviewed",
    });
    expect(projection.published).toBe(true);
    const raw = JSON.stringify(projection).toLowerCase();
    for (const forbidden of ["grade", "confidence", "promptlog", "trustmrr", "blueprint", "30800"]) {
      expect(raw).not.toContain(forbidden);
    }
    if (!projection.published) return;
    expect(projection.actions).toEqual([
      { label: "Open app", kind: "external-url", target: "https://signalshelf.lovable.app/" },
    ]);
  });

  it("keeps the card but withholds a changed external action", () => {
    const projection = buildVersionedGalleryProjection({
      policy: appPolicy,
      fields: {
        productName: "SignalShelf",
        gallerySummary: "Safe summary",
        publishedUrl: "https://signalshelf.lovable.app/",
      },
      evidence: [
        {
          role: "appScreenshot",
          publicUrl: "/api/gallery/evidence/sub-v2/appScreenshot",
          state: "clean",
        },
      ],
      ownerConsent: true,
      instructorState: "approved",
      reviewedFingerprint: "sha256:reviewed",
      currentFingerprint: "sha256:changed",
    });
    expect(projection.published).toBe(true);
    if (projection.published) expect(projection.actions).toEqual([]);
  });
});
