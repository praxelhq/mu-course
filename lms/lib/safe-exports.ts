import { parseExportPolicy } from "./assessment-policies";
import { scanSensitiveText } from "./evidence/sensitive-data";
import { parseSubmissionSchema } from "./submission-schema";

const forbiddenExportTerm =
  /(answer.?key|blueprint|confidence|credential|evaluator|grade|monthly.?recurring.?revenue|mrr|product.?id|prompt|raw.?log|revenue.?30d|rubric|run.?log|s3.?key|score|secret|startup.?id|token|trust.?mrr)/i;

const APPEAL_STATES = new Set(["open", "resolved", "withdrawn"]);

export type SafeExportContract = {
  mode: "legacy" | "versioned";
  praxy: { enabled: boolean; fieldKeys: string[] };
  dpdp: { fieldKeys: string[]; evidenceRoles: string[] };
};

export function exportTermIsForbidden(value: string): boolean {
  return forbiddenExportTerm.test(value);
}

/**
 * Export contract selector. Versioned work is fail-closed and may only use the
 * immutable AssessmentVersion policy. Legacy behavior is deliberately narrow:
 * schema-declared primitive fields only, no legacy file-key projection.
 */
export function resolveSafeExportContract(args: {
  contractMode: "legacy" | "versioned";
  exportPolicy: unknown;
  submissionSchema: unknown;
  legacyPraxyEnabled: boolean;
}): SafeExportContract | null {
  if (args.contractMode === "versioned") {
    const policy = parseExportPolicy(args.exportPolicy);
    if (!policy) return null;
    return {
      mode: "versioned",
      praxy: {
        enabled: policy.praxy.enabled,
        fieldKeys: [...policy.praxy.fieldKeys],
      },
      dpdp: {
        fieldKeys: [...policy.dpdp.fieldKeys],
        evidenceRoles: [...policy.dpdp.evidenceRoles],
      },
    };
  }

  const schema = parseSubmissionSchema(args.submissionSchema);
  if (!schema) return null;
  const primitiveFields = schema.fields.filter(
    (field) =>
      field.kind !== "file" &&
      field.kind !== "files" &&
      field.exportable !== false &&
      !exportTermIsForbidden(field.key),
  );
  const praxyFields = primitiveFields.filter(
    (field) => field.kind === "link" || field.kind === "text" || field.kind === "writeup",
  );
  return {
    mode: "legacy",
    praxy: {
      enabled: args.legacyPraxyEnabled,
      fieldKeys: args.legacyPraxyEnabled ? praxyFields.map((field) => field.key) : [],
    },
    dpdp: {
      fieldKeys: primitiveFields.map((field) => field.key),
      evidenceRoles: [],
    },
  };
}

/** Null means the whole value must be withheld; no matched material returns. */
export function sanitizeExportText(value: unknown, role = "export"): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || exportTermIsForbidden(text)) return null;
  return scanSensitiveText(text, role).length === 0 ? text : null;
}

export type SafeScalarFields = Record<string, string | number | boolean | null>;

/** A second fail-closed boundary even when an immutable policy was mis-authored. */
export function projectSafeScalarFields(
  fields: unknown,
  allowedKeys: readonly string[],
): SafeScalarFields {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
  const source = fields as Record<string, unknown>;
  const projected: SafeScalarFields = {};
  for (const key of allowedKeys) {
    if (exportTermIsForbidden(key)) continue;
    const value = source[key];
    if (typeof value === "string") {
      const safe = sanitizeExportText(value, `field:${key}`);
      if (safe !== null) projected[key] = safe;
      continue;
    }
    if (value === null || typeof value === "boolean") {
      projected[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) projected[key] = value;
  }
  return projected;
}

export type PraxyCandidate = {
  id: string;
  version: number;
  attempt: number;
  contractMode: "legacy" | "versioned";
  exportPolicy: unknown;
  submissionSchema: unknown;
  legacyPraxyEnabled: boolean;
  lifecycle: string;
  publishable: boolean;
  ownerConsent: boolean;
  ownerRevokedAt: Date | null;
  instructorState: "pending" | "approved" | "withheld" | "revoked" | null;
  reviewCurrent: boolean;
  datasetBound: boolean;
};

/**
 * Select a safe Praxy version without exposing lifecycle data. A pending V2
 * leaves a safe V1 visible, but an explicit owner revocation removes the
 * complete versioned projection immediately.
 */
export function selectPraxyCandidate<T extends PraxyCandidate>(
  candidates: readonly T[],
): T | null {
  const newestFirst = [...candidates].sort(
    (left, right) => right.version - left.version || right.attempt - left.attempt,
  );
  const newest = newestFirst[0];
  if (
    newest?.contractMode === "versioned" &&
    (newest.ownerRevokedAt !== null || newest.instructorState === "revoked")
  ) {
    return null;
  }

  for (const candidate of newestFirst) {
    if (candidate.lifecycle !== "graded" && candidate.lifecycle !== "finalised") continue;
    const contract = resolveSafeExportContract(candidate);
    if (!contract?.praxy.enabled) continue;
    if (candidate.contractMode === "legacy") return candidate;
    if (
      candidate.publishable &&
      candidate.ownerConsent &&
      candidate.ownerRevokedAt === null &&
      candidate.instructorState === "approved" &&
      candidate.reviewCurrent &&
      !candidate.datasetBound
    ) {
      return candidate;
    }
  }
  return null;
}

type EvidenceInput = {
  role: string;
  filename: string;
  inspectedMimeType: string;
  byteCount: number;
  scanState: string;
  committedAt: Date | string;
  [privateMetadata: string]: unknown;
};

export type SafeEvidenceManifestItem = {
  role: string;
  filename: string;
  mediaType: string;
  bytes: number;
  receivedAt: string;
};

function toIso(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function projectSafeEvidenceManifest(
  evidence: readonly EvidenceInput[],
  allowedRoles: readonly string[],
): SafeEvidenceManifestItem[] {
  const allowed = new Set(allowedRoles.filter((role) => !exportTermIsForbidden(role)));
  const projected: SafeEvidenceManifestItem[] = [];
  for (const item of evidence) {
    if (!allowed.has(item.role) || item.scanState !== "clean") continue;
    if (exportTermIsForbidden(item.role)) continue;
    const filename = sanitizeExportText(item.filename, `evidence:${item.role}:filename`);
    const receivedAt = toIso(item.committedAt);
    if (
      !filename ||
      !receivedAt ||
      !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(
        item.inspectedMimeType,
      ) ||
      !Number.isSafeInteger(item.byteCount) ||
      item.byteCount < 0
    ) {
      continue;
    }
    projected.push({
      role: item.role,
      filename,
      mediaType: item.inspectedMimeType.toLocaleLowerCase("en-US"),
      bytes: item.byteCount,
      receivedAt,
    });
  }
  return projected;
}

type AppealInput = {
  reason: string;
  status: string;
  outcome: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  resolvedAt: Date | string | null;
};

export type SafeAppealHistoryItem = {
  reason: string;
  status: "open" | "resolved" | "withdrawn";
  outcome: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export function projectSafeAppealHistory(
  appeals: readonly AppealInput[],
): SafeAppealHistoryItem[] {
  const projected: SafeAppealHistoryItem[] = [];
  for (const appeal of appeals) {
    if (!APPEAL_STATES.has(appeal.status)) continue;
    const createdAt = toIso(appeal.createdAt);
    const updatedAt = toIso(appeal.updatedAt);
    const resolvedAt = appeal.resolvedAt === null ? null : toIso(appeal.resolvedAt);
    if (!createdAt || !updatedAt || (appeal.resolvedAt !== null && !resolvedAt)) continue;
    const reason = sanitizeExportText(appeal.reason, "appeal:reason") ?? "[redacted]";
    const outcome =
      appeal.outcome === null
        ? null
        : (sanitizeExportText(appeal.outcome, "appeal:outcome") ?? "[redacted]");
    projected.push({
      reason,
      status: appeal.status as SafeAppealHistoryItem["status"],
      outcome,
      createdAt,
      updatedAt,
      resolvedAt,
    });
  }
  return projected;
}
