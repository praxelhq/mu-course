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

/** 200 text/csv attachment response — shared by every export route. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** A numeric field out of a JSON object cell, or "" for a blank CSV cell. */
export function numberField(json: unknown, key: string): number | "" {
  if (!json || typeof json !== "object" || Array.isArray(json)) return "";
  const v = (json as Record<string, unknown>)[key];
  return typeof v === "number" ? v : "";
}
