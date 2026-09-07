export type ProviderAuditMetadata = {
  hashes?: {
    assessment: string;
    dataset: string | null;
    evaluator: string;
  };
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  citations?: Array<{
    dimension: string;
    evidenceIds: string[];
  }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function projectHashes(value: unknown): ProviderAuditMetadata["hashes"] | undefined {
  const input = record(value);
  if (
    !input ||
    typeof input.assessment !== "string" ||
    !(typeof input.dataset === "string" || input.dataset === null) ||
    typeof input.evaluator !== "string"
  ) {
    return undefined;
  }
  return {
    assessment: input.assessment,
    dataset: input.dataset,
    evaluator: input.evaluator,
  };
}

function projectUsage(value: unknown): ProviderAuditMetadata["usage"] | null {
  const input = record(value);
  if (
    !input ||
    !nonNegativeNumber(input.inputTokens) ||
    !nonNegativeNumber(input.outputTokens)
  ) {
    return null;
  }
  return {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
  };
}

function projectCitations(
  value: unknown,
): ProviderAuditMetadata["citations"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const citations: NonNullable<ProviderAuditMetadata["citations"]> = [];
  for (const candidate of value) {
    const citation = record(candidate);
    if (
      !citation ||
      typeof citation.dimension !== "string" ||
      !Array.isArray(citation.evidenceIds) ||
      citation.evidenceIds.some((id) => typeof id !== "string")
    ) {
      return undefined;
    }
    citations.push({
      dimension: citation.dimension,
      evidenceIds: [...(citation.evidenceIds as string[])],
    });
  }
  return citations;
}

/**
 * Constructs the only provider-call metadata permitted in durable prompt logs.
 * The narrow input type prevents callers from forwarding prompts or raw output.
 */
export function buildProviderAuditMetadata(
  input: ProviderAuditMetadata,
): ProviderAuditMetadata {
  return {
    ...(input.hashes ? { hashes: { ...input.hashes } } : {}),
    model: input.model,
    usage: { ...input.usage },
    ...(input.citations
      ? {
          citations: input.citations.map((citation) => ({
            dimension: citation.dimension,
            evidenceIds: [...citation.evidenceIds],
          })),
        }
      : {}),
  };
}

/**
 * Projects legacy JSON through the same allowlist before instructor rendering.
 * Rows containing only historical prompt bodies intentionally render nothing.
 */
export function projectProviderAuditMetadata(value: unknown): ProviderAuditMetadata | null {
  const input = record(value);
  if (!input || typeof input.model !== "string") return null;
  const usage = projectUsage(input.usage);
  if (!usage) return null;
  const hashes = projectHashes(input.hashes);
  const citations = projectCitations(input.citations);
  return buildProviderAuditMetadata({
    ...(hashes ? { hashes } : {}),
    model: input.model,
    usage,
    ...(citations ? { citations } : {}),
  });
}
