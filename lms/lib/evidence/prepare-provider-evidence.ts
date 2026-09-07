import { createHash } from "node:crypto";
import type { AssessmentProviderAttachment } from "@/lib/assessments/run-evaluation";
import { readObjectVersion } from "@/lib/s3";
import {
  decodeBoundedLocalText,
  extractLocalEvidenceText,
} from "./local-text-extraction";
import {
  buildRedactedRepairFeedback,
  type SensitiveFinding,
} from "./sensitive-data";
import {
  preflightWorkflowEvidence,
  type OcrEvidence,
  type WorkflowPreflightResult,
} from "./workflow-preflight";

export type CommittedEvidenceReceipt = {
  id: string;
  fieldKey: string;
  fileRole: string;
  s3Key: string;
  s3VersionId: string;
  sha256: string;
  byteCount: number;
  inspectedMimeType: string;
  scanState: string;
};

export type PreparedWorkflowEvidence = {
  safeForProvider: boolean;
  findings: SensitiveFinding[];
  quarantinedEvidenceIds: string[];
  repairFeedback: string | null;
  blueprintSummary: WorkflowPreflightResult["blueprintSummary"];
  blueprintFailureCode: WorkflowPreflightResult["blueprintFailureCode"];
  attachments: AssessmentProviderAttachment[];
  textEvidence: { id: string; text: string }[];
};

const PROVIDER_TEXT_PER_ROLE = 20_000;
const PROVIDER_TEXT_TOTAL = 50_000;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isBlueprint(receipt: CommittedEvidenceReceipt): boolean {
  return receipt.fileRole === "blueprintFile" || receipt.fieldKey === "blueprintFile";
}

function isTextMime(mime: string): boolean {
  return (
    mime === "application/json" ||
    mime === "application/x-ndjson" ||
    mime.startsWith("text/")
  );
}

function evidenceId(receipt: CommittedEvidenceReceipt): string {
  return `${receipt.fileRole}:${receipt.id}`;
}

/** Production binding: read only the immutable object version committed in the receipt. */
export function readCommittedEvidenceVersion(
  receipt: CommittedEvidenceReceipt,
): Promise<Uint8Array> {
  return readObjectVersion(receipt.s3Key, receipt.s3VersionId, receipt.byteCount);
}

/**
 * Authorize committed evidence for a provider. Every byte is read from its
 * recorded immutable object version, integrity checked, locally text-scanned
 * or OCR-scanned, and withheld as a whole when any role is unsafe.
 */
export async function prepareWorkflowEvidenceForProvider(input: {
  receipts: CommittedEvidenceReceipt[];
  readExact?: (receipt: CommittedEvidenceReceipt) => Promise<Uint8Array>;
  ocr?: OcrEvidence;
}): Promise<PreparedWorkflowEvidence> {
  const readExact = input.readExact ?? readCommittedEvidenceVersion;
  const ocr = input.ocr ?? extractLocalEvidenceText;
  const initialFindings: SensitiveFinding[] = [];
  const bytesById = new Map<string, Uint8Array>();

  for (const receipt of input.receipts) {
    if (receipt.scanState === "quarantined" || receipt.scanState === "deleted") {
      initialFindings.push({
        detector: "evidence-unavailable",
        role: receipt.fileRole,
        offset: 0,
      });
      continue;
    }
    try {
      const bytes = await readExact(receipt);
      if (bytes.byteLength !== receipt.byteCount || sha256(bytes) !== receipt.sha256.toLowerCase()) {
        initialFindings.push({
          detector: "evidence-integrity",
          role: receipt.fileRole,
          offset: 0,
        });
        continue;
      }
      bytesById.set(receipt.id, bytes);
    } catch {
      initialFindings.push({
        detector: "evidence-unavailable",
        role: receipt.fileRole,
        offset: 0,
      });
    }
  }

  let blueprint: Uint8Array | undefined;
  let blueprintRole: string | undefined;
  const decodedTextById = new Map<string, string>();
  const textRoles: { role: string; text: string }[] = [];
  const imageRoles: { role: string; bytes: Uint8Array; mimeType: string }[] = [];
  for (const receipt of input.receipts) {
    const bytes = bytesById.get(receipt.id);
    if (!bytes) continue;
    if (isBlueprint(receipt)) {
      const decoded = decodeBoundedLocalText(bytes);
      if (decoded === null) {
        initialFindings.push({
          detector: "text-unreadable",
          role: receipt.fileRole,
          offset: 0,
        });
      } else {
        blueprint = bytes;
        blueprintRole = receipt.fileRole;
        decodedTextById.set(receipt.id, decoded);
      }
    } else if (
      receipt.inspectedMimeType === "image/png" ||
      receipt.inspectedMimeType === "image/jpeg" ||
      receipt.inspectedMimeType === "application/pdf"
    ) {
      imageRoles.push({
        role: receipt.fileRole,
        bytes,
        mimeType: receipt.inspectedMimeType,
      });
    } else if (isTextMime(receipt.inspectedMimeType)) {
      const decoded = decodeBoundedLocalText(bytes);
      if (decoded === null) {
        initialFindings.push({
          detector: "text-unreadable",
          role: receipt.fileRole,
          offset: 0,
        });
      } else {
        decodedTextById.set(receipt.id, decoded);
        textRoles.push({ role: receipt.fileRole, text: decoded });
      }
    } else {
      initialFindings.push({ detector: "mime-unsupported", role: receipt.fileRole, offset: 0 });
    }
  }

  const preflight = await preflightWorkflowEvidence({
    blueprint,
    blueprintRole,
    textRoles,
    imageRoles,
    ocr,
  });
  const findings = [...initialFindings, ...preflight.findings];
  const unsafeRoles = new Set(findings.map((finding) => finding.role));
  const quarantinedEvidenceIds = input.receipts
    .filter((receipt) => unsafeRoles.has(receipt.fileRole))
    .map((receipt) => receipt.id);
  const safeForProvider = findings.length === 0;

  if (!safeForProvider) {
    return {
      safeForProvider: false,
      findings,
      quarantinedEvidenceIds,
      repairFeedback: buildRedactedRepairFeedback(findings),
      blueprintSummary: preflight.blueprintSummary,
      blueprintFailureCode: preflight.blueprintFailureCode,
      attachments: [],
      textEvidence: [],
    };
  }

  const attachments: AssessmentProviderAttachment[] = [];
  const textEvidence: { id: string; text: string }[] = [];
  let textBudget = PROVIDER_TEXT_TOTAL;
  for (const receipt of input.receipts) {
    const bytes = bytesById.get(receipt.id);
    if (!bytes) continue;
    if (receipt.inspectedMimeType === "image/png") {
      attachments.push({
        id: evidenceId(receipt),
        kind: "image",
        mediaType: "image/png",
        dataBase64: Buffer.from(bytes).toString("base64"),
      });
    } else if (receipt.inspectedMimeType === "image/jpeg") {
      attachments.push({
        id: evidenceId(receipt),
        kind: "image",
        mediaType: "image/jpeg",
        dataBase64: Buffer.from(bytes).toString("base64"),
      });
    } else if (receipt.inspectedMimeType === "application/pdf") {
      attachments.push({
        id: evidenceId(receipt),
        kind: "pdf",
        dataBase64: Buffer.from(bytes).toString("base64"),
      });
    } else if (isBlueprint(receipt) || isTextMime(receipt.inspectedMimeType)) {
      const decoded = decodedTextById.get(receipt.id);
      if (decoded === undefined) continue;
      const take = Math.min(PROVIDER_TEXT_PER_ROLE, textBudget, decoded.length);
      textEvidence.push({
        id: evidenceId(receipt),
        text:
          take < decoded.length
            ? `${decoded.slice(0, take)}\n[truncated by evidence context cap]`
            : decoded,
      });
      textBudget -= take;
    }
  }

  return {
    safeForProvider: true,
    findings,
    quarantinedEvidenceIds: [],
    repairFeedback: null,
    blueprintSummary: preflight.blueprintSummary,
    blueprintFailureCode: preflight.blueprintFailureCode,
    attachments,
    textEvidence,
  };
}
