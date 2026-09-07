import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth";
import { parseRosterCsv } from "@/lib/roster-csv";

// Admin roster import: CSV of `name,email,section` (header optional).
// - valid new emails are created as students in the named section
// - existing emails are skipped (never overwritten)
// - malformed rows (bad email, unknown section, wrong shape) are reported
//   back with line numbers, and nothing is created for them.
// Accepts multipart/form-data with a `file` field, or a raw text body.

export const POST = withAuth(
  async (req) => {
    let csv: string | null = null;
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (file instanceof File) csv = await file.text();
      else if (typeof file === "string") csv = file;
    } else {
      csv = await req.text().catch(() => null);
    }
    if (!csv || csv.trim() === "") {
      return Response.json({ error: "No CSV provided" }, { status: 400 });
    }

    const sections = await prisma.section.findMany({
      select: { id: true, code: true },
    });
    const sectionIdByCode = new Map(sections.map((s) => [s.code.toUpperCase(), s.id]));

    const parsed = parseRosterCsv(csv, sections.map((s) => s.code));

    const emails = parsed.rows.map((r) => r.email);
    const existing = emails.length
      ? await prisma.user.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      : [];
    const existingEmails = new Set(existing.map((u) => u.email));
    const toCreate = parsed.rows.filter((r) => !existingEmails.has(r.email));

    if (toCreate.length > 0) {
      await prisma.user.createMany({
        data: toCreate.map((r) => ({
          email: r.email,
          name: r.name,
          role: "student" as const,
          sectionId: sectionIdByCode.get(r.section)!,
        })),
        skipDuplicates: true,
      });
    }

    return Response.json({
      created: toCreate.length,
      skipped: parsed.rows.length - toCreate.length,
      invalid: parsed.invalid.length,
      invalidRows: parsed.invalid,
    });
  },
  { role: "admin" },
);
