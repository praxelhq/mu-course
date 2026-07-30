import { describe, expect, it, vi } from "vitest";
import {
  parseHeartbeatIntervalSeconds,
  startWorkerHeartbeat,
} from "../worker/runtime-heartbeat";
import {
  resolveRetentionSchedule,
  runScheduledRetention,
} from "../worker/retention-schedule";
import type { RuntimeIdentity } from "../lib/operations/runtime-identity";
import { verifyWorkerRuntimeDependencies } from "../worker/runtime-dependencies";

const identity: RuntimeIdentity = {
  sourceSha: "a".repeat(40),
  deploymentId: "worker-deploy",
  imageDigest: "worker-snapshot",
  instanceId: "worker-replica",
  verified: true,
  problems: [],
};

describe("worker runtime heartbeat", () => {
  it("clamps the configured interval to the readiness contract", () => {
    expect(parseHeartbeatIntervalSeconds("30")).toBe(30);
    expect(parseHeartbeatIntervalSeconds("1")).toBe(10);
    expect(parseHeartbeatIntervalSeconds("9999")).toBe(300);
    expect(parseHeartbeatIntervalSeconds("nope")).toBe(30);
  });

  it("writes a durable direct-DB heartbeat before starting work", async () => {
    const writeHeartbeat = vi.fn(async () => undefined);
    const setIntervalFn = vi.fn(() => ({ unref: vi.fn() })) as never;

    const handle = await startWorkerHeartbeat({
      identity,
      expectedSchemaHead: "20260730160000_sessions_3_5_contracts",
      database: {
        reachable: true,
        appliedHead: "20260730160000_sessions_3_5_contracts",
        failedMigrationCount: 0,
      },
      intervalSeconds: 30,
      localOcrEnglish: true,
      writeHeartbeat,
      setIntervalFn,
    });

    expect(writeHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: "worker",
        sourceSha: identity.sourceSha,
        schemaHead: "20260730160000_sessions_3_5_contracts",
        intervalSeconds: 30,
        errorCount: 0,
        localOcrEnglish: true,
      }),
    );
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 30_000);
    handle.stop();
  });

  it("refuses to start on an unknown artifact or mismatched schema", async () => {
    const writeHeartbeat = vi.fn(async () => undefined);
    const base = {
      identity,
      expectedSchemaHead: "head-new",
      database: { reachable: true, appliedHead: "head-old", failedMigrationCount: 0 },
      intervalSeconds: 30,
      localOcrEnglish: true,
      writeHeartbeat,
    };

    await expect(startWorkerHeartbeat(base)).rejects.toThrow("schema");
    await expect(
      startWorkerHeartbeat({
        ...base,
        identity: { ...identity, verified: false },
        database: { reachable: true, appliedHead: "head-new", failedMigrationCount: 0 },
      }),
    ).rejects.toThrow("identity");
    expect(writeHeartbeat).not.toHaveBeenCalled();
  });

  it("requires the baked local English OCR runtime before advertising readiness", async () => {
    await expect(
      verifyWorkerRuntimeDependencies(async () => ["osd", "eng"]),
    ).resolves.toEqual({ localOcrEnglish: true });
    await expect(
      verifyWorkerRuntimeDependencies(async () => ["osd"]),
    ).rejects.toThrow("English");

    await expect(
      startWorkerHeartbeat({
        identity,
        expectedSchemaHead: "head",
        database: { reachable: true, appliedHead: "head", failedMigrationCount: 0 },
        intervalSeconds: 30,
        localOcrEnglish: false,
        writeHeartbeat: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("OCR");
  });
});

describe("retention scheduling", () => {
  it("requires an explicit cadence in production and accepts a bounded UTC schedule", () => {
    expect(() => resolveRetentionSchedule({}, true)).toThrow("RETENTION_CLEANUP_CRON");
    expect(resolveRetentionSchedule({}, false)).toBeNull();
    expect(
      resolveRetentionSchedule(
        {
          RETENTION_CLEANUP_CRON: "17 * * * *",
          RETENTION_CLEANUP_INTERVAL_SECONDS: "3600",
        },
        true,
      ),
    ).toEqual({ cron: "17 * * * *", intervalSeconds: 3600 });
  });

  it("writes a retention heartbeat and fails the job when any deletion is unverified", async () => {
    const writeHeartbeat = vi.fn(async () => undefined);
    const cleanup = vi.fn(async () => ({
      examined: 2,
      deleted: 1,
      held: 0,
      notExpired: 0,
      alreadyDeleted: 0,
      failed: [{ idempotencyKey: "safe-id", errorCode: "delete-unverified" }],
    }));

    await expect(
      runScheduledRetention({
        identity,
        schemaHead: "20260730160000_sessions_3_5_contracts",
        intervalSeconds: 3600,
        cleanup,
        writeHeartbeat,
        now: new Date("2026-07-30T12:00:00.000Z"),
      }),
    ).rejects.toThrow("1 retention deletion");
    expect(writeHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: "retention",
        errorCount: 1,
        intervalSeconds: 3600,
        retentionMetrics: {
          examined: 2,
          deleted: 1,
          held: 0,
          alreadyDeleted: 0,
        },
      }),
    );
    expect(JSON.stringify(writeHeartbeat.mock.calls)).not.toContain("object contents");
  });

  it("publishes held deletion totals without treating a legal hold as a service error", async () => {
    const writeHeartbeat = vi.fn(async () => undefined);

    const result = await runScheduledRetention({
      identity,
      schemaHead: "20260730160000_sessions_3_5_contracts",
      intervalSeconds: 3600,
      cleanup: async () => ({
        examined: 1,
        deleted: 0,
        held: 1,
        notExpired: 0,
        alreadyDeleted: 0,
        failed: [],
      }),
      writeHeartbeat,
      now: new Date("2026-07-30T12:00:00.000Z"),
    });

    expect(result.held).toBe(1);
    expect(writeHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCount: 0,
        retentionMetrics: expect.objectContaining({ held: 1 }),
      }),
    );
  });
});
