import type { ImportAppRow } from "./service";

// Google Forms headers contain quoted newlines, so split-on-newline is not a
// CSV parser. Parse the supplied export without fetching Drive/private briefs.
export function parseAppReviewCsv(text: string): ImportAppRow[] {
  const records: string[][] = [];
  let record: string[] = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/u, "");
  for (let i = 0; i <= input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n" || char === undefined)) {
      record.push(cell.replace(/\r$/u, "").trim()); cell = "";
      if (char !== ",") { records.push(record); record = []; }
    } else if (char !== undefined) cell += char;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  const headers = records.shift()?.map((header) => header.toLowerCase()) ?? [];
  const email = headers.findIndex((header) => header === "email" || header.includes("email id"));
  const section = headers.findIndex((header) => header.includes("section"));
  const url = headers.findIndex((header) => header === "appurl" || header.includes("hosted web app link"));
  if ([email, section, url].some((i) => i < 0)) throw new Error("Use the Artifacts tab CSV export, or CSV with email,section,appUrl headers.");
  return records.flatMap((row, index) => row.some(Boolean) ? [{ email: row[email] ?? "", section: row[section] ?? "", appUrl: row[url] ?? "", sourceRef: `artifacts-csv:record-${index + 2}`, recordNumber: index + 1 }] : []);
}
