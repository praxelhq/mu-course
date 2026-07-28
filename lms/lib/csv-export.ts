// Shared CSV serializer for instructor/admin exports (U8 matrix; U15 reuses
// it for the grade/PCI exports). Neutralizes spreadsheet formula injection:
// any cell beginning with = + - @ (or a tab/CR that could smuggle one) gets a
// leading apostrophe so Excel/Sheets treat it as text.

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function neutralize(cell: string): string {
  return FORMULA_TRIGGER.test(cell) ? `'${cell}` : cell;
}

function escapeCell(raw: unknown): string {
  const cell = neutralize(raw === null || raw === undefined ? "" : String(raw));
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** RFC-4180-style CSV (CRLF rows) with formula-injection neutralization. */
export function toCsv(headers: readonly unknown[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
