import { withAuth } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv-export";
import {
  listSections,
  loadSectionMatrix,
  matrixCsvRows,
  resolveSection,
} from "@/lib/shipyard/instructor";

// GET /api/shipyard/exports/matrix?sectionId=   (staff only)
//   200 text/csv — one row per student, three columns per checkpoint
//   404 no such section
//
// The same numbers as the matrix, in the tool a section head actually uses to
// chase people. Columns: name, email, section, product, then per checkpoint its
// state, the instant it cleared, and how many attempts it took
// (docs/DECISIONS.md, 2026-09-15). No grades and no PCI — neither is computed
// yet, and neither leaves this portal when it is.
//
// `lib/csv-export` neutralises spreadsheet formula injection: a product named
// "=cmd|..." is a cell, not a command.

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req, { user }) => {
    const url = new URL(req.url);
    let sectionId = url.searchParams.get("sectionId");
    if (!sectionId) {
      const sections = await listSections();
      sectionId = resolveSection(sections, url.searchParams.get("section"), user.sectionId)?.id ?? null;
    }
    if (!sectionId) return Response.json({ error: "No sections yet." }, { status: 404 });

    const matrix = await loadSectionMatrix(sectionId);
    if (!matrix) return Response.json({ error: "No such section." }, { status: 404 });

    const { headers, rows } = matrixCsvRows(matrix);
    return csvResponse(
      toCsv(headers, rows),
      `shipyard-section-${matrix.section.code}.csv`,
    );
  },
  { role: "instructor" },
);
