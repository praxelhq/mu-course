import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth";

// Admin escape hatch: add a single roster row. The full CSV roster import UI
// is unit U3 — this endpoint exists so an admin can always fix the roster.

const bodySchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  name: z.string().min(1),
  sectionCode: z.string().min(1),
  role: z.enum(["student", "instructor", "admin"]).default("student"),
});

export const POST = withAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { email, name, sectionCode, role } = parsed.data;

    const section = await prisma.section.findUnique({ where: { code: sectionCode } });
    if (!section) {
      return Response.json({ error: `Unknown section code ${sectionCode}` }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: "Email already on roster" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: { email, name, role, sectionId: section.id },
      select: { id: true, email: true, name: true, role: true, sectionId: true },
    });
    return Response.json({ user }, { status: 201 });
  },
  { role: "admin" },
);
