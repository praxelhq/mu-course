import { describe, expect, it, vi } from "vitest";
import {
  DpdpErasureError,
  runDpdpErasure,
  type DpdpErasureCounts,
  type DpdpObjectIntent,
  type DpdpErasurePersistence,
  type DpdpPreparation,
} from "../lib/dpdp-erasure";
import { isCompletedZeroVersionProof } from "../lib/dpdp-erasure-prisma";

const NOW = new Date("2026-07-30T12:00:00.000Z");

const emptyCounts: DpdpErasureCounts = {
  appeals: 0,
  gradeHolds: 0,
  publicationDecisions: 0,
  workflowSelections: 0,
  workflowNominations: 0,
  galleryItems: 0,
  votes: 0,
  assessmentResults: 0,
  resubmissionGrants: 0,
  evidence: 0,
  uploadReservations: 0,
  generatedObjectReservations: 0,
  grades: 0,
  submissions: 1,
  reassignedTeamSubmissions: 0,
  interviewTurns: 0,
  interviews: 0,
  interviewRetakes: 0,
  quizAttempts: 0,
  peerReviews: 0,
  portfolio: 0,
  notifications: 0,
  gateExceptions: 0,
  userVotes: 0,
  user: 1,
};

function readyPreparation(objects: DpdpObjectIntent[]): Extract<
  DpdpPreparation,
  { state: "ready" }
> {
  return {
    state: "ready",
    parentReceiptId: "receipt-user-1",
    phase: "intent",
    clerkUserId: "clerk-user-1",
    objects,
  };
}

function persistence(
  prepare: DpdpErasurePersistence["prepare"],
): DpdpErasurePersistence {
  return {
    prepare,
    recordObjectVerified: vi.fn(async () => undefined),
    authorizeDatabaseCleanup: vi.fn(async () => undefined),
    cleanupDatabase: vi.fn(async () => ({
      receiptId: "receipt-user-1",
      deleted: emptyCounts,
      clerkUserId: "clerk-user-1",
      alreadyCompleted: false,
    })),
  };
}

describe("DPDP erasure orchestration", () => {
  it("accepts a missing reservation VersionId only with an exact completed zero-version proof", () => {
    const reservation = {
      id: "reservation-absent",
      submissionId: "submission-1",
      s3Key: "submissions/user-1/absent.json",
      s3VersionId: null,
      cancelledAt: NOW,
    };
    const proof = {
      targetType: "uncommitted-upload",
      targetId: reservation.id,
      s3Key: reservation.s3Key,
      s3VersionId: null,
      s3VerifiedAt: NOW,
      databaseVerifiedAt: NOW,
      details: {
        phase: "complete",
        objectVersionCount: 0,
        databaseAction: "mark-cancelled",
        submissionId: reservation.submissionId,
      },
    };

    expect(isCompletedZeroVersionProof(proof, reservation)).toBe(true);
    expect(
      isCompletedZeroVersionProof(
        { ...proof, s3Key: "submissions/user-1/different.json" },
        reservation,
      ),
    ).toBe(false);
    expect(
      isCompletedZeroVersionProof(
        { ...proof, databaseVerifiedAt: null },
        reservation,
      ),
    ).toBe(false);
  });

  it("performs no object-store action when a legal hold blocks intent creation", async () => {
    const store = persistence(
      vi.fn(async () => {
        throw new DpdpErasureError("retention-hold-active", 409, "Erasure is held");
      }),
    );
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    await expect(
      runDpdpErasure(
        {
          userId: "user-1",
          confirmEmail: "student@example.test",
          requestedBy: "admin-1",
          now: NOW,
        },
        { persistence: store, deleteObjectVersion },
      ),
    ).rejects.toMatchObject({ code: "retention-hold-active", status: 409 });

    expect(deleteObjectVersion).not.toHaveBeenCalled();
    expect(store.recordObjectVerified).not.toHaveBeenCalled();
    expect(store.authorizeDatabaseCleanup).not.toHaveBeenCalled();
    expect(store.cleanupDatabase).not.toHaveBeenCalled();
  });

  it("fails closed when exact-version deletion cannot be verified", async () => {
    const store = persistence(
      vi.fn(async () =>
        readyPreparation([
          {
            receiptId: "receipt-object-1",
            key: "submissions/user-1/file.json",
            versionId: "version-1",
            verifiedAt: null,
          },
        ]),
      ),
    );
    const deleteObjectVersion = vi.fn(async () => ({ verified: false }));

    await expect(
      runDpdpErasure(
        {
          userId: "user-1",
          confirmEmail: "student@example.test",
          requestedBy: "admin-1",
          now: NOW,
        },
        { persistence: store, deleteObjectVersion },
      ),
    ).rejects.toMatchObject({ code: "object-delete-unverified", status: 503 });

    expect(deleteObjectVersion).toHaveBeenCalledWith(
      "submissions/user-1/file.json",
      "version-1",
    );
    expect(store.recordObjectVerified).not.toHaveBeenCalled();
    expect(store.authorizeDatabaseCleanup).not.toHaveBeenCalled();
    expect(store.cleanupDatabase).not.toHaveBeenCalled();
  });

  it("retries only unverified exact versions and completes database cleanup afterward", async () => {
    const verified = new Set<string>();
    const objects = [
      {
        receiptId: "receipt-object-1",
        key: "submissions/user-1/a.json",
        versionId: "version-a",
      },
      {
        receiptId: "receipt-object-2",
        key: "submissions/user-1/b.json",
        versionId: "version-b",
      },
    ];
    const store = persistence(
      vi.fn(async () =>
        readyPreparation(
          objects.map((object) => ({
            ...object,
            verifiedAt: verified.has(object.receiptId) ? NOW : null,
          })),
        ),
      ),
    );
    vi.mocked(store.recordObjectVerified).mockImplementation(async ({ receiptId }) => {
      verified.add(receiptId);
    });

    let bAttempts = 0;
    const deleteObjectVersion = vi.fn(async (key: string) => {
      if (key.endsWith("b.json")) {
        bAttempts += 1;
        if (bAttempts === 1) throw new Error("S3 unavailable");
      }
      return { verified: true, providerReceipt: `provider-${key}` };
    });
    const input = {
      userId: "user-1",
      confirmEmail: "student@example.test",
      requestedBy: "admin-1",
      now: NOW,
    };

    await expect(
      runDpdpErasure(input, { persistence: store, deleteObjectVersion }),
    ).rejects.toMatchObject({ code: "object-delete-failed", status: 503 });

    const result = await runDpdpErasure(input, { persistence: store, deleteObjectVersion });

    expect(result).toMatchObject({
      receiptId: "receipt-user-1",
      deleted: emptyCounts,
      alreadyCompleted: false,
    });
    expect(deleteObjectVersion.mock.calls).toEqual([
      ["submissions/user-1/a.json", "version-a"],
      ["submissions/user-1/b.json", "version-b"],
      ["submissions/user-1/b.json", "version-b"],
    ]);
    expect(store.authorizeDatabaseCleanup).toHaveBeenCalledTimes(1);
    expect(store.cleanupDatabase).toHaveBeenCalledTimes(1);
  });

  it("returns a completed receipt without repeating S3 or database mutations", async () => {
    const store = persistence(
      vi.fn(async () => ({
        state: "completed" as const,
        result: {
          receiptId: "receipt-user-1",
          deleted: emptyCounts,
          clerkUserId: "clerk-user-1",
          alreadyCompleted: true,
        },
      })),
    );
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    const result = await runDpdpErasure(
      {
        userId: "user-1",
        confirmEmail: "student@example.test",
        requestedBy: "admin-1",
        now: NOW,
      },
      { persistence: store, deleteObjectVersion },
    );

    expect(result.alreadyCompleted).toBe(true);
    expect(deleteObjectVersion).not.toHaveBeenCalled();
    expect(store.authorizeDatabaseCleanup).not.toHaveBeenCalled();
    expect(store.cleanupDatabase).not.toHaveBeenCalled();
  });
});
