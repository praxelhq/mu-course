import type { DatabaseReadiness } from "../lib/operations/readiness";
import type { RuntimeIdentity } from "../lib/operations/runtime-identity";
import type { RecordServiceHeartbeatInput } from "../lib/operations/service-heartbeats";

type IntervalHandle = ReturnType<typeof setInterval>;

export function parseHeartbeatIntervalSeconds(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 30;
  return Math.min(300, Math.max(10, parsed));
}

export async function startWorkerHeartbeat(input: {
  identity: RuntimeIdentity;
  expectedSchemaHead: string;
  database: DatabaseReadiness;
  intervalSeconds: number;
  localOcrEnglish: boolean;
  writeHeartbeat(record: RecordServiceHeartbeatInput): Promise<void>;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}): Promise<{ stop(): void }> {
  if (!input.identity.verified) {
    throw new Error("Worker artifact identity is not verified");
  }
  if (
    !input.database.reachable ||
    input.database.appliedHead !== input.expectedSchemaHead ||
    input.database.failedMigrationCount !== 0
  ) {
    throw new Error("Worker database schema is not ready");
  }
  if (!input.localOcrEnglish) {
    throw new Error("Worker local English OCR runtime is not ready");
  }

  const intervalSeconds = parseHeartbeatIntervalSeconds(String(input.intervalSeconds));
  const heartbeat = (): Promise<void> =>
    input.writeHeartbeat({
      serviceName: "worker",
      instanceId: input.identity.instanceId!,
      sourceSha: input.identity.sourceSha,
      deploymentId: input.identity.deploymentId,
      imageDigest: input.identity.imageDigest!,
      schemaHead: input.expectedSchemaHead,
      intervalSeconds,
      errorCount: 0,
      localOcrEnglish: true,
      lastSeenAt: new Date(),
    });

  // The first durable write is a startup gate, not best effort. A worker with
  // no DB-backed identity must not begin consuming jobs.
  await heartbeat();
  const setIntervalFn = input.setIntervalFn ?? setInterval;
  const clearIntervalFn = input.clearIntervalFn ?? clearInterval;
  const handle = setIntervalFn(() => {
    void heartbeat().catch((error: unknown) => {
      console.error(
        "[worker] durable heartbeat failed:",
        error instanceof Error ? error.name : "unknown-error",
      );
    });
  }, intervalSeconds * 1_000) as IntervalHandle;
  handle.unref?.();

  return { stop: () => clearIntervalFn(handle) };
}
