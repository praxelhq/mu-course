#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const OUTPUT_DIR = path.join(ROOT, "lms/output/session-03");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "session-03-formula-pivot-planner.xlsx");
const VALIDATION_PATH = path.join(OUTPUT_DIR, "session-03-workbook-validation.json");
const PREVIEW_DIR = process.env.WORKBOOK_PREVIEW_DIR || "/tmp/mu-s3-workbook-previews";
const SCHEMA_PATH = path.join(
  ROOT,
  "lms/private/course-data/session-03/generated/v1/trustmrr_s3_schema_v1.json",
);
const MANIFEST_PATH = path.join(
  ROOT,
  "lms/private/course-data/session-03/generated/v1/trustmrr_s3_manifest_v1.json",
);
const DATA_DICTIONARY_PATH = path.join(ROOT, "lms/course/session-03/data-dictionary.md");
const SPREADSHEET_PATHWAY_PATH = path.join(ROOT, "lms/course/session-03/spreadsheet-pathway.md");

const PALETTE = {
  parchment: "#FBF8F3",
  ink: "#1F1A14",
  pine: "#1E3A35",
  ochre: "#C4581A",
  sand: "#EDE5D8",
  white: "#FFFFFF",
  paleOchre: "#F8E6D8",
  palePine: "#E4ECE9",
};

const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8"));
const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
const learnerSchema = schema.datasets["trustmrr_s3_learner_v1.csv"];
const fields = learnerSchema.fields;
if (fields.length !== 29) {
  throw new Error(`Expected 29 learner fields, found ${fields.length}`);
}

const workbook = Workbook.create();
const readme = workbook.worksheets.add("README");
const analysis = workbook.worksheets.add("Analysis");
const pivot = workbook.worksheets.add("Pivot Plan");
const startups = workbook.worksheets.add("startups");
const schemaSheet = workbook.worksheets.add("Schema");

function titleStyle(range) {
  range.format = {
    fill: PALETTE.pine,
    font: { name: "Fraunces", size: 18, bold: true, color: PALETTE.white },
    verticalAlignment: "center",
    wrapText: false,
  };
  range.format.rowHeightPx = 36;
}

function sectionStyle(range) {
  range.format = {
    fill: PALETTE.sand,
    font: { name: "Geist", size: 11, bold: true, color: PALETTE.ink },
    verticalAlignment: "center",
  };
  range.format.borders = { preset: "outside", style: "thin", color: PALETTE.ochre };
}

function headerStyle(range) {
  range.format = {
    fill: PALETTE.pine,
    font: { name: "Geist", size: 10, bold: true, color: PALETTE.white },
    verticalAlignment: "center",
    wrapText: true,
  };
  range.format.borders = {
    bottom: { style: "medium", color: PALETTE.ochre },
  };
}

function bodyStyle(range) {
  range.format = {
    fill: PALETTE.parchment,
    font: { name: "Geist", size: 10, color: PALETTE.ink },
    verticalAlignment: "top",
    wrapText: true,
  };
}

function styleUsedSheet(sheet, rangeAddress) {
  sheet.showGridLines = false;
  bodyStyle(sheet.getRange(rangeAddress));
}

// README
readme.getRange("A1:H1").values = [[
  "Session 3 planner",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
]];
readme.getRange("A2:H2").values = [[
  "Answer-free formula and pivot planning workbook",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
]];
readme.getRange("A4:B9").values = [
  ["Purpose", "Plan and audit a bounded spreadsheet method without embedding source rows or expected answers."],
  ["Dataset version", schema.metadata.dataset_version],
  ["Source binding", "Before analysis, copy the active version and SHA-256 from the LMS material card. Never record a private storage path."],
  ["Grain", "One row in startups = one startup snapshot; record_id anchors populated rows."],
  ["Null rule", schema.metadata.blank_cell_semantics],
  ["Privacy", "Keep this workbook roster-gated. Do not publish rows, derived values, screenshots, or saved private outputs."],
];
readme.getRange("A11:B16").values = [
  ["Use order", "Action"],
  ["1", "Import the authorised learner CSV into startups without changing the 29 headers."],
  ["2", "Complete version/checksum fields and write your own formulas in the Ochre TODO cells on Analysis."],
  ["3", "Use Pivot Plan to specify rows, values, filters, sort, and excluded count before building a pivot."],
  ["4", "Run the independent check and record the absolute gap; two prompts to the same model are not independent."],
  ["5", "Submit only the compact aggregate and verification trace. Keep the source file private."],
];
readme.getRange("A18:B22").values = [
  ["Visual key", "Meaning"],
  ["Pine", "Headings and fixed schema"],
  ["Ochre", "Learner-editable TODO cells; text labels repeat the meaning, so colour is never the only cue"],
  ["Sand", "Method notes and checkpoints"],
  ["Parchment", "Read-only guidance and safe empty workspace"],
];
readme.getRange("A24:B27").values = [
  ["Source ID", "Version / learner label"],
  ["private-safe.trustmrr-s3-schema", `${schema.metadata.dataset_version} · machine-readable learner schema`],
  ["session-03.data-dictionary", "Session 3 learner data dictionary"],
  ["session-03.spreadsheet-pathway", "Session 3 spreadsheet pathway"],
];
styleUsedSheet(readme, "A1:H27");
titleStyle(readme.getRange("A1:H1"));
readme.getRange("A2:H2").format = {
  fill: PALETTE.palePine,
  font: { name: "Geist", size: 11, italic: true, color: PALETTE.pine },
  wrapText: true,
};
sectionStyle(readme.getRange("A11:B11"));
sectionStyle(readme.getRange("A18:B18"));
sectionStyle(readme.getRange("A24:B24"));
readme.getRange("A4:A9").format.font = { name: "Geist", bold: true, color: PALETTE.pine };
readme.getRange("A12:A16").format.font = { name: "Geist Mono", bold: true, color: PALETTE.ochre };
readme.getRange("A19:A22").format.font = { name: "Geist", bold: true, color: PALETTE.pine };
readme.getRange("A1:A27").format.columnWidthPx = 220;
readme.getRange("B1:B27").format.columnWidthPx = 660;
readme.getRange("C1:H27").format.columnWidthPx = 18;
readme.getRange("A4:B27").format.rowHeightPx = 32;
readme.freezePanes.freezeRows(2);

// Analysis
analysis.getRange("A1:J1").values = [[
  "Analysis plan",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
]];
analysis.getRange("A3:G3").values = [[
  "Metric / output",
  "Your formula",
  "Result / note",
  "Unit / rounding",
  "Formula pattern · text only",
  "Independent check",
  "Status",
]];
analysis.getRange("A4:F9").values = [
  ["record_count", "", "", "records · integer", "'=COUNTA('startups'!A2:A2001)", "Distinct record_id count or pivot COUNTA"],
  ["missing_country_count", "", "", "records · integer", "'=SUMPRODUCT(--('startups'!A2:A2001<>\"\"),--(LEN(TRIM('startups'!G2:G2001))=0))", "Filter populated IDs, then count blank/whitespace country"],
  ["missing_country_pct", "", "", "percentage · 1 decimal", "'=ROUND(100*[missing_country_count]/[record_count],1)", "Recompute numerator ÷ denominator"],
  ["median_mrr_usd", "", "", "USD · nearest whole at display", "'=MEDIAN(FILTER('startups'!M2:M2001,'startups'!A2:A2001<>\"\",ISNUMBER('startups'!M2:M2001)))", "Sorted numeric series; preserve legitimate zeros"],
  ["category_total_mrr", "", "", "label + USD · nearest whole", "'=QUERY('startups'!A1:AC2001,\"select W, sum(M) where A is not null and W is not null group by W order by sum(M) desc\",1)", "Pivot: category rows, mrr_usd SUM"],
  ["onsale_median_asking_price_usd", "", "", "USD · nearest whole", "'=MEDIAN(FILTER('startups'!AC2:AC2001,LOWER('startups'!AB2:AB2001)=\"true\",ISNUMBER('startups'!AC2:AC2001)))", "Filter on_sale true + numeric price, then median"],
];
analysis.getRange("G4").formulas = [["=IF(B4=\"\",\"TODO\",\"REVIEW\")"]];
analysis.getRange("G4:G9").fillDown();
analysis.getRange("A11:B14").values = [
  ["Category output scaffold", "total_mrr_usd"],
  ["TODO: formula spill / paste pivot output", ""],
  ["", ""],
  ["", ""],
];
analysis.getRange("E11:G14").values = [
  ["Hygiene check", "Live status", "Required action"],
  ["Populated record_id rows", "", "Bind the denominator before interpreting any result"],
  ["Numeric MRR cells", "", "Investigate any gap; do not silently coerce"],
  ["Source binding", "TODO", "Record active version and checksum status in the trace"],
];
analysis.getRange("F12").formulas = [["=IF(COUNTIF('startups'!A2:A2001,\"?*\")=0,\"WAITING FOR DATA\",COUNTIF('startups'!A2:A2001,\"?*\"))"]];
analysis.getRange("F13").formulas = [["=IF(COUNTIF('startups'!A2:A2001,\"?*\")=0,\"WAITING FOR DATA\",COUNT('startups'!M2:M2001))"]];
analysis.getRange("I3:J11").values = [
  ["Verification trace", "Learner entry"],
  ["Dataset version ID", "TODO"],
  ["Checksum status", "TODO: MATCH / STOP"],
  ["Verified item", "TODO"],
  ["Method A + working", "TODO"],
  ["Result A + unit", "TODO"],
  ["Method B + working", "TODO"],
  ["Result B + unit", "TODO"],
  ["Absolute gap + explanation", "TODO"],
];
styleUsedSheet(analysis, "A1:J14");
titleStyle(analysis.getRange("A1:J1"));
headerStyle(analysis.getRange("A3:G3"));
headerStyle(analysis.getRange("I3:J3"));
headerStyle(analysis.getRange("A11:B11"));
headerStyle(analysis.getRange("E11:G11"));
analysis.getRange("B4:B9").format = {
  fill: PALETTE.paleOchre,
  font: { name: "Geist Mono", color: PALETTE.ink },
  borders: { preset: "outside", style: "thin", color: PALETTE.ochre },
};
analysis.getRange("C4:C9").format.fill = PALETTE.paleOchre;
analysis.getRange("J4:J11").format = {
  fill: PALETTE.paleOchre,
  font: { name: "Geist", color: PALETTE.ink },
  borders: { preset: "outside", style: "thin", color: PALETTE.ochre },
  wrapText: true,
};
analysis.getRange("E4:E9").format = {
  fill: PALETTE.sand,
  font: { name: "Geist Mono", size: 9, color: PALETTE.ink },
  wrapText: true,
};
analysis.getRange("G4:G9").format = {
  fill: PALETTE.palePine,
  font: { name: "Geist Mono", bold: true, color: PALETTE.pine },
};
analysis.getRange("A1:A14").format.columnWidthPx = 210;
analysis.getRange("B1:C14").format.columnWidthPx = 155;
analysis.getRange("D1:D14").format.columnWidthPx = 165;
analysis.getRange("E1:E14").format.columnWidthPx = 500;
analysis.getRange("F1:G14").format.columnWidthPx = 220;
analysis.getRange("H1:H14").format.columnWidthPx = 24;
analysis.getRange("I1:I14").format.columnWidthPx = 190;
analysis.getRange("J1:J14").format.columnWidthPx = 300;
analysis.getRange("A3:J14").format.rowHeightPx = 46;
analysis.getRange("A4:J9").format.rowHeightPx = 72;
analysis.freezePanes.freezeRows(3);

// Pivot Plan
pivot.getRange("A1:H1").values = [[
  "Pivot plan",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
]];
pivot.getRange("A3:H3").values = [[
  "Plan ID",
  "Analytical job",
  "Source range",
  "Rows",
  "Values",
  "Filters / exclusions",
  "Sort / tie rule",
  "Independent check",
]];
pivot.getRange("A4:H6").values = [
  ["PIVOT-01", "Scale formula lane: compare audience totals", "startups!A1:AC2001", "audience_type", "record_id → COUNTA; mrr_usd → SUM", "record_id populated; audience_type non-missing; zeros retained", "total MRR descending; audience label ascending", "Compare grouped count + excluded audience rows to populated base"],
  ["PIVOT-02", "Verify category with largest total MRR", "startups!A1:AC2001", "category", "mrr_usd → SUM", "record_id populated; category trimmed and non-missing; zeros retained", "total MRR descending; canonical label ascending", "Compare against formula output and report absolute gap"],
  ["PIVOT-03", "Audit country completeness", "startups!A1:AC2001", "country", "record_id → COUNTA", "record_id populated; blank/whitespace is missing", "count descending", "Missing count + present count must equal populated base"],
];
pivot.getRange("A9:B16").values = [
  ["Build step", "Evidence to record"],
  ["1 · Bind source", "Dataset version ID, checksum status, source range"],
  ["2 · Set grain", "One row = one startup snapshot; record_id anchors real rows"],
  ["3 · Add Rows", "Exact schema field; no silent label merges"],
  ["4 · Add Values", "Explicit aggregation label: COUNTA, SUM, or approved equivalent"],
  ["5 · Filter", "Null/blank/zero rule and excluded-row count"],
  ["6 · Sort", "Primary sort plus deterministic tie-break"],
  ["7 · Verify", "Independent method, result, unit, absolute gap, explanation"],
];
pivot.getRange("D9:H14").values = [
  ["Verification log", "Value", "Unit", "Status", "Notes"],
  ["Valid row count", "TODO", "records", "TODO", ""],
  ["Excluded row count", "TODO", "records", "TODO", ""],
  ["Pivot result", "TODO", "declared above", "TODO", ""],
  ["Formula result", "TODO", "same as pivot", "TODO", ""],
  ["Absolute gap", "TODO", "same unit", "TODO", "Explain or repair before submission"],
];
styleUsedSheet(pivot, "A1:H16");
titleStyle(pivot.getRange("A1:H1"));
headerStyle(pivot.getRange("A3:H3"));
headerStyle(pivot.getRange("A9:B9"));
headerStyle(pivot.getRange("D9:H9"));
pivot.getRange("E10:H14").format.fill = PALETTE.paleOchre;
pivot.getRange("A1:A16").format.columnWidthPx = 120;
pivot.getRange("B1:B16").format.columnWidthPx = 270;
pivot.getRange("C1:C16").format.columnWidthPx = 170;
pivot.getRange("D1:D16").format.columnWidthPx = 175;
pivot.getRange("E1:E16").format.columnWidthPx = 235;
pivot.getRange("F1:F16").format.columnWidthPx = 300;
pivot.getRange("G1:G16").format.columnWidthPx = 230;
pivot.getRange("H1:H16").format.columnWidthPx = 300;
pivot.getRange("A3:H16").format.rowHeightPx = 52;
pivot.getRange("A4:H6").format.rowHeightPx = 72;
pivot.freezePanes.freezeRows(3);

// startups headers only — never write source rows.
startups.getRange("A1:AC1").values = [fields.map((field) => field.name)];
styleUsedSheet(startups, "A1:AC2");
headerStyle(startups.getRange("A1:AC1"));
startups.getRange("A2:AC2").format = {
  fill: PALETTE.paleOchre,
  font: { name: "Geist", color: PALETTE.ink },
  borders: { bottom: { style: "thin", color: PALETTE.sand } },
};
startups.getRange("A1:AC2").format.columnWidthPx = 145;
startups.getRange("A1:AC1").format.rowHeightPx = 42;
startups.getRange("A2:AC2").format.rowHeightPx = 28;
startups.freezePanes.freezeRows(1);
const startupsTable = startups.tables.add("A1:AC2", true, "S3StartupsHeadersTable");
startupsTable.showFilterButton = true;
startupsTable.showBandedColumns = false;

// Schema
schemaSheet.getRange("A1:E1").values = [[
  "Learner CSV schema",
  "",
  "",
  "",
  "",
]];
schemaSheet.getRange("A3:E3").values = [["Field", "Logical type", "Nullable", "Unit", "Description"]];
schemaSheet.getRange(`A4:E${fields.length + 3}`).values = fields.map((field) => [
  field.name,
  field.logical_type,
  field.nullable ? "Yes" : "No",
  field.unit || "",
  field.description,
]);
styleUsedSheet(schemaSheet, `A1:E${fields.length + 3}`);
titleStyle(schemaSheet.getRange("A1:E1"));
headerStyle(schemaSheet.getRange("A3:E3"));
schemaSheet.getRange(`A4:A${fields.length + 3}`).format.font = {
  name: "Geist Mono",
  bold: true,
  color: PALETTE.pine,
};
schemaSheet.getRange(`C4:C${fields.length + 3}`).format.horizontalAlignment = "center";
schemaSheet.getRange(`A1:A${fields.length + 3}`).format.columnWidthPx = 210;
schemaSheet.getRange(`B1:B${fields.length + 3}`).format.columnWidthPx = 150;
schemaSheet.getRange(`C1:C${fields.length + 3}`).format.columnWidthPx = 95;
schemaSheet.getRange(`D1:D${fields.length + 3}`).format.columnWidthPx = 135;
schemaSheet.getRange(`E1:E${fields.length + 3}`).format.columnWidthPx = 620;
schemaSheet.getRange(`A3:E${fields.length + 3}`).format.rowHeightPx = 42;
schemaSheet.freezePanes.freezeRows(3);
schemaSheet.tables.add(`A3:E${fields.length + 3}`, true, "S3LearnerSchemaTable");

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(PREVIEW_DIR, { recursive: true });

const inspectionRanges = [
  ["README", "A1:B27"],
  ["Analysis", "A1:J14"],
  ["Pivot Plan", "A1:H16"],
  ["startups", "A1:AC2"],
  ["Schema", `A1:E${fields.length + 3}`],
];
const inspections = [];
for (const [sheetName, range] of inspectionRanges) {
  const inspection = await workbook.inspect({
    kind: "table",
    range: `'${sheetName}'!${range}`,
    include: "values,formulas",
    tableMaxRows: 40,
    tableMaxCols: 30,
    maxChars: 10000,
  });
  inspections.push({ sheetName, range, ndjson: inspection.ndjson });
}

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
if (/#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(formulaErrors.ndjson)) {
  throw new Error(`Formula error scan failed: ${formulaErrors.ndjson}`);
}

const renderSpecs = [
  ["README", "A1:B27", "readme.png"],
  ["Analysis", "A1:J14", "analysis.png"],
  ["Pivot Plan", "A1:H16", "pivot-plan.png"],
  ["startups", "A1:AC2", "startups-headers.png"],
  ["Schema", `A1:E${fields.length + 3}`, "schema.png"],
];
const renders = [];
for (const [sheetName, range, filename] of renderSpecs) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  const previewPath = path.join(PREVIEW_DIR, filename);
  await fs.writeFile(previewPath, bytes);
  renders.push({ sheetName, range, previewPath, bytes: bytes.length });
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_PATH);
const implicitInspectPath = `${OUTPUT_PATH}.inspect.ndjson`;
try {
  await fs.unlink(implicitInspectPath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const validation = {
  status: "pass",
  artifact: path.relative(ROOT, OUTPUT_PATH),
  artifact_sha256: await sha256Path(OUTPUT_PATH),
  artifact_bytes: (await fs.stat(OUTPUT_PATH)).size,
  sheets: inspectionRanges.map(([sheetName]) => sheetName),
  sheet_count: inspectionRanges.length,
  learner_header_count: fields.length,
  source_dataset_version: schema.metadata.dataset_version,
  source_manifest_version: manifest.manifest_version,
  private_rows_read: false,
  answer_values_embedded: false,
  formula_placeholders: 6,
  live_formula_cells: 8,
  formula_error_scan: "pass",
  implicit_inspect_support_removed: true,
  inspections: inspections.map(({ sheetName, range, ndjson }) => ({
    sheetName,
    range,
    ndjson_sha256: sha256Bytes(ndjson),
  })),
  renders,
  sources: [
    {
      source_id: "private-safe.trustmrr-s3-schema",
      version_id: schema.metadata.dataset_version,
      path: path.relative(ROOT, SCHEMA_PATH),
      sha256: await sha256Path(SCHEMA_PATH),
    },
    {
      source_id: "private-safe.trustmrr-s3-manifest",
      version_id: manifest.manifest_version,
      path: path.relative(ROOT, MANIFEST_PATH),
      sha256: await sha256Path(MANIFEST_PATH),
    },
    {
      source_id: "session-03.data-dictionary",
      path: path.relative(ROOT, DATA_DICTIONARY_PATH),
      sha256: await sha256Path(DATA_DICTIONARY_PATH),
    },
    {
      source_id: "session-03.spreadsheet-pathway",
      path: path.relative(ROOT, SPREADSHEET_PATHWAY_PATH),
      sha256: await sha256Path(SPREADSHEET_PATHWAY_PATH),
    },
  ],
};
await fs.writeFile(VALIDATION_PATH, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);

async function sha256Path(filePath) {
  return sha256Bytes(await fs.readFile(filePath));
}

function sha256Bytes(payload) {
  return createHash("sha256").update(payload).digest("hex");
}
