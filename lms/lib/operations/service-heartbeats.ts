import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type {
  DurableServiceName,
  RetentionHeartbeatMetrics,
  ServiceHeartbeatSnapshot,
} from "./readiness";

const SHA_40 = /^[0-9a-f]{40}$/i;
const boundedId = z.string().trim().min(1).max(256);

export const agentHeartbeatPayloadSchema = z
  .strictObject({
    sourceSha: z.string().regex(SHA_40),
    deploymentId: boundedId,
    imageDigest: boundedId,
    instanceId: boundedId,
    intervalSeconds: z.number().int().min(10).max(300),
  });

export type AgentHeartbeatPayload = z.infer<typeof agentHeartbeatPayloadSchema>;

export type RecordServiceHeartbeatInput = {
  serviceName: DurableServiceName;
  instanceId: string;
  sourceSha: string;
  deploymentId: string | null;
  imageDigest: string;
  schemaHead: string;
  intervalSeconds: number;
  errorCount: number;
  localOcrEnglish?: boolean;
  retentionMetrics?: RetentionHeartbeatMetrics;
  lastSeenAt: Date;
};

type HeartbeatUpsertStore = {
  upsert(args: Prisma.ServiceHeartbeatUpsertArgs): Promise<unknown>;
};

type HeartbeatRow = {
  serviceName: string;
  instanceId: string;
  sourceSha: string;
  deploymentId: string | null;
  imageDigest: string;
  schemaHead: string;
  metadata: unknown;
  lastSeenAt: Date;
};

type HeartbeatFindStore = {
  findMany(args: Prisma.ServiceHeartbeatFindManyArgs): Promise<HeartbeatRow[]>;
};

function boundedRuntimeMetadata(input: RecordServiceHeartbeatInput): {
  intervalSeconds: number;
  errorCount: number;
  localOcrEnglish: boolean;
  retentionMetrics: RetentionHeartbeatMetrics | null;
} {
  const intervalSeconds = Number.isInteger(input.intervalSeconds)
    ? Math.min(86_400, Math.max(5, input.intervalSeconds))
    : 0;
  const errorCount = Number.isInteger(input.errorCount)
    ? Math.min(1_000_000, Math.max(0, input.errorCount))
    : 1;
  const count = (value: number): number =>
    Number.isInteger(value) ? Math.min(1_000_000, Math.max(0, value)) : 0;
  const retentionMetrics = input.retentionMetrics
    ? {
        examined: count(input.retentionMetrics.examined),
        deleted: count(input.retentionMetrics.deleted),
        held: count(input.retentionMetrics.held),
        alreadyDeleted: count(input.retentionMetrics.alreadyDeleted),
      }
    : null;
  return {
    intervalSeconds,
    errorCount,
    localOcrEnglish: input.localOcrEnglish === true,
    retentionMetrics,
  };
}

export async function recordServiceHeartbeat(
  input: RecordServiceHeartbeatInput,
  store: HeartbeatUpsertStore,
): Promise<void> {
  const metadata = boundedRuntimeMetadata(input);
  const data = {
    serviceName: input.serviceName,
    instanceId: input.instanceId,
    sourceSha: input.sourceSha,
    deploymentId: input.deploymentId,
    imageDigest: input.imageDigest,
    schemaHead: input.schemaHead,
    metadata,
    lastSeenAt: input.lastSeenAt,
  };
  await store.upsert({
    where: {
      serviceName_instanceId: {
        serviceName: input.serviceName,
        instanceId: input.instanceId,
      },
    },
    create: data,
    update: {
      sourceSha: data.sourceSha,
      deploymentId: data.deploymentId,
      imageDigest: data.imageDigest,
      schemaHead: data.schemaHead,
      metadata: data.metadata,
      lastSeenAt: data.lastSeenAt,
    },
  });
}

function parseMetadata(metadata: unknown): {
  intervalSeconds: number;
  errorCount: number;
  localOcrEnglish: boolean;
  retentionMetrics: RetentionHeartbeatMetrics | null;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      intervalSeconds: 0,
      errorCount: 1,
      localOcrEnglish: false,
      retentionMetrics: null,
    };
  }
  const record = metadata as Record<string, unknown>;
  const intervalSeconds =
    Number.isInteger(record.intervalSeconds) &&
    Number(record.intervalSeconds) >= 5 &&
    Number(record.intervalSeconds) <= 86_400
      ? Number(record.intervalSeconds)
      : 0;
  const parsedErrorCount =
    Number.isInteger(record.errorCount) && Number(record.errorCount) >= 0
      ? Number(record.errorCount)
      : 1;
  const metrics = record.retentionMetrics;
  const parseCount = (value: unknown): number | null =>
    Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000
      ? Number(value)
      : null;
  let retentionMetrics: RetentionHeartbeatMetrics | null = null;
  if (metrics && typeof metrics === "object" && !Array.isArray(metrics)) {
    const values = metrics as Record<string, unknown>;
    const examined = parseCount(values.examined);
    const deleted = parseCount(values.deleted);
    const held = parseCount(values.held);
    const alreadyDeleted = parseCount(values.alreadyDeleted);
    if (examined !== null && deleted !== null && held !== null && alreadyDeleted !== null) {
      retentionMetrics = { examined, deleted, held, alreadyDeleted };
    }
  }
  return {
    intervalSeconds,
    errorCount: intervalSeconds === 0 ? Math.max(1, parsedErrorCount) : parsedErrorCount,
    localOcrEnglish: record.localOcrEnglish === true,
    retentionMetrics,
  };
}

export async function listServiceHeartbeats(
  serviceNames: DurableServiceName[],
  store: HeartbeatFindStore,
): Promise<ServiceHeartbeatSnapshot[]> {
  const rows = (
    await Promise.all(
      serviceNames.map((serviceName) =>
        store.findMany({
          where: { serviceName },
          orderBy: { lastSeenAt: "desc" },
          take: 50,
        }),
      ),
    )
  ).flat();
  const snapshots: ServiceHeartbeatSnapshot[] = [];
  for (const row of rows) {
    if (!serviceNames.includes(row.serviceName as DurableServiceName)) continue;
    const serviceName = row.serviceName as DurableServiceName;
    snapshots.push({
      serviceName,
      instanceId: row.instanceId,
      sourceSha: row.sourceSha,
      deploymentId: row.deploymentId,
      imageDigest: row.imageDigest,
      schemaHead: row.schemaHead,
      ...parseMetadata(row.metadata),
      lastSeenAt: row.lastSeenAt,
    });
  }
  return snapshots;
}
