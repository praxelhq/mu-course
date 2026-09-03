import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("tmp/pdfs/session2-presentations");
const sheetId = 262671620;
const start = Number(process.argv[2] || 0);
const count = Number(process.argv[3] || 50);
const all = JSON.parse(await readFile(path.join(root, "combined.json"), "utf8"));
all.sort((a, b) => a.section.localeCompare(b.section) || b.total - a.total || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

const headers = [
  ["Overall Rank", "Rank by the final Total /105 across all 401 submissions."],
  ["Section Rank", "Rank by the final Total /105 within the student's section."],
  ["Section", "Live LMS section at the time of export."],
  ["Name", "Student name from the live submission roster."],
  ["Email", "Student email from the live submission roster."],
  ["Submission ID", "Stable LMS submission identifier."],
  ["Slides", "PDF page count reviewed."],
  ["Insight /10", "Originality, analytical depth, and decision-usefulness. Half-point increments."],
  ["Narrative /10", "Coherent thesis, purposeful sequence, synthesis, and landing. Half-point increments."],
  ["Framing /10", "Audience, question, context, scope, and limitations for a cold reader. Half-point increments."],
  ["Accuracy /10", "Dataset fidelity, calculations, denominators, missingness, sample size, chart honesty, and causal discipline."],
  ["Visual /10", "Hierarchy, legibility, chart choice, annotation, consistency, restraint, and absence of AI slop."],
  ["Bonus /5", "Whole points for rare work beyond the five dimensions; never compensates for a weakness."],
  ["Total /105", "Formula: 2 × sum of the five /10 dimensions + Bonus /5."],
  ["What worked", "One specific instructor observation."],
  ["Fix next time", "One highest-leverage action for the next deck."],
  ["Verdict", "Short plain-spoken summary."],
  ["Flags", "Filterable issue labels. 'exact-file-duplicate' means the submitted PDF bytes matched another submission exactly."],
  ["# Factual errors", "Count of material factual or analytical errors; harmless rounding is excluded."],
  ["Factual error detail", "Brief error specifics, usually with slide references."],
  ["LMS Review", "Stable instructor link to the live LMS submission."],
];

const str = (value) => ({ userEnteredValue: { stringValue: String(value ?? "") } });
const num = (value) => ({ userEnteredValue: { numberValue: Number(value) } });
const formula = (value) => ({ userEnteredValue: { formulaValue: value } });
const headerRow = headers.map(([label, note]) => ({ userEnteredValue: { stringValue: label }, note }));

const rows = all.slice(start, start + count).map((row, offset) => {
  const sheetRow = start + offset + 2;
  return [
    formula(`=RANK.EQ(N${sheetRow},$N$2:$N$402,0)`),
    formula(`=RANK.EQ(N${sheetRow},FILTER($N$2:$N$402,$C$2:$C$402=C${sheetRow}),0)`),
    str(row.section),
    str(row.name),
    str(row.email),
    str(row.submissionId),
    num(row.pages),
    num(row.scores.insight),
    num(row.scores.narrative),
    num(row.scores.framing),
    num(row.scores.accuracy),
    num(row.scores.visual),
    num(row.scores.bonus),
    formula(`=2*SUM(H${sheetRow}:L${sheetRow})+M${sheetRow}`),
    str(row.what_worked),
    str(row.fix_next),
    str(row.verdict),
    str((row.flags || []).join(", ")),
    num(row.factual_error_count),
    str(row.factual_error_detail),
    formula(`=HYPERLINK("https://lms.praxel.in/instructor/submissions/${row.submissionId}","Open")`),
  ];
});

const payloadRows = [];
let rowIndex = start + 1;
if (start === 0) {
  payloadRows.push({ values: headerRow });
  rowIndex = 0;
}
for (const values of rows) payloadRows.push({ values });

process.stdout.write(JSON.stringify({
  requests: [{
    updateCells: {
      start: { sheetId, rowIndex, columnIndex: 0 },
      rows: payloadRows,
      fields: "userEnteredValue,note",
    },
  }],
}));
