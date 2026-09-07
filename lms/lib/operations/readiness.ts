import { createHash, timingSafeEqual } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeIdentity } from "./runtime-identity";

type ReadinessEnv = Record<string, string | undefined>;

export type DurableServiceName = "worker" | "agent" | "retention";

export type RetentionHeartbeatMetrics = {
  examined: number;
  deleted: number;
  held: number;
  alreadyDeleted: number;
};

export type ServiceHeartbeatSnapshot = {
  serviceName: DurableServiceName;
  instanceId: string;
  sourceSha: string;
  deploymentId: string | null;
  imageDigest: string;
  schemaHead: string;
  intervalSeconds: number;
  errorCount: number;
  localOcrEnglish: boolean;
  retentionMetrics: RetentionHeartbeatMetrics | null;
  lastSeenAt: Date;
};

export type DatabaseReadiness = {
  reachable: boolean;
  appliedHead: string | null;
  failedMigrationCount: number | null;
};

export type ReadinessCheck = { code: string; ok: boolean };

export type ServiceReadiness = {
  ready: boolean;
  checks: ReadinessCheck[];
};

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

/** Token guard for the DB-backed release-proof endpoint. */
export function readinessAuthResponse(
  request: Request,
  env: ReadinessEnv = process.env,
): Response | null {
  const expected = env.READINESS_TOKEN?.trim();
  if (!expected) {
    return Response.json(
      { ok: false, code: "readiness-token-not-configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!supplied || !safeEqual(supplied, expected)) {
    return Response.json(
      { ok: false, code: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

/** Latest timestamp-prefixed Prisma migration baked into the image. */
export function expectedMigrationHead(
  migrationsRoot: string = join(process.cwd(), "prisma", "migrations"),
): string {
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_[A-Za-z0-9_-]+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const head = migrations.at(-1);
  if (!head) throw new Error("No Prisma migration head is baked into this image");
  return head;
}

function push(checks: ReadinessCheck[], code: string, ok: boolean): void {
  checks.push({ code, ok });
}

function validInterval(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 86_400;
}

/**
 * Pure release decision. Liveness is intentionally outside this function;
 * readiness requires the exact schema and fresh durable service proof.
 */
export function assessServiceReadiness(input: {
  now: Date;
  webIdentity: RuntimeIdentity;
  expectedSchemaHead: string;
  database: DatabaseReadiness;
  heartbeats: ServiceHeartbeatSnapshot[];
  requiredServices: DurableServiceName[];
}): ServiceReadiness {
  const checks: ReadinessCheck[] = [];
  push(checks, "web-artifact-identity", input.webIdentity.verified);

  if (!input.database.reachable) {
    push(checks, "database-unavailable", false);
  } else {
    push(
      checks,
      "schema-head-current",
      input.database.appliedHead === input.expectedSchemaHead &&
        input.database.failedMigrationCount === 0,
    );
  }

  for (const serviceName of input.requiredServices) {
    const candidates = input.heartbeats
      .filter((heartbeat) => heartbeat.serviceName === serviceName)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    if (candidates.length === 0) {
      push(checks, `${serviceName}-heartbeat-missing`, false);
      continue;
    }

    const active = candidates.filter((heartbeat) => {
      const intervalOk = validInterval(heartbeat.intervalSeconds);
      const ageMs = input.now.getTime() - heartbeat.lastSeenAt.getTime();
      return intervalOk && ageMs >= 0 && ageMs <= heartbeat.intervalSeconds * 2 * 1_000;
    });
    push(checks, `${serviceName}-heartbeat-fresh`, active.length > 0);
    push(
      checks,
      `${serviceName}-source-current`,
      active.length > 0 &&
        active.every((heartbeat) => heartbeat.sourceSha === input.webIdentity.sourceSha),
    );
    push(
      checks,
      `${serviceName}-schema-current`,
      active.length > 0 &&
        active.every((heartbeat) => heartbeat.schemaHead === input.expectedSchemaHead),
    );
    push(
      checks,
      `${serviceName}-immutable-identity`,
      active.length > 0 &&
        active.every((heartbeat) =>
          Boolean(heartbeat.deploymentId && heartbeat.imageDigest && heartbeat.instanceId),
        ),
    );
    push(
      checks,
      `${serviceName}-errors-clear`,
      active.length > 0 && active.every((heartbeat) => heartbeat.errorCount === 0),
    );
    if (serviceName === "worker") {
      push(
        checks,
        "worker-local-ocr-english",
        active.length > 0 && active.every((heartbeat) => heartbeat.localOcrEnglish),
      );
    }
  }

  return { ready: checks.every((check) => check.ok), checks };
}
