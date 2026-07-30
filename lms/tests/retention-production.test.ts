import { describe, expect, it, vi } from "vitest";
import { runEvidenceRetentionCleanup } from "../lib/evidence/retention";
import {
  createProductionEvidenceRetentionDeps,
  prismaRetentionPersistence,
  type RetentionPersistence,
  type RetentionPersistentCandidate,
  VERIFIED_ABSENT_VERSION,
} from "../worker/jobs/retention-cleanup";

const now = new Date("2026-07-30T12:00:00.000Z");

function uploadCandidate(): RetentionPersistentCandidate {
  return {
    targetType: "uncommitted-upload",
    targetId: "reservation-1",
    retentionPolicyId: null,
    expiresAt: new Date("2026-07-29T12:00:00.000Z"),
    s3Key: "submissions/individual/u/a/v/attempt-1/file/r/file.json",
    s3VersionId: null,
    databaseAction: "mark-cancelled",
  };
}

function generatedCandidate(): RetentionPersistentCandidate {
  return {
    ...uploadCandidate(),
    targetType: "uncommitted-generated-object",
    targetId: "generated-reservation-1",
    s3Key: "generated/interviews/i/reservations/generated-reservation-1/audio.webm",
  };
}

function persistence(
  rows: RetentionPersistentCandidate[],
  commitDeletion: RetentionPersistence["commitDeletion"] = vi.fn(async () => undefined),
  prepareDeletion: RetentionPersistence["prepareDeletion"] = vi.fn(
    async () => "ready" as const,
  ),
): RetentionPersistence {
  return {
    listCandidates: vi.fn(async () => rows),
    persistUploadVersion: vi.fn(async ({ targetId, versionId }) => {
      const row = rows.find((candidate) => candidate.targetId === targetId);
      if (!row || (row.s3VersionId && row.s3VersionId !== versionId)) return false;
      row.s3VersionId = versionId;
      return true;
    }),
    prepareDeletion,
    hasDeletionReceipt: vi.fn(async () => false),
    commitDeletion,
  };
}

describe("production evidence-retention binding", () => {
  it("bounds persistence and object-version resolution to one backlog batch", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      ...uploadCandidate(),
      targetId: `reservation-${index + 1}`,
      s3Key: `submissions/backlog/reservation-${index + 1}/file.json`,
    }));
    const store = persistence(rows);
    const listObjectVersionIds = vi.fn(async () => ["version-1"]);
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds,
        deleteObjectVersion: vi.fn(async () => ({ verified: true })),
      },
    });

    const result = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker", batchSize: 2 },
      deps,
    );

    expect(store.listCandidates).toHaveBeenCalledWith(now, 2);
    expect(result).toMatchObject({ examined: 2, deleted: 2, failed: [] });
    expect(listObjectVersionIds).toHaveBeenCalledTimes(2);
    expect(store.prepareDeletion).toHaveBeenCalledTimes(2);
  });

  it("caps each production candidate scan and returns the oldest combined batch", async () => {
    const uploadFindMany = vi.fn(async () => [
      {
        id: "upload-later",
        submissionId: "submission-1",
        expiresAt: new Date("2026-07-29T11:00:00.000Z"),
        s3Key: "uploads/later.json",
        s3VersionId: "upload-version",
        assessmentVersion: null,
      },
    ]);
    const generatedFindMany = vi.fn(async () => [
      {
        id: "generated-middle",
        expiresAt: new Date("2026-07-29T10:00:00.000Z"),
        s3Key: "generated/middle.json",
        s3VersionId: "generated-version",
        submission: null,
      },
    ]);
    const evidenceQuery = vi.fn(async (query: unknown) => {
      void query;
      return [
        {
          id: "evidence-oldest",
          expiresAt: new Date("2026-07-29T09:00:00.000Z"),
          s3Key: "evidence/oldest.json",
          s3VersionId: "evidence-version",
          retentionPolicyId: "policy-1",
          classKey: "quarantined-evidence-v1",
          objectClass: "submission-evidence",
          expiresAfterDays: 30,
          deletionAuthority: "retention-worker",
          legalHoldBehavior: "block",
          s3CleanupRequired: true,
          databaseCleanupPolicy: "mark-deleted",
        },
      ];
    });
    const db = {
      uploadReservation: { findMany: uploadFindMany },
      generatedObjectReservation: { findMany: generatedFindMany },
      $queryRaw: evidenceQuery,
    };

    const rows = await prismaRetentionPersistence(db as never).listCandidates(now, 2);

    expect(uploadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: 2,
      }),
    );
    expect(generatedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: 2,
      }),
    );
    const evidenceSql = evidenceQuery.mock.calls[0][0] as unknown as {
      strings: string[];
      values: unknown[];
    };
    expect(evidenceSql.strings.join("?")).toContain("LIMIT ?");
    expect(evidenceSql.values).toEqual([now, 2]);
    expect(rows.map((row) => row.targetId)).toEqual([
      "evidence-oldest",
      "generated-middle",
    ]);
  });

  it("creates a locked durable deletion intent before any object-store action", async () => {
    const findReceipt = vi.fn(async () => null);
    const createReceipt = vi.fn(async () => undefined);
    const lock = vi.fn(async (query: unknown) => {
      void query;
      return [];
    });
    const tx = {
      uploadReservation: {
        findFirst: vi.fn(async () => ({
          submissionId: "submission-1",
          submission: { userId: "user-1" },
        })),
      },
      submissionEvidence: { findFirst: vi.fn(async () => null) },
      deletionReceipt: { findUnique: findReceipt, create: createReceipt },
      retentionHold: { findFirst: vi.fn(async () => null) },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ flaggedForDeletion: false }])
        .mockResolvedValueOnce([]),
      $executeRaw: lock,
    };
    const db = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const store = prismaRetentionPersistence(db as never);
    const candidate = {
      ...uploadCandidate(),
      idempotencyKey: "retention:uncommitted-upload:reservation-1:version-1",
      retentionPolicyId: "policy-1",
      retentionPolicySnapshot: {
        id: "policy-1",
        classKey: "submission-evidence-v1",
        objectClass: "submission-evidence",
        expiresAfterDays: 30,
        deletionAuthority: "retention-worker",
        legalHoldBehavior: "block",
        s3CleanupRequired: true,
        databaseCleanupPolicy: "mark-cancelled",
      },
      s3VersionId: "version-1",
    };

    await expect(store.prepareDeletion(candidate)).resolves.toBe("ready");

    expect(lock).toHaveBeenCalledTimes(2);
    const lockValues = lock.mock.calls.flatMap(([query]) =>
      (query as unknown as { values: unknown[] }).values,
    );
    expect(lockValues).toEqual(
      expect.arrayContaining([
        "retention-hold:uncommitted-upload:reservation-1",
        "retention-hold:submission:submission-1",
      ]),
    );
    expect(createReceipt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: candidate.idempotencyKey,
        retentionPolicyId: "policy-1",
        s3VersionId: "version-1",
        s3VerifiedAt: null,
        databaseVerifiedAt: null,
        details: {
          phase: "intent",
          databaseAction: "mark-cancelled",
          submissionId: "submission-1",
          retentionPolicySnapshot: candidate.retentionPolicySnapshot,
        },
      }),
    });
  });

  it("durably resolves an uncommitted upload VersionId before exact deletion", async () => {
    const rows = [uploadCandidate()];
    const store = persistence(rows);
    const listObjectVersionIds = vi.fn(async () => ["version-1"]);
    const deleteObjectVersion = vi.fn(async () => ({
      verified: true,
      providerReceipt: "request-1",
    }));
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: { listObjectVersionIds, deleteObjectVersion },
    });

    const result = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker" },
      deps,
    );

    expect(result).toMatchObject({ deleted: 1, failed: [] });
    expect(store.persistUploadVersion).toHaveBeenCalledWith({
      targetId: "reservation-1",
      s3Key: rows[0].s3Key,
      versionId: "version-1",
    });
    expect(deleteObjectVersion).toHaveBeenCalledWith(rows[0].s3Key, "version-1");
    expect(store.prepareDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "retention:uncommitted-upload:reservation-1:version-1",
        s3VersionId: "version-1",
      }),
    );
    expect(vi.mocked(store.prepareDeletion).mock.invocationCallOrder[0]).toBeLessThan(
      deleteObjectVersion.mock.invocationCallOrder[0],
    );
    expect(store.commitDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        s3VersionId: "version-1",
        providerReceipt: "request-1",
      }),
    );
  });

  it("retries the same persisted VersionId after S3 success and DB receipt failure", async () => {
    const rows = [uploadCandidate()];
    let commitAttempts = 0;
    const commitDeletion = vi.fn(async () => {
      commitAttempts += 1;
      if (commitAttempts === 1) throw new Error("database unavailable");
    });
    const store = persistence(rows, commitDeletion);
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds: vi.fn(async () => ["version-1"]),
        deleteObjectVersion,
      },
    });

    const first = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker" },
      deps,
    );
    const second = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker" },
      deps,
    );

    expect(first.failed).toEqual([
      expect.objectContaining({ errorCode: "delete-failed" }),
    ]);
    expect(second).toMatchObject({ deleted: 1, failed: [] });
    expect(rows[0].s3VersionId).toBe("version-1");
    const preparedCandidates = vi.mocked(store.prepareDeletion).mock.calls.map(([row]) => row);
    expect(preparedCandidates).toHaveLength(2);
    expect(preparedCandidates[0].idempotencyKey).toBe(
      preparedCandidates[1].idempotencyKey,
    );
    expect(deleteObjectVersion).toHaveBeenNthCalledWith(1, rows[0].s3Key, "version-1");
    expect(deleteObjectVersion).toHaveBeenNthCalledWith(2, rows[0].s3Key, "version-1");
  });

  it("fails closed when an expired reservation has ambiguous object versions", async () => {
    const rows = [uploadCandidate()];
    const store = persistence(rows);
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds: vi.fn(async () => ["version-1", "version-2"]),
        deleteObjectVersion,
      },
    });

    const result = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker" },
      deps,
    );

    expect(result.failed).toEqual([
      expect.objectContaining({ errorCode: "object-version-missing" }),
    ]);
    expect(store.persistUploadVersion).not.toHaveBeenCalled();
    expect(store.prepareDeletion).not.toHaveBeenCalled();
    expect(deleteObjectVersion).not.toHaveBeenCalled();
  });

  it("resolves and deletes one exact abandoned generated-object version", async () => {
    const rows = [generatedCandidate()];
    const store = persistence(rows);
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds: vi.fn(async () => ["generated-version-1"]),
        deleteObjectVersion,
      },
    });

    await expect(
      runEvidenceRetentionCleanup({ now, requestedBy: "retention-worker" }, deps),
    ).resolves.toMatchObject({ deleted: 1, failed: [] });
    expect(store.persistUploadVersion).toHaveBeenCalledWith({
      targetId: "generated-reservation-1",
      s3Key: rows[0].s3Key,
      versionId: "generated-version-1",
      targetType: "uncommitted-generated-object",
    });
    expect(deleteObjectVersion).toHaveBeenCalledWith(
      rows[0].s3Key,
      "generated-version-1",
    );
  });

  it("records verified absence for an abandoned generated-object reservation", async () => {
    const rows = [generatedCandidate()];
    const store = persistence(rows);
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds: vi.fn(async () => []),
        deleteObjectVersion: vi.fn(async () => ({ verified: true })),
      },
    });

    await expect(
      runEvidenceRetentionCleanup({ now, requestedBy: "retention-worker" }, deps),
    ).resolves.toMatchObject({ deleted: 1, failed: [] });
    expect(store.commitDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "uncommitted-generated-object",
        s3VersionId: VERIFIED_ABSENT_VERSION,
      }),
    );
  });

  it("fails closed on ambiguous abandoned generated-object versions", async () => {
    const rows = [generatedCandidate()];
    const store = persistence(rows);
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds: vi.fn(async () => ["v1", "v2"]),
        deleteObjectVersion,
      },
    });

    const result = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker" },
      deps,
    );
    expect(result.failed).toEqual([
      expect.objectContaining({ errorCode: "object-version-missing" }),
    ]);
    expect(store.prepareDeletion).not.toHaveBeenCalled();
    expect(deleteObjectVersion).not.toHaveBeenCalled();
  });

  it("records verified absence through the same observable deletion lifecycle", async () => {
    const rows = [uploadCandidate()];
    const store = persistence(rows);
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds: vi.fn(async () => []),
        deleteObjectVersion,
      },
    });

    const result = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker" },
      deps,
    );

    expect(result).toMatchObject({ examined: 1, deleted: 1, held: 0, failed: [] });
    expect(deleteObjectVersion).not.toHaveBeenCalled();
    expect(store.prepareDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "retention:uncommitted-upload:reservation-1:absent",
        s3VersionId: VERIFIED_ABSENT_VERSION,
      }),
    );
    expect(store.commitDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "retention:uncommitted-upload:reservation-1:absent",
        s3VersionId: VERIFIED_ABSENT_VERSION,
        s3Verified: true,
      }),
    );
  });

  it("reports a legal hold when an absent upload is protected before intent", async () => {
    const rows = [uploadCandidate()];
    const prepareDeletion = vi.fn(async () => "held" as const);
    const store = persistence(rows, vi.fn(async () => undefined), prepareDeletion);
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));
    const deps = createProductionEvidenceRetentionDeps({
      persistence: store,
      objects: {
        listObjectVersionIds: vi.fn(async () => []),
        deleteObjectVersion,
      },
    });

    const result = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker" },
      deps,
    );

    expect(result).toMatchObject({ examined: 1, deleted: 0, held: 1, failed: [] });
    expect(prepareDeletion).toHaveBeenCalledOnce();
    expect(deleteObjectVersion).not.toHaveBeenCalled();
    expect(store.commitDeletion).not.toHaveBeenCalled();
  });
});
