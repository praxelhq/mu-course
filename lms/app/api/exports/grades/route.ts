import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv-export";
import { getGradeLine } from "@/lib/scoring/assemble";

// U15 — instructor CSV export of the full grade line per student: the seven
// component raw scores, the PCI, and the weighted total. Serialized through
// the shared lib/csv-export (formula injection neutralized). Optional
// ?section=A filter; omitted → the whole cohort (slower).

export const dynamic = "force-dynamic";

const COMPONENT_KEYS = [
  "vcm",
  "artifact",
  "workflow",
  "interview",
  "peer",
  "quizzes",
  "portfolio",
] as const;

export const GET = withAuth(
  async (req) => {
    const code = new URL(req.url).searchParams.get("section");
    let sectionId: string | undefined;
    if (code) {
      const section = await prisma.section.findUnique({ where: { code } });
      if (!section) return Response.json({ error: "Unknown section" }, { status: 404 });
      sectionId = section.id;
    }

    const students = await prisma.user.findMany({
      where: { role: "student", ...(sectionId ? { sectionId } : {}) },
      select: {
        id: true,
        name: true,
        email: true,
        section: { select: { code: true } },
        team: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    });

    const rows: unknown[][] = [];
    for (const s of students) {
      const line = await getGradeLine(s.id);
      const byKey = new Map(line.lines.map((l) => [l.key, l]));
      rows.push([
        s.name,
        s.email,
        s.section?.code ?? "",
        s.team?.name ?? "",
        ...COMPONENT_KEYS.map((k) => byKey.get(k)?.raw ?? ""),
        line.pci.pending ? "" : Math.round(line.pci.pci * 100) / 100,
        Math.round(line.total * 100) / 100,
        line.lines
          .filter((l) => l.pending)
          .map((l) => l.key)
          .join("; "),
      ]);
    }

    const csv = toCsv(
      [
        "name",
        "email",
        "section",
        "team",
        "value_chain_map",
        "artifact_quality",
        "workflow_usefulness",
        "ai_interview",
        "peer_contribution",
        "quizzes_best_of_three",
        "portfolio",
        "pci",
        "total",
        "pending_components",
      ],
      rows,
    );
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="grades${code ? `_section_${code}` : ""}.csv"`,
      },
    });
  },
  { role: "instructor" },
);
