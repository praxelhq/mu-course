import { describe, expect, it } from "vitest";
import { fingerprintPublicationSource, type PublicationPolicy } from "../lib/publication-policy";
import {
  PublicationDecisionError,
  setInstructorPublicationDecision,
  setPublicationConsent,
  type PublicationDecisionRecord,
  type PublicationDecisionStore,
  type PublicationSubmissionSource,
} from "../lib/publication-decisions";

const policy: PublicationPolicy = {
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

function source(
  patch: Partial<PublicationSubmissionSource> = {},
): PublicationSubmissionSource {
  return {
    id: "sub-1",
    userId: "student-1",
    teamId: null,
    ownerKind: "individual",
    ownerId: "student-1",
    fields: {
      productName: "SignalShelf",
      gallerySummary: "A safe public summary.",
      publishedUrl: "https://signalshelf.lovable.app/",
      promptLog: "must never enter the fingerprint",
    },
    publicationPolicy: policy,
    evidence: [
      {
        id: "evidence-1",
        fieldKey: "appScreenshot",
        fileRole: "appScreenshot",
        sha256: "a".repeat(64),
        s3VersionId: "version-1",
        byteCount: 123,
        scanState: "clean",
      },
    ],
    previewRef: "gallery/screenshots/sub-1-reviewed.png",
    ...patch,
  };
}

function harness(initialSource = source()) {
  let decision: PublicationDecisionRecord | null = null;
  const audits: Parameters<PublicationDecisionStore["createAudit"]>[0][] = [];
  const syncCalls: string[] = [];
  const store: PublicationDecisionStore = {
    getOwnership: async (submissionId) =>
      submissionId === initialSource.id ? initialSource : null,
    getReviewSource: async (submissionId) =>
      submissionId === initialSource.id ? initialSource : null,
    getDecision: async () => decision,
    saveDecision: async (submissionId, patch) => {
      decision = {
        id: decision?.id ?? "decision-1",
        submissionId,
        ownerConsent: patch.ownerConsent ?? decision?.ownerConsent ?? false,
        ownerConsentBy: patch.ownerConsentBy ?? decision?.ownerConsentBy ?? null,
        ownerConsentAt: patch.ownerConsentAt ?? decision?.ownerConsentAt ?? null,
        ownerRevokedAt:
          patch.ownerRevokedAt === undefined
            ? (decision?.ownerRevokedAt ?? null)
            : patch.ownerRevokedAt,
        instructorState: patch.instructorState ?? decision?.instructorState ?? "pending",
        instructorDecidedBy:
          patch.instructorDecidedBy ?? decision?.instructorDecidedBy ?? null,
        instructorDecidedAt:
          patch.instructorDecidedAt ?? decision?.instructorDecidedAt ?? null,
        instructorReason:
          patch.instructorReason === undefined
            ? (decision?.instructorReason ?? null)
            : patch.instructorReason,
        reviewedFingerprint:
          patch.reviewedFingerprint === undefined
            ? (decision?.reviewedFingerprint ?? null)
            : patch.reviewedFingerprint,
        reviewedAt:
          patch.reviewedAt === undefined ? (decision?.reviewedAt ?? null) : patch.reviewedAt,
        previewS3Key:
          patch.previewS3Key === undefined
            ? (decision?.previewS3Key ?? null)
            : patch.previewS3Key,
      };
      return decision!;
    },
    createAudit: async (entry) => {
      audits.push(entry);
    },
  };
  const deps = {
    now: () => new Date("2026-08-01T10:00:00.000Z"),
    transaction: async <T>(work: (tx: PublicationDecisionStore) => Promise<T>) => work(store),
    syncProjection: async (submissionId: string) => {
      syncCalls.push(submissionId);
    },
  };
  return { audits, deps, get decision() { return decision; }, syncCalls };
}

describe("publication decisions", () => {
  it("lets only the canonical individual owner grant and revoke consent, with audits and projection sync", async () => {
    const h = harness();
    await expect(
      setPublicationConsent(
        {
          submissionId: "sub-1",
          actor: { userId: "student-2", teamId: null },
          consent: true,
        },
        h.deps,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.audits).toHaveLength(0);

    const granted = await setPublicationConsent(
      {
        submissionId: "sub-1",
        actor: { userId: "student-1", teamId: null },
        consent: true,
      },
      h.deps,
    );
    expect(granted.decision.ownerConsent).toBe(true);
    expect(granted.decision.ownerRevokedAt).toBeNull();

    const revoked = await setPublicationConsent(
      {
        submissionId: "sub-1",
        actor: { userId: "student-1", teamId: null },
        consent: false,
      },
      h.deps,
    );
    expect(revoked.decision.ownerConsent).toBe(false);
    expect(revoked.decision.ownerRevokedAt).toBe("2026-08-01T10:00:00.000Z");
    expect(h.audits.map((entry) => entry.action)).toEqual([
      "publication.consent.grant",
      "publication.consent.revoke",
    ]);
    expect(h.syncCalls).toEqual(["sub-1", "sub-1"]);
  });

  it("treats a member of the canonical owner team as an owner", async () => {
    const h = harness(
      source({
        userId: "student-1",
        teamId: "team-a",
        ownerKind: "team",
        ownerId: "team-a",
      }),
    );
    const result = await setPublicationConsent(
      {
        submissionId: "sub-1",
        actor: { userId: "student-2", teamId: "team-a" },
        consent: true,
      },
      h.deps,
    );
    expect(result.decision.ownerConsent).toBe(true);
  });

  it("keeps instructor approval separate and persists only the server-computed fingerprint", async () => {
    const h = harness();
    const result = await setInstructorPublicationDecision(
      {
        submissionId: "sub-1",
        actor: { userId: "instructor-1", role: "instructor" },
        state: "approved",
        reason: "Preview and public fields reviewed.",
      },
      h.deps,
    );
    const expected = fingerprintPublicationSource({
      policy,
      fields: source().fields,
      evidence: source().evidence.map((item) => ({
        role: item.fileRole,
        sha256: item.sha256,
        s3VersionId: item.s3VersionId,
        byteCount: item.byteCount,
      })),
      previewRef: source().previewRef,
    });
    expect(result.decision.ownerConsent).toBe(false);
    expect(result.decision.instructorState).toBe("approved");
    expect(result.decision.reviewedFingerprint).toBe(expected);
    expect(result.decision.reviewedFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(h.audits[0]).toMatchObject({
      actorId: "instructor-1",
      action: "publication.instructor.approved",
    });
  });

  it("rejects app approval until the exact private staging preview is ready", async () => {
    const h = harness(source({ previewRef: null }));
    await expect(
      setInstructorPublicationDecision(
        {
          submissionId: "sub-1",
          actor: { userId: "instructor-1", role: "instructor" },
          state: "approved",
        },
        h.deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(h.audits).toHaveLength(0);
  });

  it("rejects approval when bound policy cannot produce a server fingerprint", async () => {
    const h = harness(source({ publicationPolicy: { wall: "app", answerKey: "hidden" } }));
    await expect(
      setInstructorPublicationDecision(
        {
          submissionId: "sub-1",
          actor: { userId: "instructor-1", role: "instructor" },
          state: "approved",
        },
        h.deps,
      ),
    ).rejects.toBeInstanceOf(PublicationDecisionError);
    expect(h.audits).toHaveLength(0);
  });

  it("persists revocation even when best-effort projection sync is unavailable", async () => {
    const h = harness();
    h.deps.syncProjection = async () => {
      throw new Error("queue unavailable");
    };
    const result = await setInstructorPublicationDecision(
      {
        submissionId: "sub-1",
        actor: { userId: "admin-1", role: "admin" },
        state: "revoked",
        reason: "Public evidence was withdrawn.",
      },
      h.deps,
    );
    expect(result.decision.instructorState).toBe("revoked");
    expect(result.projectionSync).toBe("deferred");
    expect(h.audits).toHaveLength(1);
  });
});
