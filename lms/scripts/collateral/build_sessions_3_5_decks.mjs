import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const ROOT = "/Users/pushpak/Documents/GitHub/mu_course";
const TMP_ROOT = path.join(ROOT, "tmp/decks");
const OUTPUT_ROOT = path.join(ROOT, "lms/output/decks");
const WORKSPACE_PACKAGE = path.join(TMP_ROOT, "workspace/package.json");
const SOFFICE = "/Users/pushpak/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice";
const FONT_DIR = path.join(TMP_ROOT, "fonts");
const FONT_CONFIG = path.join(TMP_ROOT, "fontconfig.xml");

const require = createRequire(WORKSPACE_PACKAGE);
const { Presentation, PresentationFile } = require("@oai/artifact-tool");
const execFileAsync = promisify(execFile);

const W = 1280;
const H = 720;
const C = {
  pine: "#1E3A35",
  parchment: "#FBF8F3",
  ink: "#1F1A14",
  ochre: "#C4581A",
  beacon: "#F0D478",
  sand: "#EDE5D8",
  cream: "#F5F0E8",
  charcoal: "#5C5046",
  clay: "#9C8E82",
  palePine: "#EAF1EE",
  paleOchre: "#FAEEE7",
  white: "#FFFFFF",
};
const FONT = { display: "Fraunces 9pt", body: "Geist", mono: "Geist Mono" };

const qaBoxes = new WeakMap();
const shapeSeq = new WeakMap();

function nextName(slide, base) {
  const next = (shapeSeq.get(slide) ?? 0) + 1;
  shapeSeq.set(slide, next);
  return `${String(next).padStart(2, "0")}-${base}`;
}

function registerText(slide, name, position) {
  const boxes = qaBoxes.get(slide) ?? [];
  boxes.push({ name, ...position });
  qaBoxes.set(slide, boxes);
}

function addShape(slide, geometry, position, fill = "none", lineFill = "none", lineWidth = 0, base = "shape") {
  return slide.shapes.add({
    geometry,
    name: nextName(slide, base),
    position,
    fill,
    line: { style: "solid", fill: lineFill, width: lineWidth },
    shadow: "shadow-none",
  });
}

function addText(slide, text, options = {}) {
  const {
    x = 64,
    y = 64,
    w = 640,
    h = 80,
    size = 26,
    color = C.ink,
    font = FONT.body,
    bold = false,
    italic = false,
    align = "left",
    valign = "top",
    fill = "none",
    lineFill = "none",
    lineWidth = 0,
    insets = { top: 0, right: 0, bottom: 0, left: 0 },
    base = "text",
  } = options;
  const name = nextName(slide, base);
  const shape = slide.shapes.add({
    geometry: "textbox",
    name,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: lineFill, width: lineWidth },
    borderRadius: 0,
    shadow: "shadow-none",
  });
  shape.text = text;
  shape.text.style = {
    fontSize: size,
    typeface: font,
    bold,
    italic,
    color,
    alignment: align,
    verticalAlignment: valign,
    autoFit: "none",
    wrap: "square",
    insets,
  };
  registerText(slide, name, { left: x, top: y, width: w, height: h });
  return shape;
}

function addLine(slide, x, y, w, color = C.sand, width = 1, base = "rule") {
  return addShape(slide, "line", { left: x, top: y, width: w, height: 0 }, "none", color, width, base);
}

function addKicker(slide, text, { x = 64, y = 42, w = 780, color = C.ochre, dark = false } = {}) {
  return addText(slide, text.toUpperCase(), {
    x,
    y,
    w,
    h: 24,
    size: 14,
    color: dark ? C.beacon : color,
    font: FONT.mono,
    bold: true,
    base: "kicker",
  });
}

function addFooter(slide, sessionLabel, timing, index, total, dark = false) {
  const color = dark ? "#C7D3CE" : C.clay;
  addLine(slide, 64, 676, 1152, dark ? "#46635D" : C.sand, 1, "footer-rule");
  addText(slide, `${sessionLabel}  /  ${timing}`, {
    x: 64,
    y: 687,
    w: 660,
    h: 18,
    size: 11,
    color,
    font: FONT.mono,
    base: "footer-left",
  });
  addText(slide, `${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, {
    x: 1080,
    y: 687,
    w: 136,
    h: 18,
    size: 11,
    color,
    font: FONT.mono,
    align: "right",
    base: "footer-right",
  });
}

function addHeader(slide, title, kicker, options = {}) {
  const { dark = false, long = title.length > 42 } = options;
  addKicker(slide, kicker, { dark });
  const titleColor = dark ? C.cream : C.ink;
  const titleY = 78;
  const titleH = long ? 108 : 70;
  addText(slide, title, {
    x: 64,
    y: titleY,
    w: 1152,
    h: titleH,
    size: long ? 48 : 56,
    color: titleColor,
    font: FONT.display,
    bold: true,
    base: "title",
  });
  const ruleY = long ? 194 : 166;
  addLine(slide, 64, ruleY, 1152, dark ? C.ochre : C.sand, dark ? 3 : 2, "title-rule");
  return ruleY + 28;
}

function makePresentation(title) {
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  presentation.theme.colorScheme = {
    name: `${title} Editorial`,
    themeColors: {
      accent1: C.pine,
      accent2: C.ochre,
      accent3: C.beacon,
      accent4: C.sand,
      accent5: C.charcoal,
      accent6: C.clay,
      bg1: C.parchment,
      bg2: C.sand,
      tx1: C.ink,
      tx2: C.charcoal,
      dk1: C.ink,
      dk2: C.pine,
      lt1: C.white,
      lt2: C.cream,
      hlink: C.ochre,
      folHlink: C.charcoal,
    },
  };
  return presentation;
}

function newSlide(presentation, background = C.parchment) {
  const slide = presentation.slides.add();
  slide.background.fill = background;
  qaBoxes.set(slide, []);
  shapeSeq.set(slide, 0);
  return slide;
}

function setNotes(slide, timing, speakerNote, sourcePath, sources = []) {
  const allSources = [sourcePath, ...sources];
  const note = [
    `Timing: ${timing}`,
    "",
    speakerNote,
    "",
    "[Sources]",
    ...allSources.map((source) => `- ${source}`),
  ].join("\n");
  slide.speakerNotes.textFrame.setText(note);
  slide.speakerNotes.setVisible(true);
}

function addNode(slide, label, x, y, w, h, options = {}) {
  const { fill = C.white, border = C.sand, color = C.ink, font = FONT.body, size = 22, bold = true } = options;
  addShape(slide, "rect", { left: x, top: y, width: w, height: h }, fill, border, 1.5, "node-bg");
  addText(slide, label, {
    x: x + 12,
    y: y + 8,
    w: w - 24,
    h: h - 16,
    size,
    color,
    font,
    bold,
    align: "center",
    valign: "middle",
    base: "node-label",
  });
}

function addArrow(slide, x, y, w, h = 18, fill = C.sand) {
  return addShape(slide, "rightArrow", { left: x, top: y, width: w, height: h }, fill, "none", 0, "arrow");
}

function addBulletList(slide, items, options = {}) {
  const {
    x = 88,
    y = 230,
    w = 1080,
    itemH = 64,
    size = 28,
    color = C.ink,
    marker = "ochre",
    start = 1,
    dark = false,
  } = options;
  items.forEach((item, index) => {
    const top = y + index * itemH;
    const markerText = marker === "number" ? String(start + index).padStart(2, "0") : marker === "check" ? "✓" : "•";
    addText(slide, markerText, {
      x,
      y: top,
      w: 48,
      h: itemH - 4,
      size: marker === "number" ? 18 : 26,
      color: dark ? C.beacon : C.ochre,
      font: marker === "number" ? FONT.mono : FONT.body,
      bold: true,
      valign: "middle",
      base: "bullet-marker",
    });
    addText(slide, item, {
      x: x + 58,
      y: top,
      w: w - 58,
      h: itemH - 4,
      size,
      color: dark ? C.cream : color,
      font: FONT.body,
      bold: false,
      valign: "middle",
      base: "bullet-copy",
    });
  });
}

function addFlatTable(slide, headers, rows, options = {}) {
  const { x = 64, y = 228, w = 1152, rowH = 64, colWidths = null, dark = false, fontSize = 22 } = options;
  const columns = headers.length;
  const widths = colWidths ?? Array(columns).fill(w / columns);
  let left = x;
  headers.forEach((header, c) => {
    addShape(slide, "rect", { left, top: y, width: widths[c], height: rowH }, dark ? C.ochre : C.pine, "none", 0, "table-head-bg");
    addText(slide, header, {
      x: left + 14,
      y: y + 8,
      w: widths[c] - 28,
      h: rowH - 16,
      size: 17,
      color: C.cream,
      font: FONT.mono,
      bold: true,
      valign: "middle",
      base: "table-head",
    });
    left += widths[c];
  });
  rows.forEach((row, r) => {
    const top = y + rowH * (r + 1);
    let cellLeft = x;
    row.forEach((cell, c) => {
      const fill = r % 2 === 0 ? C.white : dark ? "#294A43" : "#F5F0E8";
      addShape(slide, "rect", { left: cellLeft, top, width: widths[c], height: rowH }, fill, C.sand, 1, "table-cell-bg");
      addText(slide, String(cell), {
        x: cellLeft + 14,
        y: top + 7,
        w: widths[c] - 28,
        h: rowH - 14,
        size: fontSize,
        color: dark ? C.cream : C.ink,
        font: FONT.body,
        valign: "middle",
        base: "table-cell",
      });
      cellLeft += widths[c];
    });
  });
}

function addTimer(slide, sessionLabel, timing, index, total, timer, title, footer = "") {
  slide.background.fill = C.pine;
  addKicker(slide, title, { x: 64, y: 54, w: 900, dark: true });
  addText(slide, timer, {
    x: 64,
    y: 170,
    w: 1152,
    h: 250,
    size: 150,
    color: C.cream,
    font: FONT.mono,
    bold: true,
    align: "center",
    valign: "middle",
    base: "timer",
  });
  addShape(slide, "rect", { left: 64, top: 470, width: 1152, height: 8 }, C.beacon, "none", 0, "timer-track");
  addShape(slide, "rect", { left: 64, top: 470, width: 250, height: 8 }, C.ochre, "none", 0, "timer-progress");
  if (footer) {
    addText(slide, footer, {
      x: 140,
      y: 520,
      w: 1000,
      h: 72,
      size: 24,
      color: "#C7D3CE",
      font: FONT.body,
      align: "center",
      valign: "middle",
      base: "timer-footer",
    });
  }
  addFooter(slide, sessionLabel, timing, index, total, true);
}

function assertLayout(slide, deckName, slideNumber) {
  const boxes = qaBoxes.get(slide) ?? [];
  const issues = [];
  for (const box of boxes) {
    const right = box.left + box.width;
    const bottom = box.top + box.height;
    if (box.left < -0.1 || box.top < -0.1 || right > W + 0.1 || bottom > H + 0.1) {
      issues.push({ type: "out-of-bounds", box });
    }
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapW = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const overlapH = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      if (overlapW > 2 && overlapH > 2) {
        issues.push({ type: "text-overlap", a: a.name, b: b.name, overlapW, overlapH });
      }
    }
  }
  if (issues.length) {
    throw new Error(`${deckName} slide ${slideNumber} layout issues:\n${JSON.stringify(issues, null, 2)}`);
  }
  return { slide: slideNumber, textBoxes: boxes.length, issues: 0 };
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function renderAndExport(presentation, spec) {
  const qaDir = path.join(TMP_ROOT, spec.slug);
  await fs.rm(qaDir, { recursive: true, force: true });
  await fs.mkdir(qaDir, { recursive: true });
  const diagnostics = [];
  for (const [index, slide] of presentation.slides.items.entries()) {
    const slideNumber = index + 1;
    diagnostics.push(assertLayout(slide, spec.title, slideNumber));
    const stem = `slide-${String(slideNumber).padStart(2, "0")}`;
    await writeBlob(path.join(qaDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
    const layout = await slide.export({ format: "layout" });
    await fs.writeFile(path.join(qaDir, `${stem}.layout.json`), await layout.text());
  }
  await writeBlob(path.join(qaDir, "montage.webp"), await presentation.export({ format: "webp", montage: true, scale: 1 }));
  const pptxPath = path.join(OUTPUT_ROOT, `${spec.slug}.pptx`);
  const pdfPath = path.join(OUTPUT_ROOT, `${spec.slug}.pdf`);
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(pptxPath);
  try {
    await fs.rename(`${pptxPath}.inspect.ndjson`, path.join(qaDir, "export-inspect.ndjson"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await fs.rm(pdfPath, { force: true });
  const profile = path.join(TMP_ROOT, `soffice-${spec.slug}`);
  await fs.rm(profile, { recursive: true, force: true });
  await fs.mkdir(profile, { recursive: true });
  await execFileAsync(
    SOFFICE,
    [
      "--headless",
      `-env:UserInstallation=file://${profile}`,
      "--convert-to",
      "pdf",
      "--outdir",
      OUTPUT_ROOT,
      pptxPath,
    ],
    {
      env: {
        ...process.env,
        FONTCONFIG_FILE: FONT_CONFIG,
        SAL_FONTPATH: FONT_DIR,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const pdfStat = await fs.stat(pdfPath);
  if (pdfStat.size < 10_000) throw new Error(`PDF export appears invalid: ${pdfPath}`);
  await fs.writeFile(
    path.join(qaDir, "layout-diagnostics.txt"),
    [
      `Deck: ${spec.title}`,
      `Slides: ${presentation.slides.items.length}`,
      `Expected slides: ${spec.count}`,
      `Expected runtime: 120 minutes`,
      `Text overlaps: 0`,
      `Out-of-bounds text boxes: 0`,
      `Rendered PNGs: ${presentation.slides.items.length}`,
      `PPTX: ${pptxPath}`,
      `PDF: ${pdfPath}`,
      "",
      JSON.stringify(diagnostics, null, 2),
    ].join("\n"),
  );
  if (presentation.slides.items.length !== spec.count) {
    throw new Error(`${spec.title}: expected ${spec.count} slides, got ${presentation.slides.items.length}`);
  }
  return { pptxPath, pdfPath, qaDir };
}

function buildSession3() {
  const source = "lms/course/session-03/deck-script.md";
  const presentation = makePresentation("Session 03 - Working with data, using AI");
  const total = 26;
  const session = "SESSION 03";
  const finish = (slide, index, timing, note, sources = [], dark = false) => {
    addFooter(slide, session, timing, index, total, dark);
    setNotes(slide, timing, note, source, sources);
  };

  {
    const slide = newSlide(presentation);
    addShape(slide, "rect", { left: 0, top: 0, width: 14, height: H }, C.ochre, "none", 0, "cover-accent");
    addKicker(slide, "SESSION 03 · JUDGMENT + CRAFT", { x: 72, y: 78 });
    addText(slide, "Working with data.", {
      x: 72, y: 168, w: 790, h: 106, size: 82, font: FONT.display, bold: true, base: "cover-title",
    });
    addText(slide, "Not chatting about it.", {
      x: 72, y: 282, w: 790, h: 102, size: 72, color: C.ochre, font: FONT.display, italic: true, base: "cover-subtitle",
    });
    const labels = ["record_id", "sector", "currency", "mrr_usd", "runway", "growth_rate"];
    labels.forEach((label, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      addShape(slide, "rect", { left: 920 + col * 142, top: 172 + row * 62, width: 126, height: 44 }, "none", C.pine, 1, "grid-cell");
      addText(slide, label, {
        x: 928 + col * 142, y: 180 + row * 62, w: 110, h: 28, size: 12, color: C.pine, font: FONT.mono, align: "center", valign: "middle", base: "grid-label",
      });
    });
    finish(slide, 1, "00:00-00:01", "Today the standard changes. A confident answer is not the artifact. The auditable path to it is.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Last time: two paths", "RECALL · TWO USEFUL ROUTES");
    addArrow(slide, 402, top + 112, 180, 24, C.sand);
    addArrow(slide, 696, top + 112, 180, 24, C.sand);
    addNode(slide, "IN SHEETS", 96, top + 70, 310, 110, { fill: C.palePine, border: C.pine, color: C.pine, font: FONT.mono, size: 28 });
    addNode(slide, "DATA", 554, top + 86, 172, 80, { fill: C.pine, border: C.pine, color: C.cream, font: FONT.mono, size: 22 });
    addNode(slide, "UPLOAD + ASK", 874, top + 70, 310, 110, { fill: C.white, border: C.ochre, color: C.ochre, font: FONT.mono, size: 27 });
    addText(slide, "?", { x: 564, y: top + 218, w: 152, h: 100, size: 76, color: C.ochre, font: FONT.display, bold: true, align: "center", base: "question-mark" });
    addText(slide, "Both are useful. Neither is universal.", { x: 260, y: top + 330, w: 760, h: 46, size: 25, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "takeaway" });
    finish(slide, 2, "00:01-00:03", "Recall the Session 2 Gemini in Sheets / upload CSV slide. Ask: What could make either route fail?", ["lms/docs/taught/2026-07-workshop-sessions-01-02-reference.pdf"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Retrieval", "60 SECONDS · SOLO");
    addText(slide, "Write one condition that makes an AI data answer unsafe.", { x: 120, y: top + 86, w: 1040, h: 190, size: 52, font: FONT.display, bold: true, align: "center", valign: "middle", base: "prompt" });
    addShape(slide, "rect", { left: 480, top: top + 320, width: 320, height: 54 }, C.beacon, "none", 0, "solo-strip");
    addText(slide, "60 SECONDS · SOLO", { x: 490, y: top + 330, w: 300, h: 34, size: 17, color: C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "solo-label" });
    finish(slide, 3, "00:03-00:05", "Take three answers: scale, missing data, unclear question. If students mention hallucination, ask what hallucination looks like in arithmetic.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Same data. Two answers.", "VOTE BEFORE DISCUSSION");
    addShape(slide, "rect", { left: 84, top: top + 42, width: 510, height: 230 }, C.pine, C.pine, 1, "answer-a-bg");
    addText(slide, "ANSWER A", { x: 112, y: top + 68, w: 454, h: 34, size: 17, color: C.beacon, font: FONT.mono, bold: true, base: "answer-a-label" });
    addText(slide, "RESULT REDACTED", { x: 112, y: top + 128, w: 454, h: 82, size: 36, color: C.cream, font: FONT.display, bold: true, align: "center", valign: "middle", base: "answer-a-value" });
    addShape(slide, "rect", { left: 686, top: top + 42, width: 510, height: 230 }, C.white, C.sand, 2, "answer-b-bg");
    addText(slide, "ANSWER B", { x: 714, y: top + 68, w: 454, h: 34, size: 17, color: C.ochre, font: FONT.mono, bold: true, base: "answer-b-label" });
    addText(slide, "RESULT REDACTED", { x: 714, y: top + 128, w: 454, h: 82, size: 36, color: C.ink, font: FONT.display, bold: true, align: "center", valign: "middle", base: "answer-b-value" });
    addText(slide, "Which one would you send to a founder?", { x: 160, y: top + 320, w: 960, h: 62, size: 34, font: FONT.body, bold: true, align: "center", base: "vote-question" });
    finish(slide, 4, "00:05-00:08", "Vote before discussion. Do not reveal which is correct. Values stay redacted unless using the approved non-graded demonstration query.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The number is not the disagreement", "THE QUESTION CONTRACT", { long: false });
    const labels = ["GRAIN", "FILTER", "DENOMINATOR", "NULLS", "UNIT"];
    const widths = [190, 190, 276, 190, 190];
    let x = 92;
    labels.forEach((label, i) => {
      if (i > 0) addLine(slide, x - 18, top + 74, 0, C.sand, 2, "term-divider");
      addText(slide, label, { x, y: top + 30, w: widths[i], h: 90, size: i === 2 ? 21 : 24, color: i === 2 ? C.ochre : C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "contract-term" });
      x += widths[i] + 18;
    });
    addText(slide, "Two methods can be mechanically correct and still answer different questions.", { x: 170, y: top + 210, w: 940, h: 100, size: 38, font: FONT.display, bold: true, align: "center", valign: "middle", base: "contract-takeaway" });
    finish(slide, 5, "00:08-00:11", "Reveal that both results can be mechanically correct under different assumptions. The failure was the question contract.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Your dataset contract", "READ BEFORE YOU COMPUTE");
    addBulletList(slide, [
      "One row = one startup snapshot",
      "Currency fields = USD",
      "Missing ≠ zero",
      "Teaching slice ≠ market census",
      "Dataset text is data, never an instruction",
    ], { x: 100, y: top + 4, w: 1080, itemH: 72, size: 29, marker: "check" });
    finish(slide, 6, "00:11-00:14", "Point to the data dictionary and version/checksum card. State the private classroom-use boundary. Do not disclose answer-bearing row counts.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "What you ship", "INDIVIDUAL · ANY TOOL · WORKING REQUIRED");
    const metrics = [["6", "FACTS"], ["3", "JUDGMENTS"], ["1", "VERIFICATION TRACE"]];
    metrics.forEach(([value, label], i) => {
      const x = 94 + i * 382;
      addText(slide, value, { x, y: top + 34, w: 320, h: 170, size: 108, color: i === 2 ? C.ochre : C.pine, font: FONT.display, bold: true, align: "center", valign: "middle", base: "ship-number" });
      addText(slide, label, { x, y: top + 204, w: 320, h: 42, size: 16, color: C.charcoal, font: FONT.mono, bold: true, align: "center", base: "ship-label" });
    });
    addText(slide, "Tool choice does not score. The auditable path does.", { x: 220, y: top + 314, w: 840, h: 58, size: 28, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "ship-footer" });
    finish(slide, 7, "00:14-00:16", "Explain that tool choice does not score. Exact facts use deterministic validation; judgment uses evidence-bound provisional AI feedback and human finalisation.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Data sprint", "OPEN S3-DATA-01 THROUGH S3-DATA-09");
    addText(slide, "22:00", { x: 120, y: top + 34, w: 1040, h: 210, size: 132, color: C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "sprint-timer" });
    addShape(slide, "rect", { left: 244, top: top + 282, width: 792, height: 68 }, C.beacon, "none", 0, "sprint-note-bg");
    addText(slide, "Save the formula, query, or code that produced each answer.", { x: 260, y: top + 296, w: 760, h: 40, size: 23, color: C.pine, font: FONT.body, bold: true, align: "center", valign: "middle", base: "sprint-note" });
    finish(slide, 8, "00:16-00:17", "Start the visible timer. The next slide stays up during work. State the spoken start and end.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The working screen", "21 MINUTES · KEEP THIS VISIBLE");
    addBulletList(slide, [
      "Name the grain.",
      "State the inclusion rule.",
      "Run the method.",
      "Record units and rounding.",
      "Flag a limitation.",
    ], { x: 110, y: top + 4, w: 1060, itemH: 72, size: 30, marker: "number" });
    finish(slide, 9, "00:17-00:38", "Circulate. Use recovery prompts, not answer confirmation. At 10 minutes: If you only have a number, you are halfway.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Freeze. Inspect.", "PAIR CHECK · FILTERS + DENOMINATOR");
    addText(slide, "Pick one answer.", { x: 120, y: top + 58, w: 1040, h: 86, size: 52, font: FONT.display, bold: true, align: "center", base: "freeze-line-1" });
    addText(slide, "What did your method silently exclude?", { x: 120, y: top + 176, w: 1040, h: 100, size: 48, color: C.ochre, font: FONT.display, italic: true, align: "center", base: "freeze-line-2" });
    addLine(slide, 408, top + 328, 464, C.pine, 3, "freeze-rule");
    finish(slide, 10, "00:38-00:41", "Ask learners to snapshot their draft. Pair-check filters and denominator.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "A formula can be wrong beautifully", "OPEN-COLUMN BLANK TRAP", { long: true });
    addShape(slide, "rect", { left: 112, top: top + 18, width: 1056, height: 104 }, C.pine, "none", 0, "formula-bg");
    addText(slide, "COUNTBLANK(G:G)", { x: 140, y: top + 40, w: 1000, h: 60, size: 43, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "formula" });
    addText(slide, "unused sheet rows", { x: 180, y: top + 176, w: 380, h: 48, size: 28, color: C.ochre, font: FONT.body, bold: true, base: "bad-assumption" });
    addLine(slide, 170, top + 201, 400, C.ochre, 4, "strike");
    addArrow(slide, 576, top + 190, 108, 20, C.sand);
    addText(slide, "count blank G only where record_id exists", { x: 710, y: top + 166, w: 390, h: 84, size: 26, color: C.pine, font: FONT.body, bold: true, align: "center", valign: "middle", base: "repair" });
    addText(slide, "The repaired formula names the population before it counts.", { x: 240, y: top + 300, w: 800, h: 52, size: 25, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "formula-takeaway" });
    finish(slide, 11, "00:41-00:46", "Demonstrate the open-column blank trap, then repair it. Reveal the assumption, not any graded answer.", ["https://support.google.com/docs/table/25273?hl=en"]);
  }

  {
    const slide = newSlide(presentation, C.pine);
    addKicker(slide, "THE WALL · PRIVATE MANIFEST", { x: 64, y: 58, dark: true });
    addText(slide, "14,420,414", { x: 64, y: 144, w: 1152, h: 190, size: 132, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "token-count" });
    addText(slide, "tokens", { x: 470, y: 346, w: 340, h: 56, size: 35, color: C.beacon, font: FONT.display, italic: true, align: "center", base: "token-unit" });
    addText(slide, "WHOLE-FILE CHAT IS NOW A BET, NOT A METHOD.", { x: 120, y: 438, w: 1040, h: 70, size: 28, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "wall-claim" });
    addText(slide, "cl100k_base · tiktoken 0.12.0 · uncompressed JSONL", { x: 320, y: 548, w: 640, h: 30, size: 12, color: "#C7D3CE", font: FONT.mono, align: "center", base: "wall-trace" });
    finish(slide, 12, "00:46-00:51", "Show the exact token-count method. Product limits vary and change; the durable constraint is reliability and repeatability, not one upload limit.", ["lms/docs/build/10_sessions_3_5_redesign_brief.md"], true);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Don’t fight the wall", "BRING THE METHOD TO THE DATA");
    addArrow(slide, 352, top + 132, 100, 18, C.sand);
    addArrow(slide, 826, top + 132, 100, 18, C.sand);
    addNode(slide, "FORMULA\nin the sheet", 78, top + 62, 286, 158, { fill: C.palePine, border: C.pine, color: C.pine, size: 28 });
    addNode(slide, "SCHEMA + SAMPLE\nto draft code", 458, top + 62, 364, 158, { fill: C.white, border: C.ochre, color: C.ochre, size: 27 });
    addNode(slide, "SCRIPT / NOTEBOOK\nagainst full file", 916, top + 62, 286, 158, { fill: C.palePine, border: C.pine, color: C.pine, size: 25 });
    addText(slide, "A sample designs the method. The full file produces the answer.", { x: 170, y: top + 294, w: 940, h: 64, size: 29, color: C.charcoal, font: FONT.display, italic: true, align: "center", valign: "middle", base: "wall-method" });
    finish(slide, 13, "00:51-00:54", "A schema/sample is for designing the method, not estimating the final answer. The gated file is gzip-compressed JSON Lines: one focal-startup/peer-startup comparison per line.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Six escalating moves", "OPTIONS, NOT MATURITY BADGES");
    const labels = ["Inspect", "Ask", "Formula", "Schema + sample", "Execute code", "Verify + visualise"];
    const x0 = 72;
    const gap = 16;
    const nodeW = 176;
    for (let i = 0; i < 5; i += 1) addArrow(slide, x0 + nodeW + i * (nodeW + gap) - 2, top + 116, gap + 12, 14, C.sand);
    labels.forEach((label, i) => {
      const x = x0 + i * (nodeW + gap);
      addText(slide, String(i + 1).padStart(2, "0"), { x, y: top + 38, w: nodeW, h: 38, size: 18, color: i === 5 ? C.ochre : C.pine, font: FONT.mono, bold: true, align: "center", base: "move-number" });
      addNode(slide, label, x, top + 84, nodeW, 96, { fill: i === 5 ? C.paleOchre : C.white, border: i === 5 ? C.ochre : C.sand, color: i === 5 ? C.ochre : C.ink, size: label.length > 15 ? 19 : 22 });
    });
    addText(slide, "Use the smallest reproducible method that manages the risk.", { x: 170, y: top + 272, w: 940, h: 72, size: 34, font: FONT.display, bold: true, align: "center", valign: "middle", base: "moves-takeaway" });
    finish(slide, 14, "00:54-00:58", "These are options, not maturity badges. The smallest reproducible method that manages the risk is usually best.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Pick the route", "SUBMIT S3-SCALE-01 FIRST");
    addFlatTable(slide, ["NEED", "ROUTE"], [
      ["one bounded aggregate, sheet already open", "formula / pivot"],
      ["repeat across versions or many groups", "script / notebook"],
      ["file cannot enter chat", "schema + sample to draft code"],
      ["answer affects a real decision", "independent verification"],
    ], { y: top + 4, rowH: 72, colWidths: [720, 432], fontSize: 22 });
    finish(slide, 15, "00:58-01:00", "Learners submit S3-SCALE-01 before choosing a lane.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Formula lane", "ASK AI · RUN IT YOURSELF");
    addText(slide, "Ask AI for the formula. Run it yourself.", { x: 128, y: top + 28, w: 1024, h: 90, size: 44, font: FONT.display, bold: true, align: "center", valign: "middle", base: "formula-lane-claim" });
    addShape(slide, "rect", { left: 112, top: top + 164, width: 1056, height: 126 }, C.pine, "none", 0, "formula-skeleton-bg");
    addText(slide, "grain + column + inclusion rule + unit + rounding + error behavior", { x: 144, y: top + 188, w: 992, h: 78, size: 24, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "formula-skeleton" });
    finish(slide, 16, "01:00-01:04", "Model a non-graded formula request. Supported learners stay in this lane.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Schema + sample lane", "SHAPE FIRST · POPULATION LATER");
    addText(slide, "The sample teaches shape.", { x: 130, y: top + 24, w: 1020, h: 66, size: 44, font: FONT.display, bold: true, align: "center", base: "sample-line-1" });
    addText(slide, "The full file produces the answer.", { x: 130, y: top + 98, w: 1020, h: 70, size: 43, color: C.ochre, font: FONT.display, italic: true, align: "center", base: "sample-line-2" });
    const items = ["exact columns", "types", "null policy", "output contract", "assertions"];
    items.forEach((item, i) => {
      const x = 88 + i * 222;
      addLine(slide, x, top + 238, 194, i === 4 ? C.ochre : C.pine, 4, "check-rule");
      addText(slide, item, { x, y: top + 252, w: 194, h: 64, size: 19, color: C.ink, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "sample-check" });
    });
    finish(slide, 17, "01:04-01:07", "Point out that a sample can omit rare categories and outliers. It cannot support a population answer.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Colab lane", "READ · ASSERT · COMPUTE · EXPORT");
    addShape(slide, "rect", { left: 104, top: top + 18, width: 1072, height: 264 }, C.pine, "none", 0, "code-bg");
    addText(slide, "records = pd.read_json(DATA_FILE, lines=True, compression=\"gzip\")\nfocal = pd.json_normalize(records[\"focal\"])\nassert required_columns <= set(focal.columns)", { x: 148, y: top + 58, w: 984, h: 174, size: 24, color: C.cream, font: FONT.mono, bold: false, base: "code" });
    addText(slide, "A runtime is not an oracle. Review and run the code.", { x: 194, y: top + 326, w: 892, h: 54, size: 27, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "colab-takeaway" });
    finish(slide, 18, "01:07-01:10", "Explain that Colab is a runtime, not an oracle. Learners review and run the code.", ["https://research.google.com/colaboratory/intl/en-GB/faq.html", "https://pandas.pydata.org/pandas-docs/stable/reference/io.html"]);
  }

  {
    const slide = newSlide(presentation);
    addTimer(slide, session, "01:10-01:22", 19, total, "12:00", "BUILD · PRODUCE ONE AGGREGATE", "FORMULA LANE or COLAB LANE · evidence = method + output + one check");
    setNotes(slide, "01:10-01:22", "Instructor and TA split lanes. If Colab fails, use the local runner or formula-equivalent extract in the fallback pack. State the spoken start and end.", source);
  }

  {
    const slide = newSlide(presentation, C.pine);
    const top = addHeader(slide, "Two methods or it didn’t happen", "INDEPENDENCE MATTERS", { dark: true, long: true });
    addArrow(slide, 384, top + 104, 118, 18, "#46635D");
    addArrow(slide, 778, top + 104, 118, 18, "#46635D");
    addNode(slide, "METHOD A\nresult", 96, top + 42, 300, 142, { fill: "#294A43", border: "#6B8A82", color: C.cream, font: FONT.mono, size: 24 });
    addNode(slide, "METHOD B\nresult", 492, top + 42, 300, 142, { fill: "#294A43", border: "#6B8A82", color: C.cream, font: FONT.mono, size: 24 });
    addNode(slide, "GAP\nexplain", 886, top + 42, 300, 142, { fill: C.ochre, border: C.ochre, color: C.cream, font: FONT.mono, size: 24 });
    addText(slide, "Two prompts to the same model are not independent.", { x: 170, y: top + 254, w: 940, h: 78, size: 34, color: C.beacon, font: FONT.display, italic: true, align: "center", valign: "middle", base: "independence" });
    finish(slide, 20, "01:22-01:26", "Two prompts to the same model are not independent. Formula vs pivot, or Sheets vs pandas, are stronger pairs.", [], true);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The five verification moves", "COMPLETE S3-DATA-10");
    addBulletList(slide, [
      "Reconcile the base",
      "Recompute one number",
      "Bounds and smell",
      "Ask for the working",
      "Recompute through a different mechanism",
    ], { x: 112, y: top + 6, w: 1050, itemH: 70, size: 30, marker: "number" });
    finish(slide, 21, "01:26-01:31", "This mechanic is deliberately retained from the earlier data lab. Learners complete S3-DATA-10.", ["lms/docs/taught/2026-07-workshop-sessions-01-02-reference.pdf"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "A chart answers a job", "NAME THE JOB BEFORE THE CHART");
    const jobs = ["COMPARE", "DISTRIBUTE", "RELATE", "CHANGE", "COMPOSE"];
    jobs.forEach((job, i) => {
      const x = 76 + i * 229;
      addText(slide, String(i + 1).padStart(2, "0"), { x, y: top + 34, w: 190, h: 34, size: 16, color: C.ochre, font: FONT.mono, bold: true, align: "center", base: "job-number" });
      addLine(slide, x, top + 74, 190, i === 3 ? C.ochre : C.pine, 4, "job-rule");
      addText(slide, job, { x, y: top + 96, w: 190, h: 72, size: 19, color: C.ink, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "job-label" });
    });
    addText(slide, "A snapshot growth rate is not a time series.", { x: 180, y: top + 260, w: 920, h: 82, size: 38, font: FONT.display, italic: true, align: "center", valign: "middle", base: "chart-guardrail" });
    finish(slide, 22, "01:31-01:35", "Give one one-line example for each job. A snapshot growth rate is not a time series.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Pretty can still mislead", "SAME DEMO VALUES · DIFFERENT BELIEF");
    const panels = [
      { x: 64, title: "TRUNCATED AXIS", baseline: top + 238, bar1: 150, bar2: 204, color: C.ochre },
      { x: 664, title: "ZERO BASELINE", baseline: top + 300, bar1: 118, bar2: 142, color: C.pine },
    ];
    panels.forEach((panel, p) => {
      addShape(slide, "rect", { left: panel.x, top: top + 18, width: 552, height: 350 }, C.white, C.sand, 1, "chart-panel");
      addText(slide, panel.title, { x: panel.x + 24, y: top + 36, w: 504, h: 30, size: 16, color: p === 0 ? C.ochre : C.pine, font: FONT.mono, bold: true, base: "chart-title" });
      addLine(slide, panel.x + 60, panel.baseline, 432, C.charcoal, 1.5, "chart-axis");
      addText(slide, p === 0 ? "TRUNCATED RANGE" : "0", { x: panel.x + 16, y: panel.baseline - 10, w: 86, h: 24, size: 11, color: C.clay, font: FONT.mono, base: "axis-label" });
      addShape(slide, "rect", { left: panel.x + 154, top: panel.baseline - panel.bar1, width: 96, height: panel.bar1 }, panel.color, "none", 0, "bar-a");
      addShape(slide, "rect", { left: panel.x + 322, top: panel.baseline - panel.bar2, width: 96, height: panel.bar2 }, panel.color, "none", 0, "bar-b");
      addText(slide, "DEMO A\nn = DEMO", { x: panel.x + 134, y: panel.baseline + 12, w: 136, h: 48, size: 12, color: C.charcoal, font: FONT.mono, align: "center", base: "bar-a-label" });
      addText(slide, "DEMO B\nn = DEMO", { x: panel.x + 302, y: panel.baseline + 12, w: 136, h: 48, size: 12, color: C.charcoal, font: FONT.mono, align: "center", base: "bar-b-label" });
    });
    addText(slide, "Text summary: the truncated baseline exaggerates the same demo gap. Missingness: annotate in the live demo.", { x: 120, y: top + 388, w: 1040, h: 42, size: 18, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "chart-summary" });
    finish(slide, 23, "01:35-01:39", "Ask what belief the first chart exaggerates. Call out missingness annotation and selection bias. Use only the approved non-graded demonstration comparison.");
  }

  {
    const slide = newSlide(presentation);
    addTimer(slide, session, "01:39-01:54", 24, total, "15:00", "VISUALIZATION CHECK · SIX SCENARIOS", "Choose the visual. Defend why. · INDIVIDUAL");
    setNotes(slide, "01:39-01:54", "Open S3-VIZ-*; no coaching. Rationale should name the decision, data shape and one guardrail. The slide remains visible for the full 15 minutes.", source);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Ship proof, not confidence", "BEFORE SUBMIT");
    addBulletList(slide, [
      "version + checksum",
      "assumptions + denominator",
      "working",
      "two-method trace",
      "limitation",
      "no private rows on public surfaces",
    ], { x: 104, y: top - 4, w: 1070, itemH: 58, size: 26, marker: "check" });
    finish(slide, 25, "01:54-01:58", "Keep artifact gate open to the published deadline. Visual check may close now. Point to the separate public-safe memo template; learners start it after class, not during ship time.", ["lms/docs/build/01_scoring_methodology.md", "lms/course/session-03/public-safe-portfolio-data-memo-template.md"]);
  }

  {
    const slide = newSlide(presentation, C.pine);
    addKicker(slide, "UP NEXT · SESSION 04", { x: 64, y: 64, dark: true });
    addText(slide, "Turn evidence into a product.", { x: 64, y: 154, w: 1130, h: 130, size: 76, color: C.cream, font: FONT.display, bold: true, base: "closing-title" });
    addShape(slide, "rect", { left: 64, top: 332, width: 8, height: 144 }, C.ochre, "none", 0, "closing-accent");
    addText(slide, "Session 4: rebuild a proven product in Lovable.", { x: 104, y: 342, w: 1030, h: 72, size: 39, color: C.beacon, font: FONT.display, italic: true, base: "closing-bridge" });
    addText(slide, "Data helps choose the bet. A feature contract makes it buildable.", { x: 104, y: 428, w: 1030, h: 54, size: 25, color: "#C7D3CE", font: FONT.body, base: "closing-sub" });
    finish(slide, 26, "01:58-02:00", "Ask learners to record the 24-hour post-class memo deadline and exact portfolio label: Session 3 public-safe data memo. The memo covers problem, grain/schema, method, independent verification, and limitation/ethics, with no TrustMRR row, derived value, or screenshot. Do not begin it in class or preview the selected product's row-level evidence.", ["lms/docs/taught/2026-07-session-01-industry-maps.html", "lms/course/session-03/public-safe-portfolio-data-memo-template.md"], true);
  }

  return presentation;
}

function buildSession4() {
  const source = "lms/course/session-04/02-deck-script.md";
  const presentation = makePresentation("Session 04 - A $30K clue is not a build brief");
  const total = 21;
  const session = "SESSION 04";
  const finish = (slide, index, timing, note, sources = [], dark = false) => {
    addFooter(slide, session, timing, index, total, dark);
    setNotes(slide, timing, note, source, sources);
  };

  {
    const slide = newSlide(presentation);
    addShape(slide, "rect", { left: 0, top: 0, width: W, height: 8 }, C.ochre, "none", 0, "cover-rule");
    addKicker(slide, "SESSION 04 · BUILD FIRST", { x: 64, y: 68 });
    addText(slide, "A $30K clue is not a build brief", { x: 64, y: 142, w: 1050, h: 172, size: 74, font: FONT.display, bold: true, base: "cover-title" });
    addText(slide, "about $30K MRR · public snapshot · 30 Jul 2026", { x: 68, y: 344, w: 560, h: 38, size: 17, color: C.ochre, font: FONT.mono, bold: true, base: "revenue-clue" });
    const steps = ["EVIDENCE", "CONTRACT", "PROMPT", "WORKING APP", "PROOF"];
    steps.forEach((step, i) => {
      if (i < steps.length - 1) addArrow(slide, 172 + i * 226, 493, 80, 14, C.sand);
      addText(slide, step, { x: 62 + i * 226, y: 466, w: 160, h: 58, size: 14, color: i === 4 ? C.ochre : C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "cover-step" });
    });
    finish(slide, 1, "00:00-00:02", "Today we will ship. The revenue clue establishes that a customer problem may be valuable. Our job is to decide which behavior we can make true in one hour.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "By 116 minutes, submit this", "THE V1 EVIDENCE PACKAGE");
    const items = [
      ["01", "product + sources"],
      ["02", "feature contract + first prompt"],
      ["03", "public V1 URL"],
      ["04", "acceptance-test evidence"],
    ];
    items.forEach(([n, label], i) => {
      const y = top + 6 + i * 84;
      addText(slide, n, { x: 96, y, w: 72, h: 56, size: 18, color: C.ochre, font: FONT.mono, bold: true, valign: "middle", base: "field-number" });
      addLine(slide, 176, y + 28, 80, C.sand, 2, "field-rule");
      addText(slide, label, { x: 278, y, w: 850, h: 56, size: 30, color: C.ink, font: FONT.body, bold: true, valign: "middle", base: "field-label" });
    });
    addText(slide, "A truthful failed test is evidence. A pretty URL without tests is not.", { x: 160, y: top + 370, w: 960, h: 54, size: 24, color: C.charcoal, font: FONT.display, italic: true, align: "center", base: "submission-truth" });
    finish(slide, 2, "00:02-00:04", "V2 comes later; do not lead with the extra-credit feeling. A truthful failed test is evidence. A pretty URL without tests is not.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "What should win?", "VOTE · WRITE ONE REASON");
    const choices = ["Highest revenue", "Easiest interface", "Strongest one-hour proof"];
    choices.forEach((choice, i) => {
      const x = 64 + i * 392;
      addLine(slide, x, top + 14, 344, C.ochre, 4, "choice-rule");
      addText(slide, String(i + 1).padStart(2, "0"), { x, y: top + 40, w: 344, h: 72, size: 42, color: C.ochre, font: FONT.display, bold: true, align: "center", base: "choice-number" });
      addText(slide, choice, { x: x + 18, y: top + 142, w: 308, h: 118, size: 29, color: C.ink, font: FONT.body, bold: true, align: "center", valign: "middle", base: "choice-label" });
    });
    addText(slide, "Hold the answer. Method and evidence beat a confident output.", { x: 180, y: top + 328, w: 920, h: 56, size: 25, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "vote-hold" });
    finish(slide, 3, "00:04-00:10", "Hold the answer. Connect to Session 3: method/evidence beats a confident output.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Three credible products", "PUBLIC SOURCE CHECK · 30 JUL 2026 · METRICS MOVE");
    addFlatTable(slide, ["LIINKS", "HABITKIT", "QR CODE AI"], [
      ["≈$30K MRR", "≈$30K MRR", "≈$14K MRR"],
      ["creator page builder", "habit tracker", "branded QR platform"],
    ], { y: top + 20, rowH: 104, fontSize: 24 });
    addText(slide, "Rounded current snapshots · original text only · no logos or screenshots", { x: 150, y: top + 340, w: 980, h: 42, size: 18, color: C.charcoal, font: FONT.mono, align: "center", base: "metrics-note" });
    finish(slide, 4, "00:10-00:13", "Values are rounded, current snapshots. TrustMRR public pages describe provider verification; metrics drift. Founder site independently supports Liinks’ $30K+ scale.", ["https://trustmrr.com/startup/liinks", "https://trustmrr.com/startup/habitkit", "https://trustmrr.com/startup/qr-code-ai", "https://charlieclark.co/"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Liinks leads: 96† / 100", "REVENUE IS 20 OF 100");
    const scores = [
      ["Revenue", 19], ["Feasibility†", 24], ["Teachability", 20], ["Free-credit fit†", 14], ["Integration fit", 9], ["Testability", 10],
    ];
    let x = 76;
    scores.forEach(([label, score], i) => {
      const width = 112 + Number(score) * 5.2;
      addShape(slide, "rect", { left: x, top: top + 62, width, height: 92 }, i === 1 ? C.ochre : C.pine, "none", 0, "score-segment");
      addText(slide, String(score), { x: x + 10, y: top + 76, w: width - 20, h: 40, size: 28, color: C.cream, font: FONT.mono, bold: true, base: "score-value" });
      addText(slide, label, { x: x + 10, y: top + 120, w: width - 20, h: 28, size: 11, color: C.cream, font: FONT.mono, base: "score-label" });
      x += width + 5;
    });
    addText(slide, "HabitKit 89", { x: 160, y: top + 214, w: 380, h: 56, size: 30, color: C.charcoal, font: FONT.display, bold: true, align: "center", base: "comparison-1" });
    addText(slide, "QR Code AI 71", { x: 740, y: top + 214, w: 380, h: 56, size: 30, color: C.charcoal, font: FONT.display, bold: true, align: "center", base: "comparison-2" });
    addText(slide, "† Classroom feasibility release-gated by the golden run", { x: 180, y: top + 310, w: 920, h: 44, size: 17, color: C.ochre, font: FONT.mono, bold: true, align: "center", base: "release-gate" });
    finish(slide, 5, "00:13-00:17", "Revenue is 20 of 100. A product can be successful and still be a poor classroom build. Liinks is the frozen instructor candidate; one-hour and credit-fit scores remain provisional until the golden run and learner dry run pass.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "One app. Three roles.", "CRUD · PUBLIC CONSUMPTION · BEHAVIORAL EVIDENCE");
    addArrow(slide, 366, top + 128, 124, 20, C.sand);
    addArrow(slide, 790, top + 128, 124, 20, C.sand);
    addNode(slide, "CREATOR\nedit", 90, top + 60, 300, 160, { fill: C.palePine, border: C.pine, color: C.pine, font: FONT.mono, size: 29 });
    addNode(slide, "PUBLIC VISITOR\nclick", 490, top + 60, 300, 160, { fill: C.white, border: C.ochre, color: C.ochre, font: FONT.mono, size: 27 });
    addNode(slide, "OPERATOR\nlearn", 890, top + 60, 300, 160, { fill: C.palePine, border: C.pine, color: C.pine, font: FONT.mono, size: 29 });
    addText(slide, "Rich enough to teach state, consumption, and evidence - bounded enough to ship.", { x: 140, y: top + 296, w: 1000, h: 66, size: 29, font: FONT.display, italic: true, align: "center", valign: "middle", base: "roles-takeaway" });
    finish(slide, 6, "00:17-00:20", "This is why the pattern is rich enough: CRUD/state, public consumption and behavioral evidence.");
  }

  {
    const slide = newSlide(presentation, C.pine);
    const top = addHeader(slide, "Study behavior. Do not borrow identity.", "NON-AFFILIATION · HARD BOUNDARIES", { dark: true, long: true });
    addText(slide, "Functional benchmark", { x: 96, y: top + 22, w: 440, h: 54, size: 28, color: C.cream, font: FONT.body, bold: true, base: "boundary-label-1" });
    addText(slide, "YES", { x: 950, y: top + 22, w: 220, h: 54, size: 24, color: C.beacon, font: FONT.mono, bold: true, align: "right", base: "boundary-value-1" });
    addLine(slide, 96, top + 92, 1074, "#46635D", 1, "boundary-rule-1");
    addText(slide, "Name, logo, copy, assets, code, customer data, trade dress", { x: 96, y: top + 110, w: 830, h: 76, size: 25, color: C.cream, font: FONT.body, bold: true, base: "boundary-label-2" });
    addText(slide, "NO", { x: 950, y: top + 110, w: 220, h: 60, size: 24, color: C.ochre, font: FONT.mono, bold: true, align: "right", base: "boundary-value-2" });
    addLine(slide, 96, top + 204, 1074, "#46635D", 1, "boundary-rule-2");
    addText(slide, "Unlabelled fake integration", { x: 96, y: top + 224, w: 720, h: 58, size: 28, color: C.cream, font: FONT.body, bold: true, base: "boundary-label-3" });
    addText(slide, "NO", { x: 950, y: top + 224, w: 220, h: 58, size: 24, color: C.ochre, font: FONT.mono, bold: true, align: "right", base: "boundary-value-3" });
    finish(slide, 7, "00:20-00:24", "Read the non-affiliation statement. Complete means the classroom contract, not mature commercial parity.", [], true);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The commercial surface is larger than one hour", "SELECT A VERTICAL SLICE", { long: true });
    const leftLabels = [["BLOCKS", 86, 28], ["MEDIA", 86, 118], ["FORMS", 86, 208], ["AUDIENCE", 86, 298]];
    const rightLabels = [["ANALYTICS", 958, 28], ["DOMAINS", 958, 118], ["PROFILES", 958, 208], ["API", 958, 298]];
    [...leftLabels, ...rightLabels].forEach(([label, x, offset], i) => {
      addLine(slide, x < 500 ? x + 216 : 858, top + offset + 28, 98, i < 4 ? C.pine : C.sand, 1.5, "capability-link");
      addText(slide, label, { x, y: top + offset, w: 220, h: 56, size: 21, color: i < 4 ? C.pine : C.charcoal, font: FONT.mono, bold: true, align: x < 500 ? "right" : "left", valign: "middle", base: "capability" });
    });
    addShape(slide, "rect", { left: 404, top: top + 80, width: 452, height: 214 }, C.pine, "none", 0, "creator-page-bg");
    addText(slide, "CREATOR PAGE", { x: 444, y: top + 138, w: 372, h: 58, size: 30, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "creator-page" });
    addText(slide, "core six in contract\nexternal boundaries named", { x: 454, y: top + 204, w: 352, h: 62, size: 22, color: C.beacon, font: FONT.body, align: "center", valign: "middle", base: "creator-page-sub" });
    finish(slide, 8, "00:24-00:27", "Liinks’ current docs show a broad block catalogue, richer analytics, domains and API. We will select a vertical slice and name omissions honestly.", ["https://www.liinks.co/help/article/block-types", "https://www.liinks.co/help/article/how-do-i-see-how-my-page-is-performing", "https://www.liinks.co/help/article/public-api"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Scope is a promise", "THE CLASSROOM CONTRACT");
    addShape(slide, "rect", { left: 106, top: top + 18, width: 1068, height: 260 }, C.white, C.sand, 2, "contract-page");
    addText(slide, "Build an original creator page builder whose agreed core works end to end.", { x: 154, y: top + 56, w: 972, h: 104, size: 38, font: FONT.display, bold: true, align: "center", valign: "middle", base: "contract-claim" });
    addText(slide, "IDENTITY · SIX BLOCKS · ORDERING · DESIGN · SHARE · DEMO ANALYTICS · FAILURES", { x: 144, y: top + 194, w: 992, h: 42, size: 19, color: C.ochre, font: FONT.mono, bold: true, align: "center", base: "contract-fields" });
    addLine(slide, 280, top + 330, 720, C.pine, 1.5, "signature-line");
    addText(slide, "CORE · MOCKED · OUT OF SCOPE", { x: 406, y: top + 342, w: 468, h: 32, size: 17, color: C.charcoal, font: FONT.mono, align: "center", base: "signature-label" });
    finish(slide, 9, "00:27-00:30", "Explain core, mocked and out-of-scope labels. Every team must adapt the fictional persona, message hierarchy and one core use case using public evidence only; an unchanged generic fixture is capped at 6/10 for Relevance.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Proof comes before polish", "RELEASE CHECKPOINT");
    addText(slide, "18", { x: 86, y: top + 22, w: 430, h: 230, size: 160, color: C.ochre, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "test-count" });
    addText(slide, "TESTS", { x: 120, y: top + 260, w: 362, h: 52, size: 23, color: C.charcoal, font: FONT.mono, bold: true, align: "center", base: "test-label" });
    addLine(slide, 544, top + 24, 0, C.sand, 2, "test-divider");
    addText(slide, "15 core", { x: 614, y: top + 42, w: 520, h: 68, size: 42, color: C.pine, font: FONT.display, bold: true, base: "core-tests" });
    addText(slide, "3 publish / access", { x: 614, y: top + 130, w: 520, h: 68, size: 42, color: C.ochre, font: FONT.display, italic: true, base: "access-tests" });
    addText(slide, "invalid URL · hide block · refresh · incognito · keyboard", { x: 580, y: top + 238, w: 590, h: 70, size: 20, color: C.charcoal, font: FONT.mono, base: "test-examples" });
    finish(slide, 10, "00:30-00:32", "Tests tell Lovable what done means and tell us when to stop. Release checkpoint.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "A first prompt is an operating contract", "INSTRUCTOR-ONLY REVEAL · AFTER CHECKPOINT", { long: true });
    addShape(slide, "rect", { left: 428, top: top + 94, width: 424, height: 154 }, C.pine, "none", 0, "prompt-page-bg");
    addText(slide, "FIRST PROMPT", { x: 468, y: top + 130, w: 344, h: 50, size: 29, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "prompt-page-title" });
    addText(slide, "operating contract", { x: 468, y: top + 188, w: 344, h: 34, size: 20, color: C.beacon, font: FONT.display, italic: true, align: "center", base: "prompt-page-sub" });
    const labels = ["USER", "JOB", "STATE", "INTERACTIONS", "FAILURES", "BOUNDARIES", "ACCESS", "TESTS"];
    labels.forEach((label, i) => {
      const topRow = i < 4;
      const x = 72 + (i % 4) * 296;
      const y = topRow ? top + 16 : top + 300;
      addText(slide, label, { x, y, w: 248, h: 46, size: 16, color: i === 7 ? C.ochre : C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "prompt-label" });
      addLine(slide, x + 124, topRow ? y + 54 : y - 54, 0, C.sand, 1.5, "prompt-link");
    });
    finish(slide, 11, "00:32-00:35", "Contrast with Clone Liinks exactly. Do not distribute this slide before the first-prompt checkpoint closes. Evaluator-only boundary: instructor-only reveal.");
  }

  {
    const slide = newSlide(presentation);
    addTimer(slide, session, "00:35-00:37", 12, total, "60:00", "SHIP CLOCK STARTS NOW", "No new features after minute 49 · last 11 minutes = truth + publication");
    setNotes(slide, "00:35-00:37", "No new features after minute 49. The last eleven minutes belong to truth and publication. State the spoken start and end.", source);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Plan once. Edit directly. Approve.", "ONE BOUNDED PLAN PASS");
    addArrow(slide, 378, top + 126, 106, 18, C.sand);
    addArrow(slide, 796, top + 126, 106, 18, C.sand);
    addNode(slide, "PLAN MODE\n1 credit / message", 86, top + 58, 316, 156, { fill: C.palePine, border: C.pine, color: C.pine, size: 26 });
    addNode(slide, "EDIT\nthe formal plan", 482, top + 58, 316, 156, { fill: C.white, border: C.ochre, color: C.ochre, size: 26 });
    addNode(slide, "APPROVE\nthen build", 878, top + 58, 316, 156, { fill: C.palePine, border: C.pine, color: C.pine, size: 26 });
    addText(slide, "Code changes: none until approval", { x: 296, y: top + 276, w: 688, h: 60, size: 28, color: C.charcoal, font: FONT.display, italic: true, align: "center", valign: "middle", base: "plan-rule" });
    finish(slide, 13, "00:37-00:40", "Current Lovable docs say every Plan message costs one credit and Plan mode does not modify code. If no usable formal plan appears, log NO_FORMAL_PLAN, release the fallback after checkpoint, edit it, then switch to one bounded Build request.", ["https://docs.lovable.dev/features/plan-mode"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The six plan questions", "EDIT THE PLAN DIRECTLY");
    addBulletList(slide, [
      "Truth?",
      "All ATs?",
      "State explicit?",
      "Failures named?",
      "Keyboard path?",
      "Core first?",
    ], { x: 120, y: top - 2, w: 1020, itemH: 58, size: 28, marker: "number" });
    finish(slide, 14, "00:40-00:45", "Edit the plan directly. Remove auth, payment and integration scope. Approve.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Build the vertical slice", "39 MINUTES · KEEP THIS VISIBLE");
    addText(slide, "39:00", { x: 914, y: 28, w: 300, h: 42, size: 30, color: C.ochre, font: FONT.mono, bold: true, align: "right", base: "build-timer" });
    const steps = ["ROUTES", "STATE", "BLOCK LOOP", "DESIGN", "FAILURES", "SHARE"];
    addLine(slide, 110, top + 132, 1060, C.sand, 8, "build-track");
    steps.forEach((step, i) => {
      const x = 110 + i * 212;
      addShape(slide, "rect", { left: x, top: top + 121, width: 22, height: 22 }, i === 5 ? C.ochre : C.pine, "none", 0, "build-tick");
      addText(slide, step, { x: x - 56, y: top + 166, w: 134, h: 54, size: 15, color: i === 5 ? C.ochre : C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "build-step" });
    });
    addText(slide, "CONTRACT / EVIDENCE / SMALLEST NEXT CHANGE", { x: 190, y: top + 286, w: 900, h: 58, size: 22, color: C.charcoal, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "build-mantra" });
    finish(slide, 15, "00:45-01:24", "Leave this slide visible while building. Advance the rail at minutes 53, 67, 77 and 84. Narrate contract / evidence / smallest next change. Stop class-wide only for shared failures.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "A mock must say what it is", "EXACT UI LABELS");
    const labels = [
      "Demo import - no Instagram connection",
      "Demo signup - stored only in this browser",
      "Demo analytics · this browser only",
      "Build agent ≠ AI feature inside the live app",
    ];
    labels.forEach((label, i) => {
      const y = top + 14 + i * 78;
      addShape(slide, "rect", { left: 114, top: y, width: 1052, height: 58 }, i === 3 ? C.paleOchre : C.white, i === 3 ? C.ochre : C.sand, 1.5, "mock-label-bg");
      addText(slide, label, { x: 144, y: y + 10, w: 992, h: 38, size: 23, color: i === 3 ? C.ochre : C.ink, font: FONT.mono, bold: i === 3, align: "center", valign: "middle", base: "mock-label" });
    });
    finish(slide, 16, "01:24-01:30", "No fake geographic audience, API success, emails sent or DNS connection. Lovable’s build agent changes the project; a model call inside the published app is a separate product capability.", ["https://docs.lovable.dev/introduction/credits-and-usage"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Publish is not “ask the chat”", "DIALOG PATH · 0 BUILD CREDITS");
    const steps = ["PUBLISH DIALOG", "SECURITY SCAN", "PUBLIC URL", "INCOGNITO"];
    steps.forEach((step, i) => {
      if (i < 3) addArrow(slide, 320 + i * 300, top + 134, 82, 16, C.sand);
      addNode(slide, step, 66 + i * 300, top + 80, 250, 124, { fill: i === 3 ? C.paleOchre : C.white, border: i === 3 ? C.ochre : C.pine, color: i === 3 ? C.ochre : C.pine, font: FONT.mono, size: 19 });
    });
    addText(slide, "Free / Pro public apps are accessible to anyone with the link. Use dummy data.", { x: 150, y: top + 278, w: 980, h: 64, size: 27, color: C.charcoal, font: FONT.display, italic: true, align: "center", valign: "middle", base: "publish-truth" });
    finish(slide, 17, "01:30-01:35", "Free/Pro public apps are accessible to anyone with the link. Use dummy data. Asking the agent to publish consumes standard chat usage; the dialog is currently free.", ["https://docs.lovable.dev/features/publish"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Swap laptops. Break the claim.", "REVIEWER TESTS BEFORE DESIGN OPINIONS");
    addShape(slide, "rect", { left: 128, top: top + 20, width: 430, height: 278 }, C.white, C.pine, 4, "device-left");
    addShape(slide, "rect", { left: 722, top: top + 20, width: 430, height: 278 }, C.white, C.ochre, 4, "device-right");
    addText(slide, "BUILDER", { x: 178, y: top + 54, w: 330, h: 38, size: 18, color: C.pine, font: FONT.mono, bold: true, align: "center", base: "device-left-label" });
    addText(slide, "REVIEWER", { x: 772, y: top + 54, w: 330, h: 38, size: 18, color: C.ochre, font: FONT.mono, bold: true, align: "center", base: "device-right-label" });
    addText(slide, "Incognito\n390 px\nkeyboard\none invalid input", { x: 192, y: top + 112, w: 302, h: 148, size: 26, color: C.ink, font: FONT.body, align: "center", valign: "middle", base: "device-left-copy" });
    addText(slide, "Run the claim.\nInitial the log.\nReturn only evidence.", { x: 786, y: top + 112, w: 302, h: 148, size: 26, color: C.ink, font: FONT.body, align: "center", valign: "middle", base: "device-right-copy" });
    addArrow(slide, 576, top + 142, 128, 20, C.sand);
    addText(slide, "Builder owns fixes.", { x: 420, y: top + 338, w: 440, h: 50, size: 27, color: C.charcoal, font: FONT.display, italic: true, align: "center", base: "swap-takeaway" });
    finish(slide, 18, "01:35-01:46", "Reviewer runs tests before giving design opinions. Reviewer initials the log; builder owns fixes.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Repair a failed test, not your feelings", "ONE BOUNDED REPAIR", { long: true });
    addShape(slide, "rect", { left: 102, top: top + 26, width: 1076, height: 258 }, C.pine, "none", 0, "repair-prompt-bg");
    addText(slide, "AT-07 + AT-10 fail because disabled state is not persisted.\n\nFix only that path; preserve passing behavior; verify both.", { x: 152, y: top + 72, w: 976, h: 170, size: 28, color: C.cream, font: FONT.mono, base: "repair-prompt" });
    addText(slide, "Broad aesthetic prompts at this point are scope failure.", { x: 230, y: top + 330, w: 820, h: 54, size: 27, color: C.ochre, font: FONT.display, italic: true, align: "center", base: "repair-warning" });
    finish(slide, 19, "01:46-01:52", "Broad aesthetic prompts at this point are scope failure.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "V1 is evidence. V2 is controlled learning.", "AUTO-GRANTED AT V1 RECEIPT · TEN-DAY REVISION ARC", { long: true });
    const moments = [
      ["DAY 0", "V1 + AUTO-GRANT", "receipt starts clock"],
      ["DAYS 1-8", "CHOOSE + REPAIR", "one weakness"],
      ["DAY 9", "REGRESS", "all ATs"],
      ["DAY 10", "V2", "publish + submit"],
    ];
    moments.forEach(([day, label, sub], i) => {
      const x = 54 + i * 306;
      addShape(slide, "rect", { left: x, top: top + 74, width: 254, height: 194 }, i === moments.length - 1 ? C.paleOchre : C.white, i === moments.length - 1 ? C.ochre : C.sand, 2, "v2-stage");
      addText(slide, day, { x: x + 18, y: top + 96, w: 218, h: 30, size: 15, color: C.ochre, font: FONT.mono, bold: true, align: "center", base: "v2-day" });
      addText(slide, label, { x: x + 12, y: top + 144, w: 230, h: 52, size: 20, color: C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "v2-label" });
      addText(slide, sub, { x: x + 18, y: top + 214, w: 218, h: 32, size: 17, color: C.charcoal, font: FONT.body, align: "center", base: "v2-sub" });
      if (i < moments.length - 1) addArrow(slide, x + 262, top + 162, 36, 12, C.pine);
    });
    addText(slide, "Verified 30 Jul 2026 · T-7 recheck: 5/day, up to 30/month · no rollover", { x: 180, y: top + 326, w: 920, h: 40, size: 18, color: C.charcoal, font: FONT.mono, align: "center", base: "credit-fact" });
    finish(slide, 20, "01:52-01:59", "V2 is auto-granted when the V1 receipt is issued; that receipt starts the ten-calendar-day window. Only the instructor may approve an extension or an additional repair permission. Learners cannot self-extend. Latest eligible version is graded; V1 remains in history. Distinguish daily grant exhausted below monthly cap from the 30-credit monthly cap reached. No one must buy credits. Pricing and credit behavior were verified 30 July 2026 and require T-7 recheck.", ["Reviewed Session 04 V1/V2 assessment contract (30 Jul 2026)", "https://lovable.dev/pricing", "https://docs.lovable.dev/introduction/credits-and-usage"]);
  }

  {
    const slide = newSlide(presentation, C.pine);
    addKicker(slide, "UP NEXT · SESSION 05", { x: 64, y: 62, dark: true });
    addText(slide, "Your app now needs a system", { x: 64, y: 142, w: 1090, h: 120, size: 72, color: C.cream, font: FONT.display, bold: true, base: "closing-title" });
    addShape(slide, "rect", { left: 76, top: 354, width: 326, height: 126 }, "#294A43", "#6B8A82", 1.5, "app-event-bg");
    addText(slide, "APP EVENT", { x: 112, y: 386, w: 254, h: 56, size: 26, color: C.beacon, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "app-event" });
    addArrow(slide, 426, 404, 236, 24, "#46635D");
    addShape(slide, "rect", { left: 688, top: 354, width: 468, height: 126 }, "none", C.ochre, 2, "workflow-empty-bg");
    addText(slide, "WHICH EVENT COULD ACQUIRE, SERVE,\nRETAIN - OR RECOVER - A USER?", { x: 720, y: 378, w: 404, h: 78, size: 20, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "workflow-question" });
    finish(slide, 21, "01:59-02:00", "Take three spoken examples: signup, high-intent click, failed follow-up. Next session, submit the flowchart before the automation.", [], true);
  }

  return presentation;
}

function buildSession5() {
  const source = "lms/course/session-05/deck-script.md";
  const presentation = makePresentation("Session 05 - Revenue systems with Make");
  const total = 27;
  const session = "SESSION 05";
  const finish = (slide, index, timing, note, sources = [], dark = false) => {
    addFooter(slide, session, timing, index, total, dark);
    setNotes(slide, timing, note, source, sources);
  };
  const timerChecklist = (index, timing, timer, title, items, note) => {
    const slide = newSlide(presentation, C.pine);
    addKicker(slide, title, { x: 64, y: 52, dark: true });
    addText(slide, timer, { x: 64, y: 182, w: 480, h: 202, size: 118, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "checkpoint-timer" });
    addLine(slide, 576, 144, 0, "#46635D", 2, "checkpoint-divider");
    addBulletList(slide, items, { x: 622, y: 158, w: 560, itemH: 84, size: 24, marker: "check", dark: true });
    addShape(slide, "rect", { left: 64, top: 508, width: 1118, height: 8 }, C.beacon, "none", 0, "checkpoint-track");
    addShape(slide, "rect", { left: 64, top: 508, width: 290, height: 8 }, C.ochre, "none", 0, "checkpoint-progress");
    finish(slide, index, timing, note, [], true);
  };

  {
    const slide = newSlide(presentation, C.pine);
    addKicker(slide, "SESSION 05 · REVENUE SYSTEMS WITH MAKE", { x: 64, y: 72, dark: true });
    addText(slide, "A workflow is a promise", { x: 64, y: 158, w: 1100, h: 124, size: 78, color: C.cream, font: FONT.display, bold: true, base: "cover-title" });
    addText(slide, "about what happens next.", { x: 64, y: 290, w: 1050, h: 90, size: 60, color: C.beacon, font: FONT.display, italic: true, base: "cover-subtitle" });
    addArrow(slide, 222, 486, 220, 20, "#46635D");
    addArrow(slide, 688, 486, 220, 20, "#46635D");
    addNode(slide, "EVENT", 72, 438, 190, 112, { fill: "#294A43", border: "#6B8A82", color: C.cream, font: FONT.mono, size: 24 });
    addNode(slide, "CONTROLLED STATE", 442, 438, 280, 112, { fill: C.ochre, border: C.ochre, color: C.cream, font: FONT.mono, size: 21 });
    addNode(slide, "VERIFIED OUTCOME", 908, 438, 300, 112, { fill: "#294A43", border: "#6B8A82", color: C.cream, font: FONT.mono, size: 20 });
    finish(slide, 1, "00:00-00:02", "Today is not a tour of Make. You will design, break, repair, and package one operating system for the product you built last session. Surprise-quiz alternate: if S5-SQ-v1 is active, keep this title visible, run the quiz 00:00-00:07, compress slides 03-04 into 00:07-00:12, then resume slide 05.", [], true);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Put these in order", "INDIVIDUAL · NO CORRECTION YET");
    const blocks = ["approval requested", "lead received", "follow-up drafted", "duplicate found", "input validated"];
    blocks.forEach((label, i) => {
      const x = 74 + i * 232;
      const y = top + 52 + (i % 2) * 44;
      addShape(slide, "rect", { left: x, top: y, width: 206, height: 128 }, i === 3 ? C.paleOchre : C.white, i === 3 ? C.ochre : C.sand, 2, "order-block");
      addText(slide, label, { x: x + 16, y: y + 20, w: 174, h: 88, size: 22, color: i === 3 ? C.ochre : C.ink, font: FONT.body, bold: true, align: "center", valign: "middle", base: "order-label" });
    });
    addText(slide, "Which event must never happen twice?", { x: 170, y: top + 306, w: 940, h: 70, size: 36, color: C.pine, font: FONT.display, italic: true, align: "center", valign: "middle", base: "order-question" });
    finish(slide, 2, "00:02-00:05", "Students order individually. Take two answers, no correction yet.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "One lead, two promises", "REPLAY THE SAME NORMAL FIXTURE");
    addShape(slide, "rect", { left: 86, top: top + 100, width: 264, height: 116 }, C.pine, "none", 0, "event-bg");
    addText(slide, "event_id\nlead_001", { x: 116, y: top + 126, w: 204, h: 64, size: 22, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "event-label" });
    addArrow(slide, 348, top + 126, 188, 18, C.sand);
    addArrow(slide, 348, top + 178, 188, 18, C.sand);
    addNode(slide, "CRM ROW 1\nDRAFT 1", 566, top + 56, 520, 122, { fill: C.palePine, border: C.pine, color: C.pine, font: FONT.mono, size: 25 });
    addNode(slide, "CRM ROW 2\nDRAFT 2", 566, top + 202, 520, 122, { fill: C.paleOchre, border: C.ochre, color: C.ochre, font: FONT.mono, size: 25 });
    addText(slide, "Same webhook. Same email. Two CRM rows. Two drafts.", { x: 140, y: top + 374, w: 1000, h: 56, size: 28, color: C.charcoal, font: FONT.display, italic: true, align: "center", base: "duplicate-summary" });
    finish(slide, 3, "00:05-00:08", "Run the deliberately flawed scenario twice using the normal fixture.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "What failed?", "VOTE · THEN REVEAL");
    const options = ["Make", "The modules", "The design"];
    options.forEach((label, i) => {
      const y = top + 28 + i * 98;
      addText(slide, String(i + 1).padStart(2, "0"), { x: 144, y, w: 74, h: 64, size: 24, color: i === 2 ? C.ochre : C.pine, font: FONT.mono, bold: true, valign: "middle", base: "failure-number" });
      addText(slide, label, { x: 248, y, w: 760, h: 64, size: 40, color: C.ink, font: FONT.display, bold: true, valign: "middle", base: "failure-option" });
      if (i === 2) addLine(slide, 248, y + 72, 410, C.ochre, 5, "reveal-underline");
    });
    addText(slide, "Retries are normal. The design allowed action before duplicate check.", { x: 170, y: top + 348, w: 940, h: 56, size: 24, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "failure-reveal" });
    finish(slide, 4, "00:08-00:12", "Reveal that retried or repeated webhooks are normal. The design made send/create possible before a duplicate check.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Automation is state, not spaghetti", "NAME THE BUSINESS TRUTH", { long: true });
    const main = ["RECEIVED", "VALIDATED", "QUEUED", "APPROVED", "COMPLETED"];
    main.forEach((label, i) => {
      if (i < main.length - 1) addArrow(slide, 276 + i * 230, top + 86, 50, 14, C.sand);
      addNode(slide, label, 72 + i * 230, top + 50, 200, 84, { fill: i === 4 ? C.paleOchre : C.white, border: i === 4 ? C.ochre : C.pine, color: i === 4 ? C.ochre : C.pine, font: FONT.mono, size: 16 });
    });
    const side = ["DUPLICATE", "QUARANTINED", "RETRYING", "REJECTED"];
    side.forEach((label, i) => {
      const x = 154 + i * 252;
      addText(slide, label, { x, y: top + 204, w: 220, h: 48, size: 15, color: C.charcoal, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "side-state" });
      addLine(slide, x + 40, top + 260, 140, C.sand, 2, "side-state-rule");
    });
    addText(slide, "If you cannot name the states, you cannot control the system.", { x: 170, y: top + 318, w: 940, h: 70, size: 35, font: FONT.display, italic: true, align: "center", valign: "middle", base: "state-takeaway" });
    finish(slide, 5, "00:12-00:14", "Define a state as the business truth after an event, not the icon currently lit in Make.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The six-box contract", "ONE SENTENCE EACH");
    const labels = ["Trigger", "Contract", "State", "Decision", "Action", "Evidence"];
    const subs = ["webhook", "required fields", "new / duplicate", "route", "draft / queue", "audit + output"];
    labels.forEach((label, i) => {
      const x = 64 + i * 192;
      addText(slide, String(i + 1), { x, y: top + 34, w: 176, h: 62, size: 42, color: i === 5 ? C.ochre : C.pine, font: FONT.display, bold: true, align: "center", base: "contract-number" });
      addLine(slide, x, top + 106, 176, i === 5 ? C.ochre : C.pine, 4, "contract-rule");
      addText(slide, label, { x, y: top + 128, w: 176, h: 56, size: 20, color: C.ink, font: FONT.body, bold: true, align: "center", valign: "middle", base: "contract-label" });
      addText(slide, subs[i], { x: x + 8, y: top + 198, w: 160, h: 70, size: 17, color: C.charcoal, font: FONT.body, align: "center", valign: "middle", base: "contract-sub" });
    });
    finish(slide, 6, "00:14-00:18", "Use the lead example: webhook; required fields; new/duplicate; route; draft/queue; audit row and output.");
  }

  {
    const slide = newSlide(presentation, C.pine);
    addKicker(slide, "CONTROL BEFORE CONSEQUENCE", { x: 64, y: 58, dark: true });
    addText(slide, "Put the brake before the cliff", { x: 64, y: 132, w: 1120, h: 110, size: 72, color: C.cream, font: FONT.display, bold: true, base: "brake-title" });
    addText(slide, "Before money, messages, deletion, publishing, or customer status changes:", { x: 80, y: 292, w: 1120, h: 70, size: 26, color: "#C7D3CE", font: FONT.body, align: "center", valign: "middle", base: "brake-context" });
    const labels = ["VALIDATE", "DEDUPE", "APPROVE", "ACT"];
    labels.forEach((label, i) => {
      if (i < 3) addArrow(slide, 330 + i * 286, 457, 88, 18, "#46635D");
      addNode(slide, label, 84 + i * 286, 414, 250, 104, { fill: i === 3 ? C.ochre : "#294A43", border: i === 3 ? C.ochre : "#6B8A82", color: C.cream, font: FONT.mono, size: 22 });
    });
    finish(slide, 7, "00:18-00:20", "Approval can be a recorded state transition, not merely a notification. Drafting is safer than sending in class.", [], true);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Choose one operating problem", "ONE PACK · ONE OWNER · ONE MEASURABLE RESULT");
    const options = [
      ["GTM", "route a lead without duplicates"],
      ["OPERATIONS", "contain and escalate an exception"],
      ["REVENUE", "reconcile expected and actual money"],
    ];
    options.forEach(([label, sub], i) => {
      const x = 64 + i * 392;
      addLine(slide, x, top + 20, 344, i === 0 ? C.ochre : C.pine, 5, "problem-rule");
      addText(slide, label, { x, y: top + 52, w: 344, h: 56, size: 22, color: i === 0 ? C.ochre : C.pine, font: FONT.mono, bold: true, align: "center", base: "problem-label" });
      addText(slide, sub, { x: x + 26, y: top + 136, w: 292, h: 132, size: 27, color: C.ink, font: FONT.display, bold: true, align: "center", valign: "middle", base: "problem-copy" });
    });
    addText(slide, "Default to GTM if time or confidence is low.", { x: 230, y: top + 330, w: 820, h: 50, size: 23, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "problem-default" });
    finish(slide, 8, "00:20-00:22", "Default the room to GTM if time or confidence is low. Teams may choose another pack only after stating the success metric.");
  }

  {
    const slide = newSlide(presentation);
    addTimer(slide, session, "00:22-00:30", 9, total, "08:00", "DRAW BEFORE YOU AUTOMATE", "START · VALIDATE · DEDUPE · DECIDE · ACT/QUEUE · RECORD · END");
    setNotes(slide, "00:22-00:30", "Release the initial template. Do not answer which Make module questions yet; redirect to business state and contract. State the spoken start and end.", source);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Every path must land", "TERMINAL STATE + OWNER");
    addFlatTable(slide, ["CASE", "MUST END AS"], [
      ["normal", "completed or safely queued"],
      ["duplicate", "no second irreversible action"],
      ["malformed", "quarantined with reason"],
      ["timeout", "retrying/incomplete, then resolved or manual"],
      ["approval", "pending; no action yet"],
    ], { y: top - 4, rowH: 60, colWidths: [330, 822], fontSize: 21 });
    finish(slide, 10, "00:30-00:35", "Students add a terminal label and owner for all five cases.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Gate 1", "S5.1 · FORMATIVE · VERSIONED");
    addText(slide, "Submit the problem frame + initial flowchart.", { x: 120, y: top + 68, w: 1040, h: 128, size: 48, font: FONT.display, bold: true, align: "center", valign: "middle", base: "gate-one-claim" });
    addShape(slide, "rect", { left: 460, top: top + 250, width: 360, height: 94 }, C.beacon, "none", 0, "gate-one-timer-bg");
    addText(slide, "02:00", { x: 482, y: top + 266, w: 316, h: 62, size: 45, color: C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "gate-one-timer" });
    finish(slide, 11, "00:35-00:37", "Clarify that a feedback score is diagnostic and never enters the grade.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Read feedback like an operator", "THE MODEL ADVISES · YOU OWN THE DESIGN");
    addBulletList(slide, [
      "Find the cited node.",
      "Decide whether the risk is real.",
      "Accept, adapt, or reject.",
      "Record why.",
    ], { x: 120, y: top + 18, w: 1020, itemH: 82, size: 31, marker: "number" });
    finish(slide, 12, "00:37-00:42", "Show one good AI finding and one overreach. The model advises; the student owns the design.");
  }

  {
    const slide = newSlide(presentation);
    addTimer(slide, session, "00:42-00:47", 13, total, "05:00", "REPAIR THE SMALLEST DANGEROUS GAP", "What could create money, message a human, or corrupt a record twice?");
    setNotes(slide, "00:42-00:47", "Prioritise blocker repair over prettier diagrams. State the spoken start and end.", source);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Change log", "ADVICE · DECISION · EVIDENCE");
    addFlatTable(slide, ["ADVICE", "DECISION", "EVIDENCE"], [
      ["Add duplicate state", "Accepted", "before queue/write"],
      ["Retry malformed data", "Rejected", "retry cannot repair input"],
    ], { y: top + 34, rowH: 104, colWidths: [420, 260, 472], fontSize: 24 });
    addText(slide, "Record at least one accepted/adapted and one rejected/not-applicable suggestion.", { x: 160, y: top + 356, w: 960, h: 50, size: 23, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "change-log-rule" });
    finish(slide, 14, "00:47-00:52", "Every student records at least one accepted/adapted and one rejected/not-applicable suggestion where evidence supports it.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Build only the spine", "SCHEDULING STAYS OFF");
    const labels = ["WEBHOOK", "NORMALIZE", "SEARCH KEY", "ROUTER", "QUEUE / DRAFT", "AUDIT"];
    labels.forEach((label, i) => {
      if (i < 5) addArrow(slide, 250 + i * 196, top + 126, 40, 14, C.sand);
      addNode(slide, label, 62 + i * 196, top + 88, 188, 92, { fill: i === 5 ? C.paleOchre : C.white, border: i === 5 ? C.ochre : C.pine, color: i === 5 ? C.ochre : C.pine, font: FONT.mono, size: label.length > 10 ? 14 : 16 });
    });
    addText(slide, "Classroom substitutes, not production architecture.", { x: 220, y: top + 268, w: 840, h: 70, size: 34, font: FONT.display, italic: true, align: "center", valign: "middle", base: "spine-note" });
    finish(slide, 15, "00:52-00:54", "Describe connections as classroom substitutes, not production architecture.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Normal is the first test, not the last", "TRACE THE BUSINESS STATE", { long: true });
    addShape(slide, "rect", { left: 164, top: top + 30, width: 952, height: 252 }, C.pine, "none", 0, "trace-card-bg");
    addText(slide, "trace_id: trc_s5_normal_001\nroute: warm · final state: drafted\noutbound sends: 0", { x: 224, y: top + 76, w: 832, h: 156, size: 31, color: C.cream, font: FONT.mono, bold: true, base: "trace-card" });
    addText(slide, "Show the audit row and draft / queue artifact - not green bubbles alone.", { x: 180, y: top + 330, w: 920, h: 54, size: 24, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "trace-note" });
    finish(slide, 16, "00:54-01:02", "Build and run the normal fixture. Pause after each module to map it to a flowchart node. Show the audit row and draft/queue artifact.");
  }

  timerChecklist(17, "01:02-01:10", "08:00", "CHECKPOINT A · CONTRACT", [
    "trigger accepts fixture",
    "required fields mapped",
    "trace_id retained",
    "scheduling off",
  ], "Supported teams use the starter map; extensions wait. State the spoken start and end.");

  timerChecklist(18, "01:10-01:18", "08:00", "CHECKPOINT B · CONTROL", [
    "idempotency key computed",
    "existing key searched before write/action",
    "fallback route exists",
    "owner named",
  ], "Verify route filters are mutually legible. Make router routes execute sequentially, but do not rely on route order as dedupe. State the spoken start and end.");

  timerChecklist(19, "01:18-01:27", "09:00", "CHECKPOINT C · EVIDENCE", [
    "normal case passes",
    "audit row/output created",
    "run trace visible",
    "screenshot not yet taken",
  ], "Refuse green bubbles only as proof; students must identify the resulting business state. State the spoken start and end.");

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The gauntlet", "PREDICT · RUN · OBSERVE · REPAIR ONCE");
    addText(slide, "Predict → Run → Observe → Repair once", { x: 140, y: top + 26, w: 1000, h: 86, size: 43, font: FONT.display, bold: true, align: "center", valign: "middle", base: "gauntlet-sequence" });
    const fixtures = ["DUPLICATE", "MALFORMED", "TIMEOUT", "APPROVAL"];
    fixtures.forEach((fixture, i) => {
      const x = 80 + i * 300;
      addLine(slide, x, top + 166, 260, i === 3 ? C.ochre : C.pine, 4, "fixture-rule");
      addText(slide, fixture, { x, y: top + 190, w: 260, h: 68, size: 19, color: i === 3 ? C.ochre : C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "fixture-label" });
    });
    addText(slide, "Expected results stay hidden until predictions are submitted.", { x: 190, y: top + 318, w: 900, h: 52, size: 23, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "gauntlet-rule" });
    finish(slide, 20, "01:27-01:30", "Expected results remain hidden until predictions are submitted.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Four ways to be wrong", "11:00 · FOUR FIXTURES");
    const quadrants = [
      ["DUPLICATE", "Was a second action possible?"],
      ["MALFORMED", "Did it stop safely with a reason?"],
      ["TIMEOUT", "Was state retained for retry or manual recovery?"],
      ["APPROVAL", "Could anything irreversible happen while pending?"],
    ];
    quadrants.forEach(([label, question], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 64 + col * 584;
      const y = top + 8 + row * 174;
      addShape(slide, "rect", { left: x, top: y, width: 552, height: 152 }, i === 3 ? C.paleOchre : C.white, i === 3 ? C.ochre : C.sand, 1.5, "fixture-quadrant");
      addText(slide, label, { x: x + 24, y: y + 18, w: 504, h: 30, size: 15, color: i === 3 ? C.ochre : C.pine, font: FONT.mono, bold: true, base: "fixture-quadrant-label" });
      addText(slide, question, { x: x + 24, y: y + 64, w: 504, h: 68, size: 23, color: C.ink, font: FONT.body, bold: true, valign: "middle", base: "fixture-question" });
    });
    finish(slide, 21, "01:30-01:41", "Release one fixture every 2-3 minutes. Students may use replay if live services are slow.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Private evidence. Public clone.", "MAKE SHARING · VERIFIED 30 JUL 2026 · T-7");
    addFlatTable(slide, ["PRIVATE BLUEPRINT JSON", "OFFICIAL MAKE SCENARIO LINK"], [
      ["point-in-time evidence", "latest saved version"],
      ["import privately", "official view / sign-in copy"],
      ["under 2 MB", "public clone surface"],
      ["connections recreated", "connections recreated"],
    ], { y: top + 2, rowH: 67, colWidths: [576, 576], fontSize: 22 });
    addText(slide, "Raw blueprint stays private. Use an official Make link—or withhold cloning.", { x: 180, y: top + 356, w: 920, h: 42, size: 23, color: C.ochre, font: FONT.display, italic: true, align: "center", base: "copy-warning" });
    finish(slide, 22, "01:41-01:44", "The raw Make blueprint is private assessment evidence, never a public download. A public clone is allowed only through Make's official scenario-sharing link after privacy review; otherwise withhold the clone surface. Both artifacts can reveal static settings, mapped values, notes and URLs even though connections are omitted. Make behavior was verified 30 July 2026 and requires T-7 recheck.", ["https://help.make.com/blueprints", "https://help.make.com/scenario-sharing"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "The evidence bundle", "SIX DIFFERENT TRUST QUESTIONS");
    addBulletList(slide, [
      "revised flowchart",
      "blueprint JSON",
      "redacted run log",
      "sample output",
      "workflow PNG",
      "limitation + change note",
    ], { x: 112, y: top - 4, w: 1060, itemH: 58, size: 27, marker: "number" });
    addText(slide, "Blueprint = private · official Make link = optional public clone", { x: 560, y: top + 346, w: 590, h: 38, size: 14, color: C.ochre, font: FONT.mono, bold: true, align: "right", base: "evidence-optional" });
    finish(slide, 23, "01:44-01:48", "Explain why each artifact answers a different trust question. The blueprint JSON remains private evidence. The only permitted public clone surface is a privacy-cleared official Make scenario-sharing link; if that link is unsafe or unavailable, the public clone is withheld.", ["https://help.make.com/blueprints", "https://help.make.com/scenario-sharing"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Scrub before you share", "BLUEPRINT · LOG · NOTES · URLS · PNG · OUTPUT");
    addText(slide, "Search every artifact for:", { x: 140, y: top + 24, w: 1000, h: 58, size: 35, font: FONT.display, bold: true, align: "center", base: "scrub-prompt" });
    const terms = ["@", "token", "key", "secret", "webhook", "bearer", "customer", "phone"];
    terms.forEach((term, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 126 + col * 264;
      const y = top + 120 + row * 104;
      addShape(slide, "rect", { left: x, top: y, width: 236, height: 76 }, i === 0 ? C.ochre : C.pine, "none", 0, "scrub-term-bg");
      addText(slide, term, { x: x + 10, y: y + 14, w: 216, h: 48, size: 22, color: C.cream, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "scrub-term" });
    });
    addText(slide, "Patterns are prompts, not complete detection.", { x: 290, y: top + 344, w: 700, h: 44, size: 22, color: C.charcoal, font: FONT.body, italic: true, align: "center", base: "scrub-note" });
    finish(slide, 24, "01:48-01:51", "Patterns are prompts, not complete detection. Use demo identities and .test domains. Delete/rotate any credential exposed during practice.");
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "A gallery card is not a grade card", "PUBLIC-SAFE PORTFOLIO SURFACE", { long: true });
    addShape(slide, "rect", { left: 180, top: top + 8, width: 920, height: 334 }, C.white, C.sand, 2, "gallery-card");
    addShape(slide, "rect", { left: 220, top: top + 38, width: 352, height: 224 }, C.palePine, C.pine, 1, "workflow-preview");
    addText(slide, "WORKFLOW PNG", { x: 246, y: top + 116, w: 300, h: 66, size: 24, color: C.pine, font: FONT.mono, bold: true, align: "center", valign: "middle", base: "workflow-preview-label" });
    addText(slide, "Lead triage with duplicate protection", { x: 620, y: top + 54, w: 420, h: 92, size: 31, font: FONT.display, bold: true, base: "gallery-title" });
    addText(slide, "Official Make clone  /  View sample output", { x: 620, y: top + 176, w: 420, h: 54, size: 17, color: C.ochre, font: FONT.mono, bold: true, base: "gallery-links" });
    addText(slide, "No grades · confidence · prompts · credentials · private data", { x: 234, y: top + 286, w: 832, h: 34, size: 14, color: C.charcoal, font: FONT.mono, align: "center", base: "gallery-exclusions" });
    finish(slide, 25, "01:51-01:54", "The raw blueprint remains private evidence and is never linked from the gallery. Publish a clone action only when it points to a privacy-cleared official Make scenario-sharing link; otherwise withhold cloning. Instructor featuring controls public exposure.", ["https://help.make.com/scenario-sharing"]);
  }

  {
    const slide = newSlide(presentation);
    const top = addHeader(slide, "Gate 2", "S5.3 BUILD EVIDENCE → S5.4 PRIVACY-CLEARED GALLERY");
    addText(slide, "Submit. Preview. Attest. Keep scheduling off.", { x: 110, y: top + 54, w: 1060, h: 128, size: 49, font: FONT.display, bold: true, align: "center", valign: "middle", base: "gate-two-claim" });
    addArrow(slide, 462, top + 270, 110, 20, C.sand);
    addArrow(slide, 708, top + 270, 110, 20, C.sand);
    addNode(slide, "SUBMIT", 236, top + 228, 230, 104, { fill: C.palePine, border: C.pine, color: C.pine, font: FONT.mono, size: 22 });
    addNode(slide, "PREVIEW", 574, top + 228, 230, 104, { fill: C.white, border: C.ochre, color: C.ochre, font: FONT.mono, size: 22 });
    addNode(slide, "ATTEST", 816, top + 228, 230, 104, { fill: C.palePine, border: C.pine, color: C.pine, font: FONT.mono, size: 22 });
    addText(slide, "FINAL SCORING · TEAM MAY NOMINATE · INSTRUCTOR SELECTS EXACTLY ONE EXISTING FINALISED VERSION · NO INTEGRATED PACKAGE", { x: 118, y: top + 354, w: 1044, h: 42, size: 13, color: C.ochre, font: FONT.mono, bold: true, align: "center", base: "final-selection-contract" });
    finish(slide, 26, "01:54-01:57", "One repair submission is allowed after provisional feedback. Company sign-off remains pending until it is real. For final workflow-component scoring, the team may nominate candidates, but the instructor alone selects exactly one existing finalised submission version. Do not merge submissions, create an integrated package, or grade an unsubmitted composite.", ["Reviewed Session 05 final-version selection contract (30 Jul 2026)"]);
  }

  {
    const slide = newSlide(presentation, C.pine);
    addKicker(slide, "CLOSING REFUSAL TEST", { x: 64, y: 62, dark: true });
    addText(slide, "Refuse to automate this", { x: 64, y: 142, w: 1080, h: 112, size: 76, color: C.cream, font: FONT.display, bold: true, base: "refusal-title" });
    addText(slide, "What would make you refuse to switch this on for a real company?", { x: 92, y: 318, w: 1096, h: 112, size: 42, color: C.beacon, font: FONT.display, italic: true, align: "center", valign: "middle", base: "refusal-question" });
    addLine(slide, 210, 492, 860, C.ochre, 3, "refusal-rule");
    addText(slide, "ONE REFUSAL CONDITION · ONE NEXT TEST", { x: 250, y: 522, w: 780, h: 44, size: 18, color: C.cream, font: FONT.mono, bold: true, align: "center", base: "refusal-action" });
    finish(slide, 27, "01:57-02:00", "Collect responses. Bridge to company process mapping, real sign-off, and the later AI interview defence.", [], true);
  }

  return presentation;
}

async function main() {
  await fs.mkdir(TMP_ROOT, { recursive: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  await fs.writeFile(
    path.join(TMP_ROOT, "source-notes.txt"),
    [
      "Presentation sources and provenance",
      "",
      "Authored course sources:",
      "- lms/course/session-03/deck-script.md",
      "- lms/course/session-04/02-deck-script.md",
      "- lms/course/session-05/deck-script.md",
      "",
      "Visual authorities:",
      "- lms/docs/taught/2026-07-session-01-industry-maps.html",
      "- lms/docs/taught/2026-07-workshop-sessions-01-02-reference.pdf",
      "",
      "Fonts:",
      "- Fraunces variable font copied from an existing local repository asset",
      "- Geist and Geist Mono variable fonts from https://github.com/vercel/geist-font (SIL OFL 1.1)",
      "",
      "All external claims retained from the authored scripts are cited in the relevant PowerPoint speaker notes under [Sources].",
      "Reviewed internal assessment-contract clarifications are also recorded in the relevant speaker notes.",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(TMP_ROOT, "design-notes.txt"),
    [
      "Communication job: learners should ship auditable work because method, contract, and evidence outrank confident output.",
      "Visual route: custom Praxel editorial system drawn from the supplied HTML/PDF authorities; no Codex Grid.",
      "Canvas: 1280x720 (16:9).",
      "Palette: Pine, Parchment, Ink, Ochre, Beacon, Sand.",
      "Typography: Fraunces display, Geist body, Geist Mono kicker/labels.",
      "Geometry: square corners, no gradients, no shadows.",
      "QA: every slide rendered to PNG; every slide layout exported; text overlap and bounds checks must be zero before export.",
    ].join("\n"),
  );

  const outputs = [];
  outputs.push(await renderAndExport(buildSession3(), {
    slug: "session-03-working-with-data-using-ai",
    title: "Session 03 - Working with data, using AI",
    count: 26,
  }));
  outputs.push(await renderAndExport(buildSession4(), {
    slug: "session-04-a-30k-clue-is-not-a-build-brief",
    title: "Session 04 - A $30K clue is not a build brief",
    count: 21,
  }));
  outputs.push(await renderAndExport(buildSession5(), {
    slug: "session-05-revenue-systems-with-make",
    title: "Session 05 - Revenue systems with Make",
    count: 27,
  }));
  await fs.writeFile(path.join(TMP_ROOT, "build-results.txt"), JSON.stringify(outputs, null, 2));
  console.log(JSON.stringify(outputs, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
