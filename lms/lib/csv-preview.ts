// Small CSV preview parser for the material "Peek" feature. Input is the
// first ~256KB of a file (lib/s3 rangedRead), so the last line may be cut
// mid-row — a text chunk without a trailing newline drops its final line and
// reports truncated. Handles quoted fields (commas + doubled quotes); no
// dependency, same spirit as lib/roster-csv.

export const PREVIEW_MAX_ROWS = 100;

export interface CsvPreview {
  headers: string[];
  rows: string[][];
  /** True when rows were cut — by the row cap or by the byte range. */
  truncated: boolean;
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export function parseCsvPreview(text: string, maxRows: number = PREVIEW_MAX_ROWS): CsvPreview {
  // Without a trailing newline the final line may be a partial row from the
  // ranged read — drop it and mark the preview truncated.
  const completeText = /\r?\n$/.test(text);
  const lines = text.split(/\r?\n/).filter((l, i, arr) => !(i === arr.length - 1 && l === ""));
  let truncated = false;
  if (!completeText && lines.length > 0) {
    lines.pop();
    truncated = true;
  }
  if (lines.length === 0) return { headers: [], rows: [], truncated };

  const headers = parseLine(lines[0]);
  const dataLines = lines.slice(1);
  if (dataLines.length > maxRows) truncated = true;
  const rows = dataLines.slice(0, maxRows).map(parseLine);
  return { headers, rows, truncated };
}
