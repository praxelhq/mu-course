import { prisma } from "@/lib/db";
import { agentAuthResponse } from "@/lib/interview/realtime";
import { inspectPrismaDatabaseReadiness } from "@/lib/operations/database-readiness";
import { expectedMigrationHead } from "@/lib/operations/readiness";
import { loadRuntimeIdentity } from "@/lib/operations/runtime-identity";
import {
  agentHeartbeatPayloadSchema,
  recordServiceHeartbeat,
} from "@/lib/operations/service-heartbeats";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const noStore = { "Cache-Control": "no-store" };

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Agent-only durable heartbeat ingress; worker heartbeats write DB directly. */
export async function POST(request: Request): Promise<Response> {
  const denied = agentAuthResponse(request);
  if (denied) return denied;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json(
      { ok: false, code: "content-type-required" },
      { status: 415, headers: noStore },
    );
  }

  const body = await readBoundedBody(request);
  if (body === null) {
    return Response.json(
      { ok: false, code: "payload-too-large" },
      { status: 413, headers: noStore },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json(
      { ok: false, code: "invalid-json" },
      { status: 400, headers: noStore },
    );
  }
  const parsed = agentHeartbeatPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, code: "invalid-heartbeat" },
      { status: 400, headers: noStore },
    );
  }

  const webIdentity = loadRuntimeIdentity();
  if (!webIdentity.verified) {
    return Response.json(
      { ok: false, code: "web-artifact-unverified" },
      { status: 503, headers: noStore },
    );
  }
  if (parsed.data.sourceSha.toLowerCase() !== webIdentity.sourceSha) {
    return Response.json(
      { ok: false, code: "artifact-source-mismatch" },
      { status: 409, headers: noStore },
    );
  }

  let schemaHead: string;
  try {
    schemaHead = expectedMigrationHead();
  } catch {
    return Response.json(
      { ok: false, code: "migration-head-unavailable" },
      { status: 503, headers: noStore },
    );
  }
  const database = await inspectPrismaDatabaseReadiness(prisma);
  if (
    !database.reachable ||
    database.appliedHead !== schemaHead ||
    database.failedMigrationCount !== 0
  ) {
    return Response.json(
      { ok: false, code: "database-schema-not-ready" },
      { status: 503, headers: noStore },
    );
  }

  try {
    await recordServiceHeartbeat(
      {
        serviceName: "agent",
        instanceId: parsed.data.instanceId,
        sourceSha: parsed.data.sourceSha.toLowerCase(),
        deploymentId: parsed.data.deploymentId,
        imageDigest: parsed.data.imageDigest,
        schemaHead,
        intervalSeconds: parsed.data.intervalSeconds,
        errorCount: 0,
        lastSeenAt: new Date(),
      },
      { upsert: (args) => prisma.serviceHeartbeat.upsert(args) },
    );
  } catch {
    return Response.json(
      { ok: false, code: "heartbeat-write-failed" },
      { status: 503, headers: noStore },
    );
  }

  return Response.json({ ok: true }, { status: 200, headers: noStore });
}
