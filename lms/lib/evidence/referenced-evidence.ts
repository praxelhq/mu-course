import { parseSubmissionSchema } from "@/lib/submission-schema";

export type EvidenceIdentity = {
  id: string;
  fieldKey: string;
  fileRole: string;
};

/**
 * Authorize only receipts frozen into versioned file/file[] fields. A clean
 * receipt committed to the same draft is still private when it is not named
 * by the final Submission.fields snapshot, or when its field/role binding
 * differs from the published schema.
 */
export function selectReferencedEvidence<T extends EvidenceIdentity>(input: {
  publicSchema: unknown;
  fields: unknown;
  evidence: readonly T[];
}): T[] {
  const schema = parseSubmissionSchema(input.publicSchema);
  const fields =
    input.fields && typeof input.fields === "object" && !Array.isArray(input.fields)
      ? (input.fields as Record<string, unknown>)
      : null;
  if (!schema || !fields) return [];

  const bindings = new Map<string, { fieldKey: string; fileRole: string }>();
  const ambiguousIds = new Set<string>();
  for (const field of schema.fields) {
    if ((field.kind !== "file" && field.kind !== "files") || !field.fileRole) continue;
    const raw = fields[field.key];
    const ids = Array.isArray(raw)
      ? raw
      : typeof raw === "string" && raw.length > 0
        ? [raw]
        : [];
    for (const id of ids) {
      if (typeof id !== "string" || !id) continue;
      if (ambiguousIds.has(id)) continue;
      const existing = bindings.get(id);
      if (
        existing &&
        (existing.fieldKey !== field.key || existing.fileRole !== field.fileRole)
      ) {
        // Ambiguous reuse across file fields fails closed for this receipt.
        bindings.delete(id);
        ambiguousIds.add(id);
        continue;
      }
      bindings.set(id, { fieldKey: field.key, fileRole: field.fileRole });
    }
  }

  return input.evidence.filter((item) => {
    const binding = bindings.get(item.id);
    return Boolean(
      binding &&
        binding.fieldKey === item.fieldKey &&
        binding.fileRole === item.fileRole,
    );
  });
}
