import { prisma } from "@/lib/db";
import { inspectPrismaDatabaseReadiness } from "@/lib/operations/database-readiness";
import {
  assessServiceReadiness,
  expectedMigrationHead,
  readinessAuthResponse,
  type ServiceHeartbeatSnapshot,
} from "@/lib/operations/readiness";
import { loadRuntimeIdentity } from "@/lib/operations/runtime-identity";
import { listServiceHeartbeats } from "@/lib/operations/service-heartbeats";

export const dynamic = "force-dynamic";

const requiredServices = ["worker", "agent", "retention"] as const;
const noStore = { "Cache-Control": "no-store" };

/** Token-gated release proof. Unlike /api/health, this always touches Postgres. */
export async function GET(request: Request): Promise<Response> {
  const denied = readinessAuthResponse(request);
  if (denied) return denied;

  const webIdentity = loadRuntimeIdentity();
  let expectedHead: string;
  try {
    expectedHead = expectedMigrationHead();
  } catch {
    return Response.json(
      { ok: false, code: "migration-head-unavailable" },
      { status: 503, headers: noStore },
    );
  }

  const database = await inspectPrismaDatabaseReadiness(prisma);
  let heartbeats: ServiceHeartbeatSnapshot[] = [];
  if (database.reachable) {
    try {
      heartbeats = await listServiceHeartbeats([...requiredServices], {
        findMany: (args) => prisma.serviceHeartbeat.findMany(args),
      });
    } catch {
      return Response.json(
        { ok: false, code: "heartbeat-store-unavailable" },
        { status: 503, headers: noStore },
      );
    }
  }

  const result = assessServiceReadiness({
    now: new Date(),
    webIdentity,
    expectedSchemaHead: expectedHead,
    database,
    heartbeats,
    requiredServices: [...requiredServices],
  });

  return Response.json(
    {
      ok: result.ready,
      service: "web",
      artifact: {
        sourceSha: webIdentity.sourceSha,
        deploymentId: webIdentity.deploymentId,
        imageDigest: webIdentity.imageDigest,
        schemaHead: expectedHead,
      },
      checks: result.checks,
      heartbeats: heartbeats.map((heartbeat) => ({
        service: heartbeat.serviceName,
        instanceId: heartbeat.instanceId,
        sourceSha: heartbeat.sourceSha,
        deploymentId: heartbeat.deploymentId,
        imageDigest: heartbeat.imageDigest,
        schemaHead: heartbeat.schemaHead,
        intervalSeconds: heartbeat.intervalSeconds,
        errorCount: heartbeat.errorCount,
        localOcrEnglish: heartbeat.localOcrEnglish,
        retentionMetrics: heartbeat.retentionMetrics,
        lastSeenAt: heartbeat.lastSeenAt.toISOString(),
      })),
    },
    { status: result.ready ? 200 : 503, headers: noStore },
  );
}
