import { parseMakeBlueprint } from "./make-blueprint";
import type { MakeBlueprintFailureCode } from "./make-blueprint";
import {
  buildRedactedRepairFeedback,
  scanSensitiveText,
  type SensitiveFinding,
} from "./sensitive-data";

export type OcrEvidence = (
  bytes: Uint8Array,
  role: string,
  mimeType: string,
) => Promise<string | null>;

export type WorkflowPreflightResult = {
  safeForProvider: boolean;
  findings: SensitiveFinding[];
  quarantinedRoles: string[];
  repairFeedback: string | null;
  blueprintSummary: { moduleCount: number; moduleNames: string[]; hasMetadata: boolean } | null;
  blueprintFailureCode: MakeBlueprintFailureCode | null;
};

export async function preflightWorkflowEvidence(args: {
  /** Absent for formative/revised visual-only workflow-design evidence. */
  blueprint?: Uint8Array;
  blueprintRole?: string;
  textRoles: { role: string; text: string }[];
  imageRoles: { role: string; bytes: Uint8Array; mimeType?: string }[];
  ocr: OcrEvidence;
}): Promise<WorkflowPreflightResult> {
  const findings: SensitiveFinding[] = [];
  let blueprintSummary: WorkflowPreflightResult["blueprintSummary"] = null;
  let blueprintFailureCode: MakeBlueprintFailureCode | null = null;
  if (args.blueprint) {
    const blueprintRole = args.blueprintRole ?? "blueprintFile";
    const blueprint = parseMakeBlueprint(args.blueprint);
    if (!blueprint.ok) {
      blueprintFailureCode = blueprint.reasonCode;
      findings.push({ detector: "blueprint-invalid", role: blueprintRole, offset: 0 });
    } else {
      blueprintSummary = blueprint.summary;
      findings.push(
        ...scanSensitiveText(Buffer.from(args.blueprint).toString("utf8"), blueprintRole),
      );
    }
  }

  for (const item of args.textRoles) findings.push(...scanSensitiveText(item.text, item.role));

  for (const item of args.imageRoles) {
    let text: string | null = null;
    try {
      text = await args.ocr(item.bytes, item.role, item.mimeType ?? "image/png");
    } catch {
      text = null;
    }
    if (text === null || (item.bytes.byteLength > 0 && text.trim().length === 0)) {
      findings.push({ detector: "image-unreadable", role: item.role, offset: 0 });
    } else {
      findings.push(...scanSensitiveText(text, item.role));
    }
  }

  const quarantinedRoles = [...new Set(findings.map((finding) => finding.role))];
  return {
    safeForProvider: findings.length === 0,
    findings,
    quarantinedRoles,
    repairFeedback: findings.length > 0 ? buildRedactedRepairFeedback(findings) : null,
    blueprintSummary,
    blueprintFailureCode,
  };
}
