import {
  parseSubmissionSchema,
  validateSubmissionFields,
} from "@/lib/submission-schema";
import {
  selectReferencedEvidence,
  type EvidenceIdentity,
} from "./referenced-evidence";

export type GradingEvidenceIdentity = EvidenceIdentity & {
  scanState: string;
};

export type GradingEvidenceAuthorization<T extends GradingEvidenceIdentity> =
  | {
      ok: true;
      receipts: T[];
      authorizedEvidenceIds: string[];
    }
  | {
      ok: false;
      receipts: [];
      authorizedEvidenceIds: [];
      quarantinedEvidenceIds: string[];
      repairFeedback: string;
    };

type FrozenReference = {
  id: string;
  fieldKey: string;
  fileRole: string;
};

function repairFeedback(fieldKeys: readonly string[]): string {
  const fields = [...new Set(fieldKeys)].sort();
  return [
    "Evidence was withheld before AI processing because the frozen submission references could not be verified.",
    ...fields.map(
      (field) =>
        `- ${field}: select and commit a clean replacement that matches the published file field and role.`,
    ),
    "Receipt values and object locations are intentionally not shown.",
  ].join("\n");
}

/**
 * Authorize the exact clean receipts frozen into a versioned Submission.fields
 * snapshot. Unreferenced draft receipts are intentionally ignored.
 */
export function authorizeGradingEvidence<T extends GradingEvidenceIdentity>(input: {
  publicSchema: unknown;
  submissionVersion: number;
  fields: unknown;
  evidence: readonly T[];
}): GradingEvidenceAuthorization<T> {
  const schema = parseSubmissionSchema(input.publicSchema);
  const fields =
    input.fields && typeof input.fields === "object" && !Array.isArray(input.fields)
      ? (input.fields as Record<string, unknown>)
      : null;
  if (
    !schema ||
    !fields ||
    !Number.isInteger(input.submissionVersion) ||
    input.submissionVersion < 1 ||
    !validateSubmissionFields(schema, fields, {
      submissionVersion: input.submissionVersion,
    }).ok
  ) {
    return {
      ok: false,
      receipts: [],
      authorizedEvidenceIds: [],
      quarantinedEvidenceIds: [],
      repairFeedback: repairFeedback(["published evidence contract"]),
    };
  }

  const references: FrozenReference[] = [];
  const invalidFields: string[] = [];
  const seenIds = new Set<string>();
  for (const field of schema.fields) {
    if (field.kind !== "file" && field.kind !== "files") continue;
    const raw = fields[field.key];
    if (!field.fileRole) {
      invalidFields.push(field.key);
      continue;
    }
    const ids =
      field.kind === "file"
        ? typeof raw === "string" && raw.trim()
          ? [raw]
          : []
        : Array.isArray(raw)
          ? raw.filter((value): value is string => typeof value === "string" && value.length > 0)
          : [];
    for (const id of ids) {
      if (seenIds.has(id)) {
        invalidFields.push(field.key);
        continue;
      }
      seenIds.add(id);
      references.push({ id, fieldKey: field.key, fileRole: field.fileRole });
    }
  }

  const selected = selectReferencedEvidence({
    publicSchema: input.publicSchema,
    fields,
    evidence: input.evidence,
  });
  const selectedById = new Map(selected.map((receipt) => [receipt.id, receipt]));
  const evidenceById = new Map<string, T[]>();
  for (const receipt of input.evidence) {
    const current = evidenceById.get(receipt.id) ?? [];
    current.push(receipt);
    evidenceById.set(receipt.id, current);
  }

  const quarantinedIds = new Set<string>();
  for (const reference of references) {
    const candidates = evidenceById.get(reference.id) ?? [];
    const receipt = selectedById.get(reference.id);
    if (
      candidates.length !== 1 ||
      !receipt ||
      receipt.fieldKey !== reference.fieldKey ||
      receipt.fileRole !== reference.fileRole ||
      receipt.scanState !== "clean"
    ) {
      invalidFields.push(reference.fieldKey);
      for (const candidate of candidates) {
        if (candidate.scanState !== "deleted") quarantinedIds.add(candidate.id);
      }
    }
  }

  if (invalidFields.length > 0) {
    return {
      ok: false,
      receipts: [],
      authorizedEvidenceIds: [],
      quarantinedEvidenceIds: [...quarantinedIds],
      repairFeedback: repairFeedback(invalidFields),
    };
  }

  const receipts = references.map((reference) => selectedById.get(reference.id)!);
  return {
    ok: true,
    receipts,
    authorizedEvidenceIds: receipts.map((receipt) => receipt.id),
  };
}
