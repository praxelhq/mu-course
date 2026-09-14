import { withAuth } from "@/lib/auth";
import { loadSectionMatrix, listSections, resolveSection } from "@/lib/shipyard/instructor";

// GET /api/shipyard/instructor/matrix?sectionId=&ifVersion=   (staff only)
//   200 { version, matrix } — the whole section
//   200 { unchanged: true, version } — the hash matched, nothing moved
//   404 no such section
//
// Same shape as the spine poll, a slower tick: the matrix is 360 cells across
// 60 students and nobody is watching one square, so it refreshes every eight
// seconds rather than four (docs/DECISIONS.md, 2026-09-15). `ifVersion` means
// a quiet section costs one hash, not a page of JSON, eight times a minute.

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req, { user }) => {
    const url = new URL(req.url);
    const sectionId = url.searchParams.get("sectionId");

    let targetId = sectionId;
    if (!targetId) {
      const sections = await listSections();
      targetId = resolveSection(sections, null, user.sectionId)?.id ?? null;
    }
    if (!targetId) return Response.json({ error: "No sections yet." }, { status: 404 });

    const matrix = await loadSectionMatrix(targetId);
    if (!matrix) return Response.json({ error: "No such section." }, { status: 404 });

    const ifVersion = url.searchParams.get("ifVersion");
    if (ifVersion && ifVersion === matrix.version) {
      return Response.json({ unchanged: true, version: matrix.version });
    }
    return Response.json({ version: matrix.version, matrix });
  },
  { role: "instructor" },
);
