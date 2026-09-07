import { describe, expect, it, vi } from "vitest";
import {
  agentHeartbeatPayloadSchema,
  listServiceHeartbeats,
  recordServiceHeartbeat,
} from "../lib/operations/service-heartbeats";
import { inspectDatabaseReadiness } from "../lib/operations/database-readiness";

const sourceSha = "a".repeat(40);

describe("durable service heartbeats", () => {
  it("upserts one durable row per service instance with only bounded metadata", async () => {
    const upsert = vi.fn(async () => undefined);

    await recordServiceHeartbeat(
      {
        serviceName: "worker",
        instanceId: "replica-1",
        sourceSha,
        deploymentId: "deploy-1",
        imageDigest: "snapshot-1",
        schemaHead: "20260730160000_sessions_3_5_contracts",
        intervalSeconds: 30,
        errorCount: 0,
        localOcrEnglish: true,
        lastSeenAt: new Date("2026-07-30T12:00:00.000Z"),
      },
      { upsert },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          serviceName_instanceId: { serviceName: "worker", instanceId: "replica-1" },
        },
        create: expect.objectContaining({
          sourceSha,
          metadata: {
            intervalSeconds: 30,
            errorCount: 0,
            localOcrEnglish: true,
            retentionMetrics: null,
          },
        }),
        update: expect.objectContaining({
          sourceSha,
          metadata: {
            intervalSeconds: 30,
            errorCount: 0,
            localOcrEnglish: true,
            retentionMetrics: null,
          },
        }),
      }),
    );
  });

  it("persists held retention work as fixed aggregates without object identifiers", async () => {
    const upsert = vi.fn(async () => undefined);

    await recordServiceHeartbeat(
      {
        serviceName: "retention",
        instanceId: "replica-1:retention",
        sourceSha,
        deploymentId: "deploy-1",
        imageDigest: "snapshot-1",
        schemaHead: "20260730160000_sessions_3_5_contracts",
        intervalSeconds: 3600,
        errorCount: 0,
        retentionMetrics: {
          examined: 3,
          deleted: 1,
          held: 2,
          alreadyDeleted: 0,
        },
        lastSeenAt: new Date("2026-07-30T12:00:00.000Z"),
      },
      { upsert },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: {
            intervalSeconds: 3600,
            errorCount: 0,
            localOcrEnglish: false,
            retentionMetrics: {
              examined: 3,
              deleted: 1,
              held: 2,
              alreadyDeleted: 0,
            },
          },
        }),
      }),
    );
    expect(JSON.stringify(upsert.mock.calls)).not.toContain("s3Key");
  });

  it("returns bounded rows for every service instance and fails closed on malformed metadata", async () => {
    const allRows = [
      {
        serviceName: "worker",
        instanceId: "new",
        sourceSha,
        deploymentId: "deploy-new",
        imageDigest: "snapshot-new",
        schemaHead: "head",
        metadata: { intervalSeconds: 30, errorCount: 0, ignored: "private" },
        lastSeenAt: new Date("2026-07-30T12:00:00.000Z"),
      },
      {
        serviceName: "worker",
        instanceId: "old",
        sourceSha,
        deploymentId: "deploy-old",
        imageDigest: "snapshot-old",
        schemaHead: "head",
        metadata: { intervalSeconds: 30, errorCount: 0 },
        lastSeenAt: new Date("2026-07-30T11:00:00.000Z"),
      },
      {
        serviceName: "agent",
        instanceId: "agent",
        sourceSha,
        deploymentId: "agent-deploy",
        imageDigest: "agent-snapshot",
        schemaHead: "head",
        metadata: { intervalSeconds: "thirty", errorCount: 0 },
        lastSeenAt: new Date("2026-07-30T12:00:00.000Z"),
      },
    ];
    const findMany = vi.fn(async (args: { where: { serviceName: string } }) =>
      allRows.filter((row) => row.serviceName === args.where.serviceName),
    );

    const rows = await listServiceHeartbeats(["worker", "agent"], { findMany });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ serviceName: "worker", instanceId: "new" });
    expect(rows[2]).toMatchObject({
      serviceName: "agent",
      intervalSeconds: 0,
      errorCount: 1,
    });
    expect(JSON.stringify(rows)).not.toContain("ignored");
  });

  it("accepts only bounded agent identity payloads", () => {
    const valid = {
      sourceSha,
      deploymentId: "deploy-agent",
      imageDigest: "snapshot-agent",
      instanceId: "replica-agent",
      intervalSeconds: 30,
    };

    expect(agentHeartbeatPayloadSchema.safeParse(valid).success).toBe(true);
    expect(
      agentHeartbeatPayloadSchema.safeParse({ ...valid, serviceName: "worker" }).success,
    ).toBe(false);
    expect(
      agentHeartbeatPayloadSchema.safeParse({ ...valid, sourceSha: "runtime-label" }).success,
    ).toBe(false);
  });
});

describe("migration readiness", () => {
  it("reports the applied head and failed migration count without trusting process health", async () => {
    const result = await inspectDatabaseReadiness({
      listAppliedMigrations: async () => [
        "20260701000000_one",
        "20260730160000_sessions_3_5_contracts",
      ],
      countFailedMigrations: async () => 0,
    });

    expect(result).toEqual({
      reachable: true,
      appliedHead: "20260730160000_sessions_3_5_contracts",
      failedMigrationCount: 0,
    });
  });

  it("returns a sanitized unavailable state on database failure", async () => {
    const result = await inspectDatabaseReadiness({
      listAppliedMigrations: async () => {
        throw new Error("postgres://secret@host/database");
      },
      countFailedMigrations: async () => 0,
    });

    expect(result).toEqual({
      reachable: false,
      appliedHead: null,
      failedMigrationCount: null,
    });
    expect(JSON.stringify(result)).not.toContain("postgres://");
  });
});
