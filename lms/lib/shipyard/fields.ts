// The submit-form field contract. A checkpoint's `fieldSchema` column holds an
// array of these, so adding a field to a checkpoint is a row edit rather than
// a deploy. This module is the only place the contract is interpreted, so the
// form, the draft, and final validation cannot drift apart.

import { z } from "zod";

export const FIELD_KINDS = [
  "text",
  "textarea",
  "url",
  "number",
  "files",
  "images",
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

export const fieldSpecSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(FIELD_KINDS),
  required: z.boolean(),
  help: z.string().optional(),
  /** Upload kinds only: the ceiling the form enforces. */
  maxFiles: z.number().int().positive().optional(),
  /** Upload kinds only: accepted MIME types or extensions. */
  accept: z.array(z.string().min(1)).optional(),
  /** Upload kinds only: the floor a submission must meet. */
  minFiles: z.number().int().nonnegative().optional(),
});

export type FieldSpec = z.infer<typeof fieldSpecSchema>;

export const fieldSpecListSchema = z.array(fieldSpecSchema);

/** Parse a checkpoint's stored `fieldSchema`. Returns null when malformed. */
export function parseFieldSpecs(value: unknown): FieldSpec[] | null {
  const parsed = fieldSpecListSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type SubmissionFieldValue = string | number | string[] | null | undefined;
export type SubmissionFields = Record<string, SubmissionFieldValue>;

export type FieldValidationResult =
  | { ok: true; values: SubmissionFields }
  | { ok: false; errors: string[] };

/** http(s) only, and a hostname with a dot — a bare "localhost" is not live. */
function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.hostname.includes(".") && !url.hostname.endsWith(".");
}

function isBlank(value: SubmissionFieldValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Validate a student's answers against one checkpoint's field spec.
 * Unknown keys are an error: a form that sends a key the checkpoint does not
 * declare is out of date, and silently dropping it loses the student's work.
 */
export function validateSubmissionFields(
  spec: FieldSpec[],
  fields: unknown,
): FieldValidationResult {
  const errors: string[] = [];
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    return { ok: false, errors: ["fields must be an object"] };
  }
  const raw = fields as Record<string, unknown>;
  const known = new Set(spec.map((f) => f.key));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) errors.push(`${key}: not a field of this checkpoint`);
  }

  const values: SubmissionFields = {};
  for (const field of spec) {
    const value = raw[field.key] as SubmissionFieldValue;
    if (isBlank(value)) {
      if (field.required) errors.push(`${field.key}: ${field.label} is required`);
      continue;
    }

    switch (field.kind) {
      case "text":
      case "textarea": {
        if (typeof value !== "string") {
          errors.push(`${field.key}: expected text`);
          continue;
        }
        values[field.key] = value.trim();
        break;
      }
      case "url": {
        if (typeof value !== "string" || !isPublicHttpUrl(value.trim())) {
          errors.push(`${field.key}: expected a public http(s) URL`);
          continue;
        }
        values[field.key] = value.trim();
        break;
      }
      case "number": {
        const num = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(num)) {
          errors.push(`${field.key}: expected a number`);
          continue;
        }
        values[field.key] = num;
        break;
      }
      case "files":
      case "images": {
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
          errors.push(`${field.key}: expected a list of uploaded file keys`);
          continue;
        }
        const keys = value.filter((v) => v.trim() !== "");
        if (field.maxFiles !== undefined && keys.length > field.maxFiles) {
          errors.push(`${field.key}: at most ${field.maxFiles} files`);
          continue;
        }
        if (field.minFiles !== undefined && keys.length < field.minFiles) {
          errors.push(`${field.key}: at least ${field.minFiles} files`);
          continue;
        }
        values[field.key] = keys;
        break;
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}
