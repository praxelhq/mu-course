import type { EvidenceRetentionResult } from "../lib/evidence/retention";
import type { RuntimeIdentity } from "../lib/operations/runtime-identity";
import type { RecordServiceHeartbeatInput } from "../lib/operations/service-heartbeats";

type RetentionEnv = Record<string, string | undefined>;

export type RetentionSchedule = { cron: string; intervalSeconds: number };

export function resolveRetentionSchedule(
  env: RetentionEnv = process.env,
  required: boolean = process.env.NODE_ENV === "production",
): RetentionSchedule | null {
  const cron = env.RETENTION_CLEANUP_CRON?.trim();
  if (!cron) {
    if (required) throw new Error("RETENTION_CLEANUP_CRON is required in production");
    return null;
  }
  if (cron.length > 128 || /[\r\n\0]/.test(cron) || cron.split(/\s+/).length !== 5) {
    throw new Error("RETENTION_CLEANUP_CRON must be a bounded five-field cron expression");
  }
  const parsedInterval = Number(env.RETENTION_CLEANUP_INTERVAL_SECONDS);
  if (
    !Number.isInteger(parsedInterval) ||
    parsedInterval < 60 ||
    parsedInterval > 86_400
  ) {
    throw new Error(
      "RETENTION_CLEANUP_INTERVAL_SECONDS must be an integer from 60 to 86400",
    );
  }
  return { cron, intervalSeconds: parsedInterval };
}

export async function runScheduledRetention(input: {
  identity: RuntimeIdentity;
  schemaHead: string;
  intervalSeconds: number;
  now?: Date;
  cleanup(): Promise<EvidenceRetentionResult>;
  writeHeartbeat(record: RecordServiceHeartbeatInput): Promise<void>;
}): Promise<EvidenceRetentionResult> {
  if (!input.identity.verified) throw new Error("Retention artifact identity is not verified");
  const now = input.now ?? new Date();
  let result: EvidenceRetentionResult;
  try {
    result = await input.cleanup();
  } catch {
    await input.writeHeartbeat({
      serviceName: "retention",
      instanceId: `${input.identity.instanceId}:retention`,
      sourceSha: input.identity.sourceSha,
      deploymentId: input.identity.deploymentId,
      imageDigest: input.identity.imageDigest!,
      schemaHead: input.schemaHead,
      intervalSeconds: input.intervalSeconds,
      errorCount: 1,
      lastSeenAt: now,
    });
    throw new Error("Retention cleanup execution failed");
  }

  await input.writeHeartbeat({
    serviceName: "retention",
    instanceId: `${input.identity.instanceId}:retention`,
    sourceSha: input.identity.sourceSha,
    deploymentId: input.identity.deploymentId,
    imageDigest: input.identity.imageDigest!,
    schemaHead: input.schemaHead,
    intervalSeconds: input.intervalSeconds,
    errorCount: result.failed.length,
    retentionMetrics: {
      examined: result.examined,
      deleted: result.deleted,
      held: result.held,
      alreadyDeleted: result.alreadyDeleted,
    },
    lastSeenAt: now,
  });
  if (result.failed.length > 0) {
    const errorCodes = [...new Set(result.failed.map((failure) => failure.errorCode))]
      .sort()
      .join(",");
    throw new Error(
      `${result.failed.length} retention deletion(s) require retry or review [${errorCodes}]`,
    );
  }
  return result;
}
