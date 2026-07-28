// Submission-schema validator. AssignmentType.submissionSchema rows store a
// JSON field-definition list; this module is the single place that interprets
// it. Later units (submission forms, grading) reuse these types + validator.

export type FieldKind = "link" | "text" | "writeup" | "file" | "files";

export interface SubmissionFieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
}

export interface SubmissionSchema {
  fields: SubmissionFieldDef[];
}

const KINDS: FieldKind[] = ["link", "text", "writeup", "file", "files"];

/** Parse an AssignmentType.submissionSchema JSON value. Null when malformed. */
export function parseSubmissionSchema(json: unknown): SubmissionSchema | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const fields = (json as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return null;
  const out: SubmissionFieldDef[] = [];
  for (const f of fields) {
    if (typeof f !== "object" || f === null) return null;
    const { key, label, kind, required } = f as Record<string, unknown>;
    if (typeof key !== "string" || key.length === 0) return null;
    if (typeof label !== "string") return null;
    if (typeof kind !== "string" || !KINDS.includes(kind as FieldKind)) return null;
    if (typeof required !== "boolean") return null;
    out.push({ key, label, kind: kind as FieldKind, required });
  }
  return { fields: out };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isHttpUrl(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\/\S+$/.test(v);
}

/**
 * Validate a Submission.fields JSON value against a submission schema.
 * - required fields must be present and non-empty
 * - link fields must be http(s) URLs
 * - text/writeup/file fields must be strings (file = S3 key)
 * - files fields must be arrays of strings
 * - unknown keys are rejected (keeps forms honest)
 */
export function validateSubmissionFields(
  schema: SubmissionSchema,
  fields: unknown,
): ValidationResult {
  const errors: string[] = [];
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    return { ok: false, errors: ["fields must be a JSON object"] };
  }
  const obj = fields as Record<string, unknown>;
  const known = new Set(schema.fields.map((f) => f.key));
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) errors.push(`unknown field "${key}"`);
  }
  for (const def of schema.fields) {
    const value = obj[def.key];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (missing) {
      if (def.required) errors.push(`missing required field "${def.key}"`);
      continue;
    }
    switch (def.kind) {
      case "link":
        if (!isHttpUrl(value)) errors.push(`field "${def.key}" must be an http(s) URL`);
        break;
      case "text":
      case "writeup":
      case "file":
        if (!isNonEmptyString(value)) errors.push(`field "${def.key}" must be a string`);
        break;
      case "files":
        if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
          errors.push(`field "${def.key}" must be an array of strings`);
        }
        break;
    }
  }
  return { ok: errors.length === 0, errors };
}
