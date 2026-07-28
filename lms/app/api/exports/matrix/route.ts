import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSectionMatrix, matrixToCsv } from "@/lib/matrix";

// U8 — instructor CSV export of the section matrix. Serialized through the
// shared lib/csv-export (formula injection neutralized); U15 reuses that
// serializer for grade/PCI exports.

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req) => {
    const code = new URL(req.url).searchParams.get("section") ?? "";
    const section = await prisma.section.findUnique({ where: { code } });
    if (!section) return Response.json({ error: "Unknown section" }, { status: 404 });
    const matrix = await getSectionMatrix(section.id);
    const csv = matrixToCsv(matrix);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="matrix_section_${section.code}.csv"`,
      },
    });
  },
  { role: "instructor" },
);
