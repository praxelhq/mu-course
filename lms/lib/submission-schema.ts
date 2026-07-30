// AssignmentType.submissionSchema and AssessmentVersion.publicSchema both use
// this data-defined contract. This is the only module that interprets field
// definitions, so forms, drafts, uploads and final submission validation cannot
// drift from one another.

export type FieldKind =
  | "link"
  | "text"
  | "writeup"
  | "file"
  | "files"
  | "number"
  | "singleChoice"
  | "multiChoice";

export type SubmissionOption = { value: string; label: string };

export interface SubmissionFieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  helpText?: string;
  unit?: string;
  options?: SubmissionOption[];
  min?: number;
  max?: number;
  integer?: boolean;
  minLength?: number;
  maxLength?: number;
  minWords?: number;
  maxWords?: number;
  /** Field becomes required starting with this learner-visible version. */
  requiredFromVersion?: number;
  /** Optional URL constraints; absent means the legacy http(s) contract. */
  httpsOnly?: boolean;
  allowedHosts?: string[];
  pathKind?: "github-repository";
  minSelections?: number;
  maxSelections?: number;
  acceptedMimeTypes?: string[];
  maxBytes?: number;
  /** When true, maxBytes is an exclusive ceiling (Make blueprints: <2 MB). */
  maxBytesExclusive?: boolean;
  fileRole?: string;
  publishable?: boolean;
  exportable?: boolean;
}

export interface SubmissionSchema {
  fields: SubmissionFieldDef[];
  /** Each group requires at least one non-empty member on final validation. */
  anyOf?: string[][];
}

const KINDS: FieldKind[] = [
  "link",
  "text",
  "writeup",
  "file",
  "files",
  "number",
  "singleChoice",
  "multiChoice",
];

const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function optionalBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "boolean" ? value : null;
}

function optionalFinite(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalNonNegativeInt(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function parseOptions(value: unknown): SubmissionOption[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) return null;
  const options: SubmissionOption[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    let option: SubmissionOption;
    if (typeof raw === "string" && raw.trim()) {
      option = { value: raw, label: raw };
    } else if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const { value: optionValue, label } = raw as Record<string, unknown>;
      if (
        typeof optionValue !== "string" ||
        optionValue.length === 0 ||
        typeof label !== "string" ||
        label.length === 0
      ) {
        return null;
      }
      option = { value: optionValue, label };
    } else {
      return null;
    }
    if (seen.has(option.value)) return null;
    seen.add(option.value);
    options.push(option);
  }
  return options;
}

function parseMimeTypes(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) return null;
  const types: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string" || !MIME.test(raw)) return null;
    const normalized = raw.toLowerCase();
    if (seen.has(normalized)) return null;
    seen.add(normalized);
    types.push(normalized);
  }
  return types;
}

function parseAllowedHosts(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return null;
  const hosts: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string" || raw !== raw.trim() || raw !== raw.toLowerCase()) return null;
    if (raw.includes("*") || raw.endsWith(".")) return null;
    try {
      const parsed = new URL(`https://${raw}`);
      if (parsed.hostname !== raw || parsed.host !== raw || parsed.pathname !== "/") return null;
    } catch {
      return null;
    }
    if (seen.has(raw)) return null;
    seen.add(raw);
    hosts.push(raw);
  }
  return hosts;
}

function parsePathKind(value: unknown): SubmissionFieldDef["pathKind"] | undefined | null {
  if (value === undefined) return undefined;
  return value === "github-repository" ? value : null;
}

/** Parse a stored public submission schema. Null means fail closed. */
export function parseSubmissionSchema(json: unknown): SubmissionSchema | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const record = json as Record<string, unknown>;
  if (!Array.isArray(record.fields)) return null;

  const fields: SubmissionFieldDef[] = [];
  const keys = new Set<string>();
  for (const rawField of record.fields) {
    if (typeof rawField !== "object" || rawField === null || Array.isArray(rawField)) return null;
    const raw = rawField as Record<string, unknown>;
    const { key, label, kind, required } = raw;
    if (typeof key !== "string" || !FIELD_KEY.test(key) || keys.has(key)) return null;
    if (typeof label !== "string" || label.trim().length === 0) return null;
    if (typeof kind !== "string" || !KINDS.includes(kind as FieldKind)) return null;
    if (typeof required !== "boolean") return null;

    const helpText = optionalString(raw.helpText);
    const unit = optionalString(raw.unit);
    const options = parseOptions(raw.options);
    const min = optionalFinite(raw.min);
    const max = optionalFinite(raw.max);
    const integer = optionalBoolean(raw.integer);
    const minLength = optionalNonNegativeInt(raw.minLength);
    const maxLength = optionalNonNegativeInt(raw.maxLength);
    const minWords = optionalNonNegativeInt(raw.minWords);
    const maxWords = optionalNonNegativeInt(raw.maxWords);
    const requiredFromVersion = optionalNonNegativeInt(raw.requiredFromVersion);
    const httpsOnly = optionalBoolean(raw.httpsOnly);
    const allowedHosts = parseAllowedHosts(raw.allowedHosts);
    const pathKind = parsePathKind(raw.pathKind);
    const minSelections = optionalNonNegativeInt(raw.minSelections);
    const maxSelections = optionalNonNegativeInt(raw.maxSelections);
    const acceptedMimeTypes = parseMimeTypes(raw.acceptedMimeTypes);
    const maxBytes = optionalNonNegativeInt(raw.maxBytes);
    const maxBytesExclusive = optionalBoolean(raw.maxBytesExclusive);
    const fileRole = optionalString(raw.fileRole);
    const publishable = optionalBoolean(raw.publishable);
    const exportable = optionalBoolean(raw.exportable);

    // Spell the checks out so TypeScript narrows every parsed value from
    // `T | undefined | null` to `T | undefined` for the object below.
    if (
      helpText === null ||
      unit === null ||
      options === null ||
      min === null ||
      max === null ||
      integer === null ||
      minLength === null ||
      maxLength === null ||
      minWords === null ||
      maxWords === null ||
      requiredFromVersion === null ||
      httpsOnly === null ||
      allowedHosts === null ||
      pathKind === null ||
      minSelections === null ||
      maxSelections === null ||
      acceptedMimeTypes === null ||
      maxBytes === null ||
      maxBytesExclusive === null ||
      fileRole === null ||
      publishable === null ||
      exportable === null
    ) {
      return null;
    }

    const fieldKind = kind as FieldKind;
    const isChoice = fieldKind === "singleChoice" || fieldKind === "multiChoice";
    const isFile = fieldKind === "file" || fieldKind === "files";
    if (isChoice !== (options !== undefined)) return null;
    if (min !== undefined && max !== undefined && min > max) return null;
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) return null;
    if (minWords !== undefined && maxWords !== undefined && minWords > maxWords) return null;
    if (
      minWords !== undefined &&
      fieldKind !== "text" &&
      fieldKind !== "writeup"
    ) return null;
    if (
      maxWords !== undefined &&
      fieldKind !== "text" &&
      fieldKind !== "writeup"
    ) return null;
    if ((minWords ?? 0) > 100_000 || (maxWords ?? 0) > 100_000) return null;
    if (requiredFromVersion !== undefined && (requiredFromVersion < 1 || requiredFromVersion > 1_000)) {
      return null;
    }
    if (required && requiredFromVersion !== undefined) return null;
    if (
      (httpsOnly !== undefined || allowedHosts !== undefined || pathKind !== undefined) &&
      fieldKind !== "link"
    ) return null;
    if (
      pathKind === "github-repository" &&
      (httpsOnly !== true ||
        allowedHosts?.length !== 1 ||
        allowedHosts[0] !== "github.com")
    ) return null;
    if (
      minSelections !== undefined &&
      maxSelections !== undefined &&
      minSelections > maxSelections
    ) {
      return null;
    }
    if (maxBytes !== undefined && maxBytes <= 0) return null;
    if ((acceptedMimeTypes !== undefined || maxBytes !== undefined || fileRole !== undefined) && !isFile) {
      return null;
    }
    if (maxBytesExclusive && maxBytes === undefined) return null;

    const field: SubmissionFieldDef = {
      key,
      label,
      kind: fieldKind,
      required,
      ...(helpText !== undefined ? { helpText } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(integer !== undefined ? { integer } : {}),
      ...(minLength !== undefined ? { minLength } : {}),
      ...(maxLength !== undefined ? { maxLength } : {}),
      ...(minWords !== undefined ? { minWords } : {}),
      ...(maxWords !== undefined ? { maxWords } : {}),
      ...(requiredFromVersion !== undefined ? { requiredFromVersion } : {}),
      ...(httpsOnly !== undefined ? { httpsOnly } : {}),
      ...(allowedHosts !== undefined ? { allowedHosts } : {}),
      ...(pathKind !== undefined ? { pathKind } : {}),
      ...(minSelections !== undefined ? { minSelections } : {}),
      ...(maxSelections !== undefined ? { maxSelections } : {}),
      ...(acceptedMimeTypes !== undefined ? { acceptedMimeTypes } : {}),
      ...(maxBytes !== undefined ? { maxBytes } : {}),
      ...(maxBytesExclusive !== undefined ? { maxBytesExclusive } : {}),
      ...(fileRole !== undefined ? { fileRole } : {}),
      ...(publishable !== undefined ? { publishable } : {}),
      ...(exportable !== undefined ? { exportable } : {}),
    };
    keys.add(key);
    fields.push(field);
  }

  let anyOf: string[][] | undefined;
  if (record.anyOf !== undefined) {
    if (!Array.isArray(record.anyOf) || record.anyOf.length === 0) return null;
    anyOf = [];
    for (const rawGroup of record.anyOf) {
      if (!Array.isArray(rawGroup) || rawGroup.length < 2) return null;
      const group: string[] = [];
      const groupKeys = new Set<string>();
      for (const rawKey of rawGroup) {
        if (typeof rawKey !== "string" || !keys.has(rawKey) || groupKeys.has(rawKey)) return null;
        groupKeys.add(rawKey);
        group.push(rawKey);
      }
      anyOf.push(group);
    }
  }

  return { fields, ...(anyOf ? { anyOf } : {}) };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export type SubmissionValidationOptions = {
  /** Drafts validate only values already present; required/anyOf wait for final submit. */
  partial?: boolean;
  /** Bound learner-visible submission version for conditional requirements. */
  submissionVersion?: number;
};

export function submissionValuePresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

function validGitHubRepositoryPath(url: URL): boolean {
  if (url.search || url.hash) return false;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return false;
  const [owner, repository] = segments;
  return (
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) &&
    /^[A-Za-z0-9._-]{1,100}$/.test(repository) &&
    !repository.toLowerCase().endsWith(".git")
  );
}

function validateLink(def: SubmissionFieldDef, value: unknown, errors: string[]): value is string {
  const url = parseHttpUrl(value);
  if (!url) {
    errors.push(`field "${def.key}" must be an http(s) URL`);
    return false;
  }
  if (url.username || url.password) {
    errors.push(`field "${def.key}" URL must not contain credentials`);
  }
  if (def.httpsOnly && url.protocol !== "https:") {
    errors.push(`field "${def.key}" must use https`);
  }
  if (def.allowedHosts && !def.allowedHosts.includes(url.hostname.toLowerCase())) {
    errors.push(`field "${def.key}" must use an allowed host`);
  }
  if (def.pathKind === "github-repository" && !validGitHubRepositoryPath(url)) {
    errors.push(`field "${def.key}" must be a GitHub repository root URL`);
  }
  return true;
}

function validateStringLength(
  def: SubmissionFieldDef,
  value: string,
  errors: string[],
  partial: boolean,
): void {
  if (def.minLength !== undefined && value.length < def.minLength) {
    errors.push(`field "${def.key}" must contain at least ${def.minLength} characters`);
  }
  if (def.maxLength !== undefined && value.length > def.maxLength) {
    errors.push(`field "${def.key}" must contain at most ${def.maxLength} characters`);
  }
  const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0;
  if (!partial && def.minWords !== undefined && wordCount < def.minWords) {
    errors.push(`field "${def.key}" must contain at least ${def.minWords} words`);
  }
  if (def.maxWords !== undefined && wordCount > def.maxWords) {
    errors.push(`field "${def.key}" must contain at most ${def.maxWords} words`);
  }
}

/** Validate Submission.fields against one frozen public schema. */
export function validateSubmissionFields(
  schema: SubmissionSchema,
  fields: unknown,
  options: SubmissionValidationOptions = {},
): ValidationResult {
  const errors: string[] = [];
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    return { ok: false, errors: ["fields must be a JSON object"] };
  }
  const obj = fields as Record<string, unknown>;
  const known = new Set(schema.fields.map((field) => field.key));
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) errors.push(`unknown field "${key}"`);
  }

  for (const def of schema.fields) {
    const value = obj[def.key];
    const effectiveRequired =
      def.required ||
      (def.requiredFromVersion !== undefined &&
        options.submissionVersion !== undefined &&
        options.submissionVersion >= def.requiredFromVersion);
    if (!submissionValuePresent(value)) {
      if (effectiveRequired && !options.partial) errors.push(`missing required field "${def.key}"`);
      continue;
    }

    switch (def.kind) {
      case "link":
        if (validateLink(def, value, errors)) {
          validateStringLength(def, value, errors, Boolean(options.partial));
        }
        break;
      case "text":
      case "writeup":
      case "file":
        if (typeof value !== "string" || value.trim().length === 0) {
          errors.push(`field "${def.key}" must be a string`);
        } else {
          validateStringLength(def, value, errors, Boolean(options.partial));
        }
        break;
      case "files":
        if (
          !Array.isArray(value) ||
          !value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
        ) {
          errors.push(`field "${def.key}" must be an array of strings`);
        }
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`field "${def.key}" must be a finite number`);
          break;
        }
        if (def.integer && !Number.isInteger(value)) {
          errors.push(`field "${def.key}" must be an integer`);
        }
        if (def.min !== undefined && value < def.min) {
          errors.push(`field "${def.key}" must be at least ${def.min}`);
        }
        if (def.max !== undefined && value > def.max) {
          errors.push(`field "${def.key}" must be at most ${def.max}`);
        }
        break;
      case "singleChoice": {
        const declared = new Set((def.options ?? []).map((option) => option.value));
        if (typeof value !== "string" || !declared.has(value)) {
          errors.push(`field "${def.key}" must be one declared option`);
        }
        break;
      }
      case "multiChoice": {
        const declared = new Set((def.options ?? []).map((option) => option.value));
        if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
          errors.push(`field "${def.key}" must be an array of declared options`);
          break;
        }
        const values = value as string[];
        if (new Set(values).size !== values.length) {
          errors.push(`field "${def.key}" must not contain duplicate options`);
        }
        if (values.some((entry) => !declared.has(entry))) {
          errors.push(`field "${def.key}" contains an undeclared option`);
        }
        if (def.minSelections !== undefined && values.length < def.minSelections) {
          errors.push(`field "${def.key}" requires at least ${def.minSelections} selections`);
        }
        if (def.maxSelections !== undefined && values.length > def.maxSelections) {
          errors.push(`field "${def.key}" allows at most ${def.maxSelections} selections`);
        }
        break;
      }
    }
  }

  if (!options.partial) {
    for (const group of schema.anyOf ?? []) {
      if (!group.some((key) => submissionValuePresent(obj[key]))) {
        errors.push(`one of ${group.map((key) => `"${key}"`).join(", ")} is required`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
