import { readFileSync } from "node:fs";
import { join } from "node:path";

const GIT_SHA = /^[0-9a-f]{40}$/i;

type RuntimeEnv = Record<string, string | undefined>;

export type RuntimeIdentity = {
  sourceSha: string;
  deploymentId: string | null;
  imageDigest: string | null;
  instanceId: string | null;
  verified: boolean;
  problems: string[];
};

export type RuntimeIdentityInput = {
  sourcePath?: string;
  env?: RuntimeEnv;
  readSource?: (path: string) => string;
};

function value(input: string | undefined): string | null {
  const normalized = input?.trim();
  return normalized ? normalized : null;
}

/**
 * Read immutable deployment identity. The Git SHA is accepted only from a
 * file created while the image is built; mutable runtime labels such as
 * RELEASE_SHA and RAILWAY_GIT_COMMIT_SHA are deliberately ignored here.
 */
export function loadRuntimeIdentity(input: RuntimeIdentityInput = {}): RuntimeIdentity {
  const env = input.env ?? process.env;
  const sourcePath = input.sourcePath ?? join(process.cwd(), "BUILD_SOURCE_SHA");
  const readSource = input.readSource ?? ((path: string) => readFileSync(path, "utf8"));

  let sourceSha = "unknown";
  try {
    const candidate = readSource(sourcePath).trim();
    if (GIT_SHA.test(candidate)) sourceSha = candidate.toLowerCase();
  } catch {
    // Readiness reports the stable reason code below. Never copy file errors
    // or paths into the public liveness response.
  }

  const deploymentId = value(env.RAILWAY_DEPLOYMENT_ID);
  // Railway's immutable snapshot id identifies the service image/build
  // snapshot. It is intentionally not replaceable by a mutable release env.
  const imageDigest = value(env.RAILWAY_SNAPSHOT_ID);
  const instanceId = value(env.RAILWAY_REPLICA_ID);
  const problems: string[] = [];

  if (!GIT_SHA.test(sourceSha)) problems.push("source-sha-unverified");
  if (!deploymentId) problems.push("deployment-id-missing");
  if (!imageDigest) problems.push("image-digest-missing");
  if (!instanceId) problems.push("instance-id-missing");

  return {
    sourceSha,
    deploymentId,
    imageDigest,
    instanceId,
    verified: problems.length === 0,
    problems,
  };
}
