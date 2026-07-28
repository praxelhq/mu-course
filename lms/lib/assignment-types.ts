import type { AssignmentType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseSubmissionSchema } from "@/lib/submission-schema";

// U8 — assignment-type CRUD shared by the admin editor route AND the
// extensibility test: creating a type through this module is the whole
// "add an artifact kind" operation (CLAUDE.md: artifact kinds are rows,
// not code — no deploy required).

export const DEFAULT_RUBRIC = {
  scale: 10,
  dimensions: [
    { key: "functionality", label: "Functionality", max: 10, description: "Does it actually work?" },
    { key: "craft", label: "Craft", max: 10, description: "Is the execution good, not just present?" },
    { key: "relevance", label: "Relevance", max: 10, description: "Built for the team's real company/industry?" },
    { key: "verification-evidence", label: "Verification evidence", max: 10, description: "Can the student show they checked their own work?" },
  ],
};

const fieldDefSchema = z.object({
  key: z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "key must be an identifier"),
  label: z.string().min(1).max(200),
  kind: z.enum(["link", "text", "writeup", "file", "files"]),
  required: z.boolean(),
});

const rubricDimensionSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  max: z.number().int().positive().default(10),
  description: z.string().max(500).default(""),
});

export const assignmentTypeInputSchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase kebab-case"),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  teamBased: z.boolean(),
  galleryEligible: z.boolean(),
  submissionSchema: z.object({ fields: z.array(fieldDefSchema).min(1) }),
  rubric: z
    .object({
      scale: z.number().int().positive().default(10),
      dimensions: z.array(rubricDimensionSchema).min(1),
    })
    .default(DEFAULT_RUBRIC),
});

export type AssignmentTypeInput = z.input<typeof assignmentTypeInputSchema>;

export class AssignmentTypeError extends Error {
  readonly status: 409 | 422;
  constructor(status: 409 | 422, message: string) {
    super(message);
    this.name = "AssignmentTypeError";
    this.status = status;
  }
}

function validate(input: unknown): z.output<typeof assignmentTypeInputSchema> {
  const parsed = assignmentTypeInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AssignmentTypeError(
      422,
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  const dupes = new Set<string>();
  for (const f of parsed.data.submissionSchema.fields) {
    if (dupes.has(f.key)) throw new AssignmentTypeError(422, `duplicate field key "${f.key}"`);
    dupes.add(f.key);
  }
  // Belt and braces: the runtime validator must accept what we store.
  if (!parseSubmissionSchema(parsed.data.submissionSchema)) {
    throw new AssignmentTypeError(422, "submissionSchema failed the runtime parser");
  }
  return parsed.data;
}

export async function createAssignmentType(
  input: unknown,
  actorId: string,
): Promise<AssignmentType> {
  const data = validate(input);
  const existing = await prisma.assignmentType.findUnique({ where: { slug: data.slug } });
  if (existing) throw new AssignmentTypeError(409, `slug "${data.slug}" is already taken`);
  return prisma.$transaction(async (tx) => {
    const created = await tx.assignmentType.create({
      data: {
        slug: data.slug,
        title: data.title,
        description: data.description,
        teamBased: data.teamBased,
        galleryEligible: data.galleryEligible,
        submissionSchema: data.submissionSchema as Prisma.InputJsonValue,
        rubric: data.rubric as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "assignment-type.create",
        targetType: "assignmentType",
        targetId: created.id,
        after: data as unknown as Prisma.InputJsonValue,
      },
    });
    return created;
  });
}

export async function updateAssignmentType(
  id: string,
  input: unknown,
  actorId: string,
): Promise<AssignmentType> {
  const data = validate(input);
  const existing = await prisma.assignmentType.findUnique({ where: { id } });
  if (!existing) throw new AssignmentTypeError(422, `unknown assignment type ${id}`);
  const slugClash = await prisma.assignmentType.findUnique({ where: { slug: data.slug } });
  if (slugClash && slugClash.id !== id) {
    throw new AssignmentTypeError(409, `slug "${data.slug}" is already taken`);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.assignmentType.update({
      where: { id },
      data: {
        slug: data.slug,
        title: data.title,
        description: data.description,
        teamBased: data.teamBased,
        galleryEligible: data.galleryEligible,
        submissionSchema: data.submissionSchema as Prisma.InputJsonValue,
        rubric: data.rubric as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "assignment-type.update",
        targetType: "assignmentType",
        targetId: id,
        before: {
          slug: existing.slug,
          title: existing.title,
          submissionSchema: existing.submissionSchema,
          rubric: existing.rubric,
        } as Prisma.InputJsonValue,
        after: data as unknown as Prisma.InputJsonValue,
      },
    });
    return updated;
  });
}

export async function listAssignmentTypes(): Promise<AssignmentType[]> {
  return prisma.assignmentType.findMany({ orderBy: { slug: "asc" } });
}
