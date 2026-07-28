import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExternalLinks, parseValidations } from "@/lib/portfolio";
import { parseSubmissionSchema } from "@/lib/submission-schema";

// U16 — the Praxy export STUB. Returns the exact payload that WOULD be sent
// to Praxy for one student: artifacts + badges ONLY.
//
// HARD INVARIANT (CLAUDE.md): grades and PCI never leave the LMS. This
// payload must never contain totals, scores, rubric scores, confidence, PCI
// or quiz data — tests/praxy-export.test.ts deep-scans every key and value
// for forbidden terms. Artifacts come only from graded/finalised submissions
// (i.e. work that survived grading), but the fact of "graded" is expressed
// solely by presence in the list — no status field is carried.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ userId: z.string().min(1) });

export const POST = withAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body: expected { userId }" }, { status: 400 });
    }
    const { userId } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, teamId: true },
    });
    if (!user || user.role !== "student") {
      return Response.json({ error: "Unknown student" }, { status: 404 });
    }

    const [submissions, portfolio, signOff, latestInterview] = await Promise.all([
      prisma.submission.findMany({
        where: { userId, status: { in: ["graded", "finalised"] } },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        select: {
          assignmentId: true,
          submittedAt: true,
          fields: true,
          assignment: {
            select: {
              title: true,
              assignmentType: { select: { slug: true, submissionSchema: true } },
            },
          },
          galleryItem: { select: { featured: true } },
        },
      }),
      prisma.portfolioEntry.findUnique({
        where: { userId },
        select: { links: true, validations: true },
      }),
      user.teamId
        ? prisma.signOff.findUnique({
            where: { teamId: user.teamId },
            select: { status: true, evidenceS3Key: true },
          })
        : null,
      prisma.interview.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      }),
    ]);

    // Latest version per assignment only (rows arrive version-desc).
    const seen = new Set<string>();
    const artifacts: {
      type: string;
      title: string;
      links: string[];
      submittedAt: string | null;
      featured: boolean;
    }[] = [];
    for (const s of submissions) {
      if (seen.has(s.assignmentId)) continue;
      seen.add(s.assignmentId);
      const schema = parseSubmissionSchema(s.assignment.assignmentType.submissionSchema);
      const links: string[] = [];
      if (schema && s.fields && typeof s.fields === "object" && !Array.isArray(s.fields)) {
        const fields = s.fields as Record<string, unknown>;
        for (const def of schema.fields) {
          if (def.kind !== "link") continue;
          const v = fields[def.key];
          if (typeof v === "string" && /^https?:\/\//.test(v)) links.push(v);
        }
      }
      artifacts.push({
        type: s.assignment.assignmentType.slug,
        title: s.assignment.title,
        links,
        submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
        featured: s.galleryItem?.featured ?? false,
      });
    }

    const externalLinks = parseExternalLinks(portfolio?.links);
    if (externalLinks.length > 0) {
      artifacts.push({
        type: "portfolio",
        title: "Portfolio links",
        links: externalLinks.map((l) => l.url),
        submittedAt: null,
        featured: false,
      });
    }

    const badges: ({ kind: string } & Record<string, unknown>)[] = [];
    if (signOff?.status === "signed_off") {
      badges.push({ kind: "company-sign-off", evidence: Boolean(signOff.evidenceS3Key) });
    }
    if (latestInterview?.status === "graded") {
      // Escalated interviews qualify only once resolved — resolution flips the
      // status to 'graded', so this one check covers both paths.
      badges.push({ kind: "interview-completed" });
    }
    const externalValidations = parseValidations(portfolio?.validations).filter(
      (v) => v.kind === "external",
    );
    if (externalValidations.length > 0) {
      badges.push({ kind: "external-validation", count: externalValidations.length });
    }

    return Response.json({
      student: { name: user.name, praxyProfileHint: user.email },
      artifacts,
      badges,
      generatedAt: new Date().toISOString(),
    });
  },
  { role: "instructor" },
);
