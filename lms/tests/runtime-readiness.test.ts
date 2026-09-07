import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadRuntimeIdentity,
  type RuntimeIdentity,
} from "../lib/operations/runtime-identity";
import {
  assessServiceReadiness,
  expectedMigrationHead,
  readinessAuthResponse,
  type ServiceHeartbeatSnapshot,
} from "../lib/operations/readiness";

const sourceSha = "a".repeat(40);

function identity(overrides: Partial<RuntimeIdentity> = {}): RuntimeIdentity {
  return {
    sourceSha,
    deploymentId: "deploy-web",
    imageDigest: "snapshot-web",
    instanceId: "replica-web",
    verified: true,
    problems: [],
    ...overrides,
  };
}

function heartbeat(
  serviceName: "worker" | "agent" | "retention",
  overrides: Partial<ServiceHeartbeatSnapshot> = {},
): ServiceHeartbeatSnapshot {
  return {
    serviceName,
    instanceId: `${serviceName}-replica`,
    sourceSha,
    deploymentId: `${serviceName}-deploy`,
    imageDigest: `${serviceName}-snapshot`,
    schemaHead: "20260730160000_sessions_3_5_contracts",
    intervalSeconds: serviceName === "retention" ? 3600 : 30,
    errorCount: 0,
    localOcrEnglish: serviceName === "worker",
    retentionMetrics: null,
    lastSeenAt: new Date("2026-07-30T12:00:00.000Z"),
    ...overrides,
  };
}

describe("Railway runtime identity", () => {
  it("uses only the image-baked source SHA and ignores mutable runtime release labels", () => {
    const root = mkdtempSync(join(tmpdir(), "forge-identity-"));
    const sourcePath = join(root, "BUILD_SOURCE_SHA");
    writeFileSync(sourcePath, `${sourceSha}\n`, "utf8");

    const result = loadRuntimeIdentity({
      sourcePath,
      env: {
        RELEASE_SHA: "b".repeat(40),
        RAILWAY_GIT_COMMIT_SHA: "c".repeat(40),
        RAILWAY_DEPLOYMENT_ID: "deploy-1",
        RAILWAY_SNAPSHOT_ID: "snapshot-1",
        RAILWAY_REPLICA_ID: "replica-1",
      },
    });

    expect(result).toMatchObject({
      sourceSha,
      deploymentId: "deploy-1",
      imageDigest: "snapshot-1",
      instanceId: "replica-1",
      verified: true,
      problems: [],
    });
  });

  it("fails verification when the baked artifact or immutable Railway identity is missing", () => {
    const result = loadRuntimeIdentity({
      sourcePath: "/definitely/missing/BUILD_SOURCE_SHA",
      env: { RELEASE_SHA: sourceSha },
    });

    expect(result.verified).toBe(false);
    expect(result.sourceSha).toBe("unknown");
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "source-sha-unverified",
        "deployment-id-missing",
        "image-digest-missing",
        "instance-id-missing",
      ]),
    );
  });
});

describe("database-backed readiness", () => {
  it("passes only when schema and all durable service identities are current", () => {
    const result = assessServiceReadiness({
      now: new Date("2026-07-30T12:00:30.000Z"),
      webIdentity: identity(),
      expectedSchemaHead: "20260730160000_sessions_3_5_contracts",
      database: {
        reachable: true,
        appliedHead: "20260730160000_sessions_3_5_contracts",
        failedMigrationCount: 0,
      },
      heartbeats: [heartbeat("worker"), heartbeat("agent"), heartbeat("retention")],
      requiredServices: ["worker", "agent", "retention"],
    });

    expect(result.ready).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("distinguishes process liveness from an unreachable database", () => {
    const result = assessServiceReadiness({
      now: new Date("2026-07-30T12:00:30.000Z"),
      webIdentity: identity(),
      expectedSchemaHead: "20260730160000_sessions_3_5_contracts",
      database: { reachable: false, appliedHead: null, failedMigrationCount: null },
      heartbeats: [],
      requiredServices: ["worker", "agent", "retention"],
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toContainEqual({ code: "database-unavailable", ok: false });
  });

  it("rejects stale, mixed-commit, or failing service heartbeats", () => {
    const result = assessServiceReadiness({
      now: new Date("2026-07-30T14:01:00.001Z"),
      webIdentity: identity(),
      expectedSchemaHead: "20260730160000_sessions_3_5_contracts",
      database: {
        reachable: true,
        appliedHead: "20260730160000_sessions_3_5_contracts",
        failedMigrationCount: 0,
      },
      heartbeats: [
        heartbeat("worker", { sourceSha: "d".repeat(40) }),
        heartbeat("agent"),
        heartbeat("retention", { errorCount: 1 }),
      ],
      requiredServices: ["worker", "agent", "retention"],
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        { code: "worker-source-current", ok: false },
        { code: "agent-heartbeat-fresh", ok: false },
        { code: "retention-errors-clear", ok: false },
      ]),
    );
  });

  it("does not let a newer replica hide a second fresh mixed-commit replica", () => {
    const result = assessServiceReadiness({
      now: new Date("2026-07-30T12:00:20.000Z"),
      webIdentity: identity(),
      expectedSchemaHead: "20260730160000_sessions_3_5_contracts",
      database: {
        reachable: true,
        appliedHead: "20260730160000_sessions_3_5_contracts",
        failedMigrationCount: 0,
      },
      heartbeats: [
        heartbeat("worker", {
          instanceId: "worker-new",
          lastSeenAt: new Date("2026-07-30T12:00:10.000Z"),
        }),
        heartbeat("worker", {
          instanceId: "worker-old-but-active",
          sourceSha: "f".repeat(40),
          lastSeenAt: new Date("2026-07-30T12:00:05.000Z"),
        }),
        heartbeat("agent"),
        heartbeat("retention"),
      ],
      requiredServices: ["worker", "agent", "retention"],
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toContainEqual({ code: "worker-source-current", ok: false });
  });

  it("requires every fresh worker replica to prove the local English OCR runtime", () => {
    const result = assessServiceReadiness({
      now: new Date("2026-07-30T12:00:20.000Z"),
      webIdentity: identity(),
      expectedSchemaHead: "20260730160000_sessions_3_5_contracts",
      database: {
        reachable: true,
        appliedHead: "20260730160000_sessions_3_5_contracts",
        failedMigrationCount: 0,
      },
      heartbeats: [
        heartbeat("worker", { localOcrEnglish: false }),
        heartbeat("agent"),
        heartbeat("retention"),
      ],
      requiredServices: ["worker", "agent", "retention"],
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toContainEqual({ code: "worker-local-ocr-english", ok: false });
  });

  it("authenticates readiness without exposing token length through comparison", () => {
    const configured = { READINESS_TOKEN: "release-proof-token" };

    expect(readinessAuthResponse(new Request("https://forge.test/api/readiness"), configured)?.status)
      .toBe(401);
    expect(
      readinessAuthResponse(
        new Request("https://forge.test/api/readiness", {
          headers: { authorization: "Bearer wrong" },
        }),
        configured,
      )?.status,
    ).toBe(401);
    expect(
      readinessAuthResponse(
        new Request("https://forge.test/api/readiness", {
          headers: { authorization: "Bearer release-proof-token" },
        }),
        configured,
      ),
    ).toBeNull();
    expect(
      readinessAuthResponse(new Request("https://forge.test/api/readiness"), {}),
    ).toMatchObject({ status: 503 });
  });
});

describe("release artifact configuration", () => {
  it("derives the expected schema head from the immutable migration directory", () => {
    const root = mkdtempSync(join(tmpdir(), "forge-migrations-"));
    mkdirSync(join(root, "20260701000000_one"));
    mkdirSync(join(root, "20260730160000_sessions_3_5_contracts"));

    expect(expectedMigrationHead(root)).toBe("20260730160000_sessions_3_5_contracts");
  });

  it("keeps staging on production startup and bakes source identity in every image", () => {
    const stagingConfig = readFileSync(join(process.cwd(), "railway.staging.json"), "utf8");
    const stagingDockerfile = readFileSync(join(process.cwd(), "Dockerfile.staging"), "utf8");
    const dockerfiles = [
      readFileSync(join(process.cwd(), "Dockerfile.web"), "utf8"),
      readFileSync(join(process.cwd(), "Dockerfile.worker"), "utf8"),
      readFileSync(join(process.cwd(), "agent/Dockerfile"), "utf8"),
    ];

    expect(`${stagingConfig}\n${stagingDockerfile}`).not.toMatch(/next dev|pnpm seed/);
    expect(stagingDockerfile).toContain("docker-entrypoint.web.sh");
    for (const dockerfile of dockerfiles) {
      expect(dockerfile).toContain("ARG RAILWAY_GIT_COMMIT_SHA");
      expect(dockerfile).toContain("BUILD_SOURCE_SHA");
    }
    expect(dockerfiles[1]).toContain("tesseract-ocr-eng");
  });
});
