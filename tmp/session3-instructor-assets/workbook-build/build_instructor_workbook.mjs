import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";


const buildDir = path.dirname(new URL(import.meta.url).pathname);
const rootDir = path.dirname(buildDir);
const rows = JSON.parse(await fs.readFile(path.join(rootDir, "sample_rows.json"), "utf8"));
const headers = rows[0];
const data = rows.slice(1).map((row) => [...row, ...Array(headers.length - row.length).fill(null)]);
const index = Object.fromEntries(headers.map((header, position) => [header, position]));

const number = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const text = (value) => value === null || value === undefined ? "" : String(value);
const nonblank = (value) => text(value).trim() !== "";
const clean = data.map((row) => Object.fromEntries(headers.map((header, position) => [header, row[position] ?? null])));

const identityGroup = (row) => row.startup_name === "Stealth Company" ? "Anonymous" : "Named";
const tld = (row) => {
  const domain = text(row.domain).trim().toLowerCase();
  const match = domain.match(/(\.[^.]+)$/);
  return match?.[1] ?? "";
};
const multiple = (row) => number(text(row.revenue_multiple).toLowerCase().replace("x", ""));

const grouped = (items, keyFn) => {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
};
const median = (values) => {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const sum = (values) => values.reduce((total, value) => total + (value ?? 0), 0);
const mean = (values) => {
  const valid = values.filter((value) => value !== null);
  return valid.length ? sum(valid) / valid.length : null;
};

const categoryGroups = grouped(clean.filter((row) => nonblank(row.category)), (row) => row.category);
const categorySummary = [...categoryGroups.entries()].map(([category, group]) => ({
  category,
  companies: group.length,
  total: sum(group.map((row) => number(row.revenue_30d_usd))),
  median: median(group.map((row) => number(row.revenue_30d_usd))),
})).sort((a, b) => b.total - a.total);

const providerGroups = grouped(clean.filter((row) => nonblank(row.payment_provider)), (row) => row.payment_provider);
const providerSummary = [...providerGroups.entries()].map(([provider, group]) => ({
  provider,
  companies: group.length,
  total: sum(group.map((row) => number(row.revenue_30d_usd))),
})).sort((a, b) => b.companies - a.companies || b.total - a.total);

const identityGroups = grouped(clean, identityGroup);
const identitySummary = [...identityGroups.entries()].map(([groupName, group]) => ({
  groupName,
  companies: group.length,
  total: sum(group.map((row) => number(row.revenue_30d_usd))),
  average: mean(group.map((row) => number(row.revenue_30d_usd))),
}));

const tldGroups = grouped(clean.filter((row) => tld(row)), tld);
const tldSummary = [...tldGroups.entries()].map(([suffix, group]) => ({
  suffix,
  companies: group.length,
  median: median(group.map((row) => number(row.domain_rating))),
  mean: mean(group.map((row) => number(row.domain_rating))),
})).sort((a, b) => (b.median ?? -1) - (a.median ?? -1));

const multipleRows = clean.filter((row) =>
  [true, "true", "TRUE", 1].includes(row.on_sale)
  && ["B2B", "B2C"].includes(row.audience_type)
  && multiple(row) !== null,
);
const multipleGroups = grouped(multipleRows, (row) => row.audience_type);
const multipleSummary = ["B2B", "B2C"].map((audience) => {
  const group = multipleGroups.get(audience) ?? [];
  const values = group.map(multiple);
  return { audience, n: group.length, mean: mean(values), median: median(values) };
});

const revenue30 = clean.map((row) => number(row.revenue_30d_usd) ?? 0);
const totalRevenue = sum(revenue30);
const top10Revenue = [...revenue30].sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
const pairRows = clean.filter((row) => number(row.x_followers) !== null && number(row.revenue_3m_usd) !== null);
const pearson = (pairs) => {
  const xs = pairs.map((row) => number(row.x_followers));
  const ys = pairs.map((row) => number(row.revenue_3m_usd));
  const xMean = mean(xs);
  const yMean = mean(ys);
  const numerator = sum(xs.map((x, i) => (x - xMean) * (ys[i] - yMean)));
  const denominator = Math.sqrt(sum(xs.map((x) => (x - xMean) ** 2)) * sum(ys.map((y) => (y - yMean) ** 2)));
  return numerator / denominator;
};

const expected = {
  rows: clean.length,
  duplicates: clean.length - new Set(clean.map((row) => row.record_id)).size,
  zeroRevenue: revenue30.filter((value) => value === 0).length,
  totalRevenue,
  top10Share: top10Revenue / totalRevenue,
  validPairs: pairRows.length,
  pearson: pearson(pairRows),
};

const workbook = Workbook.create();
const sheetNames = [
  "Start Here", "Answer Key", "Data", "Categories", "Providers",
  "Country Provider", "Identity", "TLD", "Multiples", "Q10 Strategy", "Formula Guide",
];
const sheets = Object.fromEntries(sheetNames.map((name) => [name, workbook.worksheets.add(name)]));

const colours = {
  pine: "#1E4D43",
  parchment: "#F5F0E6",
  ochre: "#C56A2D",
  ink: "#222222",
  pale: "#ECE8DF",
  good: "#DCE9E3",
};
const titleFormat = { fill: colours.parchment, font: { bold: true, color: colours.pine, size: 16 }, verticalAlignment: "center" };
const headerFormat = { fill: "#E6E6E6", font: { bold: true, color: colours.ink }, verticalAlignment: "center", wrapText: true };
const sectionFormat = { fill: colours.pine, font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
const bodyWrap = { font: { color: colours.ink, size: 10 }, verticalAlignment: "top", wrapText: true };

function title(sheet, range, value) {
  sheet.getRange(range).merge();
  sheet.getRange(range.split(":")[0]).values = [[value]];
  sheet.getRange(range).format = titleFormat;
  sheet.getRange(range).format.rowHeight = 34;
}

function header(sheet, range) {
  sheet.getRange(range).format = headerFormat;
  sheet.getRange(range).format.rowHeight = 30;
}

function setWidths(sheet, widths) {
  for (const [column, width] of Object.entries(widths)) {
    sheet.getRange(`${column}:${column}`).format.columnWidth = width;
  }
}

// Start Here
title(sheets["Start Here"], "A1:F1", "Session 3 · TrustMRR instructor solutions");
sheets["Start Here"].getRange("A3:B12").values = [
  ["Audience", "Instructor only — do not attach to the LMS or share with students"],
  ["Frozen dataset", "1,000-row TrustMRR sample · 30 July 2026"],
  ["Student sheet", "https://docs.google.com/spreadsheets/d/12Gl5MxibqaVOhLowNZotoapufn7UmQen34OVX0J-lKA/edit"],
  ["Full practice sheet", "https://docs.google.com/spreadsheets/d/1w2sQHU6z8E_OEQVBskfoxmS1wn_7XERH43UBGJPMMOk/edit"],
  ["How to use", "Answer Key gives the reference result. The summary tabs show formula-driven pivot-style tables. Formula Guide gives exact Google Sheets formulas and pivot configurations."],
  ["Rounding", "Accept reasonable display rounding; grade filters, denominators, statistic choice and interpretation more heavily than cosmetic precision."],
  ["Q10", "There is no single product answer. Use the supplied strategy as one defensible model, not the only accepted recommendation."],
  ["Privacy", "Keep raw rows and derived answers inside the institution-managed MU Google environment."],
  ["Lifecycle", "Validated instructor reference; not student-facing"],
  ["Prepared", "31 July 2026"],
];
sheets["Start Here"].getRange("A3:A12").format = headerFormat;
sheets["Start Here"].getRange("B3:B12").format = bodyWrap;
setWidths(sheets["Start Here"], { A: 24, B: 92 });

// Data
const dataHeaders = [...headers, "identity_group", "domain_tld", "revenue_multiple_num"];
sheets.Data.getRange(`A1:AF${data.length + 1}`).values = [
  dataHeaders,
  ...data.map((row, rowIndex) => [
    ...row,
    identityGroup(clean[rowIndex]),
    tld(clean[rowIndex]),
    multiple(clean[rowIndex]),
  ]),
];
header(sheets.Data, "A1:AF1");
sheets.Data.freezePanes.freezeRows(1);
sheets.Data.getRange(`F2:Q${data.length + 1}`).format.numberFormat = "#,##0.00";
sheets.Data.getRange(`Z2:Z${data.length + 1}`).format.numberFormat = "0.00";
sheets.Data.getRange(`AB2:AB${data.length + 1}`).format.numberFormat = "$#,##0.00";
sheets.Data.getRange(`AF2:AF${data.length + 1}`).format.numberFormat = "0.00x";
sheets.Data.getRange("A:AF").format.columnWidth = 16;
sheets.Data.getRange("B:B").format.columnWidth = 24;
sheets.Data.getRange("R:W").format.columnWidth = 28;

// Summary sheet helper
function setupSummary(sheet, titleText, headersRow, widths) {
  title(sheet, `A1:${String.fromCharCode(64 + headersRow.length)}1`, titleText);
  sheet.getRange(`A3:${String.fromCharCode(64 + headersRow.length)}3`).values = [headersRow];
  header(sheet, `A3:${String.fromCharCode(64 + headersRow.length)}3`);
  sheet.freezePanes.freezeRows(3);
  setWidths(sheet, widths);
}

setupSummary(sheets.Categories, "Q3 · Category pivot-style summary", ["Category", "Companies", "Total 30-day revenue", "Median 30-day revenue", "Google Sheets median formula"], { A: 28, B: 14, C: 24, D: 25, E: 64 });
sheets.Categories.getRange(`A4:E${categorySummary.length + 3}`).values = categorySummary.map((row, offset) => [
  row.category, row.companies, row.total, row.median,
  `'=${`MEDIAN(FILTER('Data'!$H$2:$H$1001,'Data'!$W$2:$W$1001=A${offset + 4}))`}`,
]);
sheets.Categories.getRange(`C4:D${categorySummary.length + 3}`).format.numberFormat = "$#,##0.00";
sheets.Categories.getRange(`A4:E${categorySummary.length + 3}`).format = bodyWrap;

setupSummary(sheets.Providers, "Q5 · Payment provider pivot-style summary", ["Payment provider", "Companies", "Total 30-day revenue", "Count formula", "Revenue formula"], { A: 34, B: 14, C: 24, D: 54, E: 54 });
sheets.Providers.getRange(`A4:E${providerSummary.length + 3}`).values = providerSummary.map((row, offset) => [
  row.provider, row.companies, row.total,
  `'=${`COUNTIF('Data'!$G$2:$G$1001,A${offset + 4})`}`,
  `'=${`SUMIF('Data'!$G$2:$G$1001,A${offset + 4},'Data'!$H$2:$H$1001)`}`,
]);
sheets.Providers.getRange(`C4:C${providerSummary.length + 3}`).format.numberFormat = "$#,##0.00";
sheets.Providers.getRange(`A4:E${providerSummary.length + 3}`).format = bodyWrap;

// Country Provider
setupSummary(sheets["Country Provider"], "Q6 · US and India provider preference", ["Country", "Companies", "Top provider", "Provider count", "Provider share", "Pivot configuration"], { A: 12, B: 14, C: 34, D: 16, E: 16, F: 70 });
const countryRows = ["US", "IN"].map((country) => {
  const members = clean.filter((row) => row.country === country);
  const counts = [...grouped(members.filter((row) => nonblank(row.payment_provider)), (row) => row.payment_provider).entries()]
    .map(([provider, group]) => ({ provider, count: group.length }))
    .sort((a, b) => b.count - a.count);
  const top = counts[0];
  return [country, members.length, top.provider, top.count, top.count / members.length, "Rows: country; Columns: payment_provider; Values: COUNTA record_id; show as % of row total for preference."];
});
sheets["Country Provider"].getRange("A4:F5").values = countryRows;
sheets["Country Provider"].getRange("E4:E5").format.numberFormat = "0.0%";
sheets["Country Provider"].getRange("A4:F5").format = bodyWrap;

// Identity
setupSummary(sheets.Identity, "Q7 · Anonymous vs named", ["Group", "Companies", "Company share", "Total 30-day revenue", "Revenue share", "Average 30-day revenue"], { A: 18, B: 14, C: 16, D: 24, E: 16, F: 24 });
sheets.Identity.getRange("A4:F5").values = identitySummary.map((row) => [
  row.groupName, row.companies, row.companies / clean.length, row.total, row.total / totalRevenue, row.average,
]);
sheets.Identity.getRange("C4:C5").format.numberFormat = "0.0%";
sheets.Identity.getRange("D4:D5").format.numberFormat = "$#,##0.00";
sheets.Identity.getRange("E4:E5").format.numberFormat = "0.0%";
sheets.Identity.getRange("F4:F5").format.numberFormat = "$#,##0.00";

// TLD
setupSummary(sheets.TLD, "Q8 · TLD and domain rating", ["TLD", "Companies", "Median domain rating", "Mean domain rating", "Eligible (≥10)", "Google Sheets median formula"], { A: 14, B: 14, C: 23, D: 21, E: 18, F: 66 });
sheets.TLD.getRange(`A4:F${tldSummary.length + 3}`).values = tldSummary.map((row, offset) => [
  row.suffix, row.companies, row.median, row.mean, row.companies >= 10 ? "Yes" : "No",
  `'=${`MEDIAN(FILTER('Data'!$Z$2:$Z$1001,'Data'!$AE$2:$AE$1001=A${offset + 4}))`}`,
]);
sheets.TLD.getRange(`C4:D${tldSummary.length + 3}`).format.numberFormat = "0.00";
sheets.TLD.getRange(`A4:F${tldSummary.length + 3}`).format = bodyWrap;

// Multiples
setupSummary(sheets.Multiples, "Q9 · On-sale B2B vs B2C multiples", ["Audience", "n", "Mean multiple", "Median multiple", "Pivot/filter recipe", "Median formula"], { A: 16, B: 10, C: 18, D: 20, E: 70, F: 70 });
sheets.Multiples.getRange("A4:F5").values = multipleSummary.map((row, offset) => [
  row.audience, row.n, row.mean, row.median,
  "Filter on_sale = TRUE and revenue_multiple_num nonblank; Rows: audience_type; Values: COUNT, AVERAGE and MEDIAN of revenue_multiple_num.",
  `'=${`MEDIAN(FILTER('Data'!$AF$2:$AF$1001,'Data'!$AA$2:$AA$1001=TRUE,'Data'!$V$2:$V$1001=A${offset + 4}))`}`,
]);
sheets.Multiples.getRange("C4:D5").format.numberFormat = "0.00x";
sheets.Multiples.getRange("A4:F5").format = bodyWrap;

// Answer Key
title(sheets["Answer Key"], "A1:F1", "Ten-question reference answer key");
sheets["Answer Key"].getRange("A3:F3").values = [["Question", "Metric", "Expected result", "Accepted display", "Method / formula reference", "Instructor note"]];
header(sheets["Answer Key"], "A3:F3");
const answerRows = [
  ["Q1", "Rows / duplicates", `${expected.rows.toLocaleString()} / ${expected.duplicates}`, "1,000 / 0", "Formula Guide · Q1", "Missing: country 241 (24.1%), audience_type 288 (28.8%), category 274 (27.4%), domain 286 (28.6%)."],
  ["Q2", "Zero / total / top-10 share", `${expected.zeroRevenue} / $${expected.totalRevenue.toFixed(2)} / ${(expected.top10Share * 100).toFixed(4)}%`, "216 / $15,596,344.59 / 49.61%", "Formula Guide · Q2", "Revenue is highly concentrated."],
  ["Q3", "Highest total / highest eligible median", "AI / Education", "AI / Education", "Categories tab", "AI total $2,356,676.28; Education median $2,435 with n=30."],
  ["Q4", "Pairs / Pearson r", `${expected.validPairs} / ${expected.pearson.toFixed(6)}`, "984 / 0.0248", "Formula Guide · Q4", "Essentially no linear relationship; never call this causal."],
  ["Q5", "Provider leaders", "Stripe (API key)", "Stripe (API key)", "Providers tab", "636 companies and $13,526,762.05 combined 30-day revenue."],
  ["Q6", "US / India top provider", "Stripe / Dodo Payments", "Stripe (API key) / Dodo Payments (API key)", "Country Provider tab", "US: 221/258 = 85.7%. IN: 36/59 = 61.0%."],
  ["Q7", "Anonymous / named", "129 / 871", "12.9% / 87.1%", "Identity tab", "Anonymous rows contribute 26.525% of revenue despite 12.9% of companies."],
  ["Q8", "Highest eligible median TLD", ".ai", ".ai · n=91 · median 25", "TLD tab", ".com: n=312, median 8. Association is observational."],
  ["Q9", "B2B / B2C median multiple", "2.35x / 2.30x", "2.35x / 2.30x", "Multiples tab", "Means are 7.9719x / 8.4429x because outliers pull them upward."],
  ["Q10", "$1M recommendation", "One defensible model", "See Q10 Strategy", "Q10 Strategy tab", "Accept alternatives that use ≥4 correct findings and coherent pricing arithmetic."],
];
sheets["Answer Key"].getRange("A4:F13").values = answerRows;
sheets["Answer Key"].getRange("A4:F13").format = bodyWrap;
setWidths(sheets["Answer Key"], { A: 10, B: 28, C: 36, D: 31, E: 25, F: 74 });
sheets["Answer Key"].freezePanes.freezeRows(3);

// Q10 Strategy
title(sheets["Q10 Strategy"], "A1:E1", "Q10 · One defensible $1M indie-hacker strategy");
sheets["Q10 Strategy"].getRange("A3:B11").values = [
  ["Decision", "Reference recommendation"],
  ["Product", "B2B AI reporting assistant for education and cohort-based training operators"],
  ["Problem", "Turn student/project submissions into verified progress reports, intervention lists and stakeholder updates without manual spreadsheet reconciliation"],
  ["Geography", "Start with US customers"],
  ["Payment provider", "Stripe"],
  ["Pricing", "$199 per month"],
  ["Customers for $1M ARR", 419],
  ["Arithmetic", "$199 × 12 × 419 = $1,000,572 annual revenue"],
  ["Misleading signal to reject", "Do not chase X followers: Pearson r is only 0.0248. Also do not treat category totals as typical performance because the top 10 rows contribute 49.61% of all 30-day revenue."],
];
sheets["Q10 Strategy"].getRange("A3:B3").format = headerFormat;
sheets["Q10 Strategy"].getRange("A4:A11").format = headerFormat;
sheets["Q10 Strategy"].getRange("B4:B11").format = bodyWrap;
sheets["Q10 Strategy"].getRange("A13:E13").values = [["Evidence", "Calculated result", "How it supports the choice", "Limitation", "Use in final answer"]];
header(sheets["Q10 Strategy"], "A13:E13");
sheets["Q10 Strategy"].getRange("A14:E19").values = [
  ["Category median", "Education median $2,435; n=30", "A comparatively strong typical result among eligible categories", "Category label is broad and 27.4% are missing", "Supports category direction"],
  ["Provider", "Stripe: 636 companies; $13.53M", "Lowest-friction default in this sample", "Provider label does not prove merchant satisfaction", "Supports payment choice"],
  ["US preference", "Stripe: 221/258 = 85.7%", "Strong observed fit for a US launch", "Country field is missing for 24.1%", "Supports geography"],
  ["Audience multiples", "B2B median 2.35x vs B2C 2.30x", "No strong multiple penalty for B2B", "Only on-sale rows with a stated multiple", "Supports B2B cautiously"],
  ["Followers", "Pearson r = 0.0248", "Audience size is not a useful revenue screen here", "Linear correlation and observational data", "Rejects follower chasing"],
  ["Concentration", "Top 10 = 49.61% of revenue", "Use medians and customer economics, not category totals alone", "One frozen sample", "Rejects winner-driven averages"],
];
sheets["Q10 Strategy"].getRange("A14:E19").format = bodyWrap;
setWidths(sheets["Q10 Strategy"], { A: 25, B: 31, C: 45, D: 42, E: 30 });

// Formula Guide
title(sheets["Formula Guide"], "A1:E1", "Google Sheets formula and pivot reference");
sheets["Formula Guide"].getRange("A3:E3").values = [["Question", "Output", "Google Sheets formula / pivot", "Where to enter", "Notes"]];
header(sheets["Formula Guide"], "A3:E3");
const formulaRows = [
  ["Q1", "Total rows", "'=COUNTA('Data'!A2:A1001)", "Any blank cell", "Header excluded"],
  ["Q1", "Duplicate IDs beyond first", "'=ROWS('Data'!A2:A1001)-COUNTUNIQUE('Data'!A2:A1001)", "Any blank cell", "Counts extra occurrences"],
  ["Q1", "Missing country", "'=COUNTBLANK('Data'!E2:E1001)", "Any blank cell", "Divide by 1000 for percentage"],
  ["Q2", "Zero 30-day revenue", "'=COUNTIF('Data'!H2:H1001,0)", "Any blank cell", "Exact zeros"],
  ["Q2", "Total 30-day revenue", "'=SUM('Data'!H2:H1001)", "Any blank cell", "USD"],
  ["Q2", "Top-10 share", "'=SUM(LARGE('Data'!H2:H1001,SEQUENCE(10)))/SUM('Data'!H2:H1001)", "Any blank cell", "Format as percent"],
  ["Q3", "Category summary", "Pivot: Rows=category; Values=COUNTA record_id and SUM revenue_30d_usd", "New pivot sheet", "Filter blank category"],
  ["Q3", "Category median", "'=MEDIAN(FILTER('Data'!$H$2:$H$1001,'Data'!$W$2:$W$1001=A4))", "Categories!D4", "Copy down; only compare rows with Companies ≥10"],
  ["Q4", "Valid pairs", "'=COUNTIFS('Data'!F2:F1001,\"<>\",'Data'!I2:I1001,\"<>\")", "Any blank cell", "Complete pairs only"],
  ["Q4", "Pearson r", "'=CORREL(FILTER('Data'!F2:F1001,'Data'!F2:F1001<>\"\",'Data'!I2:I1001<>\"\"),FILTER('Data'!I2:I1001,'Data'!F2:F1001<>\"\",'Data'!I2:I1001<>\"\"))", "Any blank cell", "Do not infer causation"],
  ["Q5", "Provider summary", "Pivot: Rows=payment_provider; Values=COUNTA record_id and SUM revenue_30d_usd", "New pivot sheet", "Filter blank provider"],
  ["Q6", "Country preference", "Pivot: Rows=country; Columns=payment_provider; Values=COUNTA record_id", "New pivot sheet", "Filter to US and IN; show as % of row"],
  ["Q7", "Identity helper", "'=ARRAYFORMULA(IF(B2:B=\"\",\"\",IF(B2:B=\"Stealth Company\",\"Anonymous\",\"Named\")))", "Data!AD2", "Then pivot by identity_group"],
  ["Q8", "TLD helper", "'=ARRAYFORMULA(IF(Y2:Y=\"\",\"\",IFERROR(\".\"&REGEXEXTRACT(LOWER(Y2:Y),\"([^.]+)$\"),\"\")))", "Data!AE2", "Then summarize count and domain rating"],
  ["Q8", "TLD median", "'=MEDIAN(FILTER('Data'!$Z$2:$Z$1001,'Data'!$AE$2:$AE$1001=A4))", "TLD!C4", "Only compare TLDs with Companies ≥10"],
  ["Q9", "Multiple helper", "'=ARRAYFORMULA(IF(AC2:AC=\"\",\"\",VALUE(SUBSTITUTE(LOWER(AC2:AC),\"x\",\"\"))))", "Data!AF2", "Filter on_sale TRUE and audience B2B/B2C"],
  ["Q9", "Median multiple", "'=MEDIAN(FILTER('Data'!$AF$2:$AF$1001,'Data'!$AA$2:$AA$1001=TRUE,'Data'!$V$2:$V$1001=A4))", "Multiples!D4", "Copy down"],
  ["Q10", "Customers for $1M", "'=ROUNDUP(1000000/(monthly_price*12),0)", "Pricing scratch area", "At $199/month: 419"],
];
sheets["Formula Guide"].getRange(`A4:E${formulaRows.length + 3}`).values = formulaRows;
sheets["Formula Guide"].getRange(`A4:E${formulaRows.length + 3}`).format = bodyWrap;
setWidths(sheets["Formula Guide"], { A: 10, B: 25, C: 100, D: 24, E: 42 });
sheets["Formula Guide"].freezePanes.freezeRows(3);

for (const sheet of Object.values(sheets)) {
  const used = sheet.getUsedRange();
  if (used) {
    used.format.verticalAlignment = "top";
  }
}

const outputDir = path.join(rootDir, "output");
const previewDir = path.join(rootDir, "previews");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const outputPath = path.join(outputDir, "MU_Session_3_TrustMRR_Instructor_Solutions_Private_v1.xlsx");
await xlsx.save(outputPath);

const previewRanges = {
  "Start Here": "A1:B12",
  "Answer Key": "A1:F13",
  Data: "A1:AF12",
  Categories: `A1:E${Math.min(categorySummary.length + 3, 20)}`,
  Providers: `A1:E${Math.min(providerSummary.length + 3, 20)}`,
  "Country Provider": "A1:F5",
  Identity: "A1:F5",
  TLD: `A1:F${Math.min(tldSummary.length + 3, 20)}`,
  Multiples: "A1:F5",
  "Q10 Strategy": "A1:E19",
  "Formula Guide": "A1:E21",
};
for (const [sheetName, range] of Object.entries(previewRanges)) {
  const image = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName.replaceAll(" ", "_")}.png`), new Uint8Array(await image.arrayBuffer()));
}

const inspect = await workbook.inspect({
  kind: "table",
  range: "Answer Key!A1:F13",
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 8,
});
console.log(inspect.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
console.log(outputPath);
