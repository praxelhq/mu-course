import { parseLine } from "./csv-preview";

// Tiny roster CSV parser (name,email,section) — no dependency. Used by the
// admin roster import endpoint and by the seed's fixture writer's tests.
// Line splitting reuses lib/csv-preview's quote-aware parseLine, so quoted
// cells (including embedded commas) parse correctly.

export interface RosterRow {
  name: string;
  email: string;
  section: string;
}

export interface InvalidRosterRow {
  line: number; // 1-based line number in the input
  raw: string;
  reason: string;
}

export interface RosterParseResult {
  rows: RosterRow[];
  invalid: InvalidRosterRow[];
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/**
 * Parse a roster CSV: `name,email,section` per line, optional header row.
 * Rows with a bad shape, invalid email, unknown section, or an email already
 * seen earlier in the file land in `invalid` with a reason.
 */
export function parseRosterCsv(
  text: string,
  validSections: string[],
): RosterParseResult {
  const sections = new Set(validSections.map((s) => s.toUpperCase()));
  const rows: RosterRow[] = [];
  const invalid: InvalidRosterRow[] = [];
  const seenEmails = new Set<string>();

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (line === "") return;
    const lineNo = idx + 1;
    const parts = parseLine(line).map((p) => p.trim());
    // Header row: skip wherever it appears first.
    if (
      parts.length >= 2 &&
      parts[0].toLowerCase() === "name" &&
      parts[1].toLowerCase() === "email"
    ) {
      return;
    }
    if (parts.length !== 3) {
      invalid.push({ line: lineNo, raw: line, reason: "expected 3 columns (name,email,section)" });
      return;
    }
    const [name, emailRaw, sectionRaw] = parts;
    const email = emailRaw.toLowerCase();
    const section = sectionRaw.toUpperCase();
    if (name === "") {
      invalid.push({ line: lineNo, raw: line, reason: "empty name" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      invalid.push({ line: lineNo, raw: line, reason: `invalid email "${emailRaw}"` });
      return;
    }
    if (!sections.has(section)) {
      invalid.push({ line: lineNo, raw: line, reason: `unknown section "${sectionRaw}"` });
      return;
    }
    if (seenEmails.has(email)) {
      invalid.push({ line: lineNo, raw: line, reason: `duplicate email in file "${email}"` });
      return;
    }
    seenEmails.add(email);
    rows.push({ name, email, section });
  });

  return { rows, invalid };
}
