import { describe, expect, it, vi } from "vitest";
import {
  RetentionAdapterUnavailableError,
  runEvidenceRetentionCleanup,
  type EvidenceRetentionDeps,
  type EvidenceRetentionCandidate,
} from "../lib/evidence/retention";

const now = new Date("2026-07-30T12:00:00Z");

function candidate(
  overrides: Partial<EvidenceRetentionCandidate> = {},
): EvidenceRetentionCandidate {
  return {
    idempotencyKey: "retention:submission-evidence:evidence-1:version-1",
    targetType: "submission-evidence-quarantined",
    targetId: "evidence-1",
    retentionPolicyId: "policy-quarantine",
    expiresAt: new Date("2026-07-29T12:00:00Z"),
    s3Key: "submissions/user/sub/evidence.json",
    s3VersionId: "version-1",
    databaseAction: "mark-deleted",
    ...overrides,
  };
}

function deps(
  candidates: EvidenceRetentionCandidate[],
  overrides: Partial<EvidenceRetentionDeps> = {},
): EvidenceRetentionDeps {
  return {
    listCandidates: vi.fn(async () => candidates),
    hasActiveLegalHold: vi.fn(async () => false),
    hasDeletionReceipt: vi.fn(async () => false),
    deleteObjectVersion: vi.fn(async () => ({ verified: true, providerReceipt: "delete-1" })),
    commitDeletion: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("evidence retention cleanup", () => {
  it("processes only one bounded batch when the retention backlog is larger", async () => {
    const backlog = Array.from({ length: 5 }, (_, index) =>
      candidate({
        idempotencyKey: `backlog-${index + 1}`,
        targetId: `evidence-${index + 1}`,
        s3VersionId: `version-${index + 1}`,
      }),
    );
    const adapter = deps(backlog);

    const result = await runEvidenceRetentionCleanup(
      { now, requestedBy: "retention-worker", batchSize: 2 },
      adapter,
    );

    expect(adapter.listCandidates).toHaveBeenCalledWith(now, 2);
    expect(result).toMatchObject({ examined: 2, deleted: 2, failed: [] });
    expect(adapter.deleteObjectVersion).toHaveBeenCalledTimes(2);
    expect(adapter.commitDeletion).toHaveBeenCalledTimes(2);
  });

  it("deletes only expired, policy-eligible object versions and emits a redacted receipt", async () => {
    const eligible = candidate();
    const future = candidate({
      idempotencyKey: "future",
      targetId: "future",
      s3VersionId: "v2",
      expiresAt: new Date("2026-08-01T00:00:00Z"),
    });
    const adapter = deps([eligible, future]);

    const result = await runEvidenceRetentionCleanup({ now, requestedBy: "retention-worker" }, adapter);

    expect(result).toMatchObject({ deleted: 1, notExpired: 1, held: 0, failed: [] });
    expect(adapter.deleteObjectVersion).toHaveBeenCalledWith({
      key: eligible.s3Key,
      versionId: eligible.s3VersionId,
    });
    expect(adapter.commitDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: eligible.idempotencyKey,
        targetType: eligible.targetType,
        targetId: eligible.targetId,
        requestedBy: "retention-worker",
        s3Verified: true,
      }),
    );
    expect(JSON.stringify(vi.mocked(adapter.commitDeletion).mock.calls)).not.toContain(
      "objectContents",
    );
  });

  it("honors an active legal hold without deleting or writing a receipt", async () => {
    const adapter = deps([candidate()], {
      hasActiveLegalHold: vi.fn(async () => true),
    });

    const result = await runEvidenceRetentionCleanup({ now, requestedBy: "retention-worker" }, adapter);

    expect(result.held).toBe(1);
    expect(adapter.deleteObjectVersion).not.toHaveBeenCalled();
    expect(adapter.commitDeletion).not.toHaveBeenCalled();
  });

  it("is idempotent when a verified deletion receipt already exists", async () => {
    const adapter = deps([candidate()], {
      hasDeletionReceipt: vi.fn(async () => true),
    });

    const result = await runEvidenceRetentionCleanup({ now, requestedBy: "retention-worker" }, adapter);

    expect(result.alreadyDeleted).toBe(1);
    expect(adapter.deleteObjectVersion).not.toHaveBeenCalled();
    expect(adapter.commitDeletion).not.toHaveBeenCalled();
  });

  it("fails closed when the production S3 version-delete adapter is not bound", async () => {
    const adapter = deps([candidate()], {
      deleteObjectVersion: vi.fn(async () => {
        throw new RetentionAdapterUnavailableError("S3 deleteObjectVersion adapter is not bound");
      }),
    });

    const result = await runEvidenceRetentionCleanup({ now, requestedBy: "retention-worker" }, adapter);

    expect(result.deleted).toBe(0);
    expect(result.failed).toEqual([
      expect.objectContaining({
        idempotencyKey: candidate().idempotencyKey,
        errorCode: "adapter-unavailable",
      }),
    ]);
    expect(adapter.commitDeletion).not.toHaveBeenCalled();
  });

  it("never deletes submission or audit database rows even when a candidate is malformed", async () => {
    const malformed = candidate({
      targetType: "submission" as EvidenceRetentionCandidate["targetType"],
      databaseAction: "delete-row",
    });
    const adapter = deps([malformed]);

    const result = await runEvidenceRetentionCleanup({ now, requestedBy: "retention-worker" }, adapter);

    expect(result.failed).toEqual([
      expect.objectContaining({ errorCode: "target-not-eligible" }),
    ]);
    expect(adapter.deleteObjectVersion).not.toHaveBeenCalled();
    expect(adapter.commitDeletion).not.toHaveBeenCalled();
  });
});
