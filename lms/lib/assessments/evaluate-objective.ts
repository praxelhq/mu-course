import type {
  NumberAnswerSpec,
  NumericResponse,
  ObjectiveAnswerSpec,
  ObjectiveItemResult,
  ObjectiveSetResult,
  SetAnswerSpec,
  StringAnswerSpec,
} from "./types";

const FLOAT_EPSILON = 1e-12;

function result(
  itemId: string,
  status: ObjectiveItemResult["status"],
  reasonCode: ObjectiveItemResult["reasonCode"],
  normalizedResponse?: ObjectiveItemResult["normalizedResponse"],
): ObjectiveItemResult {
  return {
    itemId,
    status,
    reasonCode,
    ...(normalizedResponse === undefined ? {} : { normalizedResponse }),
  };
}

function unitKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function parseNumericResponse(
  input: unknown,
): { ok: true; value: number; unit?: string } | { ok: false; reason: "not_numeric" | "not_finite" } {
  let raw: unknown = input;
  let declaredUnit: string | undefined;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const obj = input as { value?: unknown; unit?: unknown };
    raw = obj.value;
    if (typeof obj.unit === "string" && obj.unit.trim()) declaredUnit = obj.unit.trim();
  }

  let value: number;
  let inferredUnit: string | undefined;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { ok: false, reason: "not_numeric" };
    if (text.includes("%")) inferredUnit = "percent";
    if (/\busd\b/i.test(text) || /[$]/.test(text)) inferredUnit = "USD";
    const cleaned = text.replace(/,/g, "").replace(/\busd\b/gi, "").replace(/[$%]/g, "").trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) {
      return { ok: false, reason: "not_numeric" };
    }
    value = Number(cleaned);
  } else {
    return { ok: false, reason: "not_numeric" };
  }

  if (!Number.isFinite(value)) return { ok: false, reason: "not_finite" };
  return { ok: true, value, unit: declaredUnit ?? inferredUnit };
}

function canonicalNumber(
  spec: NumberAnswerSpec,
  response: NumericResponse,
): { ok: true; value: number } | { ok: false; reason: ObjectiveItemResult["reasonCode"] } {
  const parsed = parseNumericResponse(response);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  let value = parsed.value;
  if (parsed.unit) {
    const submitted = unitKey(parsed.unit);
    const multipliers = Object.fromEntries(
      Object.entries(spec.acceptedUnits ?? {}).map(([key, multiplier]) => [unitKey(key), multiplier]),
    );
    if (Object.keys(multipliers).length > 0) {
      const multiplier = multipliers[submitted];
      if (multiplier === undefined) return { ok: false, reason: "unit_not_allowed" };
      value *= multiplier;
    } else if (spec.unit) {
      const canonical = unitKey(spec.unit);
      const implicitAliases = new Set<string>([canonical]);
      if (canonical === "percentage-points") implicitAliases.add("percent");
      if (canonical === "usd") implicitAliases.add("usd");
      if (!implicitAliases.has(submitted)) return { ok: false, reason: "unit_not_allowed" };
    }
  }

  if (spec.integer && !Number.isInteger(value)) {
    return { ok: false, reason: "integer_required" };
  }
  return { ok: true, value };
}

function roundHalfAwayFromZero(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded / factor;
}

function evaluateNumber(
  itemId: string,
  spec: NumberAnswerSpec,
  response: unknown,
): ObjectiveItemResult {
  const parsed = canonicalNumber(spec, response as NumericResponse);
  if (!parsed.ok) return result(itemId, "invalid", parsed.reason);

  let matches = false;
  if (spec.mode === "exact") {
    matches = Object.is(parsed.value, spec.expected) || parsed.value === spec.expected;
  } else if (spec.mode === "tolerance") {
    const tolerance = spec.tolerance ?? 0;
    matches = Math.abs(parsed.value - spec.expected) <= tolerance + FLOAT_EPSILON;
  } else {
    const decimals = spec.decimals ?? 0;
    matches =
      roundHalfAwayFromZero(parsed.value, decimals) ===
      roundHalfAwayFromZero(spec.expected, decimals);
  }
  return result(itemId, matches ? "correct" : "incorrect", matches ? "match" : "mismatch", parsed.value);
}

function normalizeString(
  value: string,
  options: Pick<StringAnswerSpec, "trim" | "caseInsensitive">,
): string {
  let normalized = options.trim === false ? value : value.trim();
  if (options.caseInsensitive) normalized = normalized.toLocaleLowerCase("en-US");
  return normalized;
}

function evaluateString(
  itemId: string,
  spec: StringAnswerSpec,
  response: unknown,
): ObjectiveItemResult {
  if (typeof response !== "string") return result(itemId, "invalid", "not_a_string");
  const normalized = normalizeString(response, spec);
  const accepted = [spec.expected, ...(spec.alternatives ?? [])].map((value) =>
    normalizeString(value, spec),
  );
  const matches = accepted.includes(normalized);
  return result(itemId, matches ? "correct" : "incorrect", matches ? "match" : "mismatch", normalized);
}

function normalizeSetValue(value: string, spec: SetAnswerSpec): string {
  return normalizeString(value, spec);
}

function evaluateSet(
  itemId: string,
  spec: SetAnswerSpec,
  response: unknown,
): ObjectiveItemResult {
  if (!Array.isArray(response) || !response.every((value) => typeof value === "string")) {
    return result(itemId, "invalid", "not_a_set");
  }
  const normalized = response.map((value) => normalizeSetValue(value, spec));
  if (new Set(normalized).size !== normalized.length) {
    return result(itemId, "invalid", "duplicate_choice", normalized);
  }
  const allowed = (spec.allowed ?? spec.expected).map((value) => normalizeSetValue(value, spec));
  if (normalized.some((value) => !allowed.includes(value))) {
    return result(itemId, "invalid", "choice_not_allowed", normalized);
  }
  const expected = spec.expected.map((value) => normalizeSetValue(value, spec)).sort();
  const actual = [...normalized].sort();
  const matches = expected.length === actual.length && expected.every((value, i) => value === actual[i]);
  return result(itemId, matches ? "correct" : "incorrect", matches ? "match" : "mismatch", normalized);
}

export function evaluateObjectiveItem(
  itemId: string,
  spec: ObjectiveAnswerSpec,
  response: unknown,
): ObjectiveItemResult {
  if (response === undefined || response === null || response === "") {
    return result(itemId, "missing", "missing");
  }
  if (spec.kind === "number") return evaluateNumber(itemId, spec, response);
  if (spec.kind === "string") return evaluateString(itemId, spec, response);
  return evaluateSet(itemId, spec, response);
}

export function evaluateObjectiveSet(
  specs: Record<string, ObjectiveAnswerSpec>,
  responses: Record<string, unknown>,
): ObjectiveSetResult {
  const items = Object.fromEntries(
    Object.entries(specs).map(([itemId, spec]) => [
      itemId,
      evaluateObjectiveItem(itemId, spec, responses[itemId]),
    ]),
  );
  const entries = Object.entries(items);
  const totalWeight = Object.values(specs).reduce((sum, spec) => sum + (spec.weight ?? 1), 0);
  const correctWeight = entries.reduce(
    (sum, [itemId, item]) =>
      sum + (item.status === "correct" ? (specs[itemId]?.weight ?? 1) : 0),
    0,
  );
  return {
    items,
    correctCount: entries.filter(([, item]) => item.status === "correct").length,
    totalCount: entries.length,
    correctWeight,
    totalWeight,
  };
}
