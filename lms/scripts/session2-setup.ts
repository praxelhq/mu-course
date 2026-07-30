// Idempotent Session-2 configuration for the real launch. Safe to run against
// a live DB and safe to re-run: it upserts the four Session-2 artifact types
// and assignments, points the Session-2 hub at them, and creates only missing
// Session-2 gate rows. It never rewrites another session's release state and
// never wipes submissions or votes.
//
//   pnpm tsx scripts/session2-setup.ts
//
// The four artifacts:
//   meme          image, gallery, NOT graded  (upvoting)
//   ai-image      image + SCENE prompt, gallery, NOT graded  (upvoting)
//   presentation  PDF, graded (Visual appeal / Brevity / Clarity, vision)
//   costar-prompt writeup, graded (six COSTAR dimensions)
//
// Rubrics/briefs here are sensible defaults — edit them live in the instructor
// console once you have your final criteria.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SESSION_NO = 2;

type FieldKind = "link" | "text" | "writeup" | "file" | "files";
const f = (key: string, label: string, kind: FieldKind, required = true) => ({ key, label, kind, required });
const dim = (key: string, label: string, description: string, max = 10) => ({ key, label, max, description });

const TYPES = [
  {
    id: "atype_meme",
    slug: "meme",
    title: "Meme",
    description: "Session 2: submit a meme image. Gallery + section upvoting. Not AI-graded.",
    teamBased: false,
    galleryEligible: true,
    aiGraded: false,
    submissionSchema: { fields: [f("image", "Your meme (image)", "file"), f("caption", "Caption (optional)", "text", false)] },
    rubric: { scale: 10, dimensions: [dim("participation", "Participation", "Submitted a meme")] },
  },
  {
    id: "atype_ai_image",
    slug: "ai-image",
    title: "AI Image (SCENE)",
    description: "Session 2: an AI-generated image using the SCENE framework. Gallery + section upvoting. Not AI-graded.",
    teamBased: false,
    galleryEligible: true,
    aiGraded: false,
    submissionSchema: {
      fields: [f("image", "Your AI-generated image", "file"), f("scenePrompt", "The SCENE prompt you used", "writeup")],
    },
    rubric: { scale: 10, dimensions: [dim("participation", "Participation", "Submitted an AI image")] },
  },
  {
    id: "atype_presentation",
    slug: "presentation",
    title: "AI Presentation",
    description: "Session 2: an AI-generated presentation submitted as a PDF. Graded on visual appeal, brevity, and clarity.",
    teamBased: false,
    galleryEligible: false,
    aiGraded: true,
    submissionSchema: { fields: [f("pdf", "Presentation (PDF)", "file"), f("title", "Title (optional)", "text", false)] },
    rubric: {
      scale: 10,
      dimensions: [
        dim("visual-appeal", "Visual appeal", "Layout, hierarchy, imagery and overall design quality of the slides"),
        dim("brevity", "Brevity", "Says what matters with no filler; each slide earns its place"),
        dim("clarity", "Clarity in communication", "The message is unambiguous and easy to follow"),
      ],
    },
  },
  {
    id: "atype_costar",
    slug: "costar-prompt",
    title: "COSTAR Prompt",
    description: "Session 2: write a prompt using the COSTAR method. Graded on how well it applies each COSTAR element.",
    teamBased: false,
    galleryEligible: false,
    aiGraded: true,
    submissionSchema: {
      fields: [f("prompt", "Your COSTAR prompt", "writeup"), f("task", "What task is it for? (optional)", "text", false)],
    },
    rubric: {
      scale: 10,
      dimensions: [
        dim("context", "Context", "Sets the background/situation the model needs"),
        dim("objective", "Objective", "States the goal/task clearly and specifically"),
        dim("style", "Style", "Specifies the writing style or approach"),
        dim("tone", "Tone", "Specifies the desired tone"),
        dim("audience", "Audience", "Identifies who the output is for"),
        dim("response", "Response format", "Specifies the shape/format of the expected output"),
      ],
    },
  },
] as const;

const ASSIGNMENTS = [
  { id: "asg_s2_meme", typeId: "atype_meme", title: "S2 · Meme", brief: "Submit a meme from today's session. It goes to the section gallery — upvote at least 5 others to see how yours did." },
  { id: "asg_s2_ai_image", typeId: "atype_ai_image", title: "S2 · AI Image (SCENE)", brief: "Generate an image using the SCENE framework. Submit the image and the prompt you used." },
  { id: "asg_s2_presentation", typeId: "atype_presentation", title: "S2 · AI Presentation", brief: "Create an AI-generated presentation and submit it as a PDF." },
  { id: "asg_s2_costar", typeId: "atype_costar", title: "S2 · COSTAR Prompt", brief: "Write a prompt using the COSTAR method. We grade how well it applies each element." },
];

export async function createMissingSession2Gates(args: {
  db: Pick<PrismaClient, "gate">;
  sectionIds: string[];
  pageId: string;
  actorId: string;
  openedAt?: Date;
}): Promise<number> {
  const openedAt = args.openedAt ?? new Date();
  const gateRows = args.sectionIds.flatMap((sectionId) => [
    {
      targetType: "session" as const,
      targetId: args.pageId,
      sectionId,
      state: "open" as const,
      changedBy: args.actorId,
      openedAt,
    },
    ...ASSIGNMENTS.map((assignment) => ({
      targetType: "assignment" as const,
      targetId: assignment.id,
      sectionId,
      state: "open" as const,
      changedBy: args.actorId,
      openedAt,
    })),
  ]);
  const created = await args.db.gate.createMany({ data: gateRows, skipDuplicates: true });
  return created.count;
}

export async function main() {
  const sections = await prisma.section.findMany({ select: { id: true } });
  const sectionIds = sections.map((s) => s.id);
  const actor = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  const actorId = actor?.id ?? "system";

  // 1) Artifact types (upsert by slug).
  for (const t of TYPES) {
    await prisma.assignmentType.upsert({
      where: { slug: t.slug },
      create: {
        id: t.id, slug: t.slug, title: t.title, description: t.description,
        teamBased: t.teamBased, galleryEligible: t.galleryEligible, aiGraded: t.aiGraded,
        submissionSchema: t.submissionSchema, rubric: t.rubric,
      },
      update: {
        title: t.title, description: t.description, teamBased: t.teamBased,
        galleryEligible: t.galleryEligible, aiGraded: t.aiGraded,
        submissionSchema: t.submissionSchema, rubric: t.rubric,
      },
    });
  }
  console.log(`[s2] upserted ${TYPES.length} assignment types`);

  // 2) Assignments (upsert by stable id), all sections.
  for (const a of ASSIGNMENTS) {
    await prisma.assignment.upsert({
      where: { id: a.id },
      create: { id: a.id, assignmentTypeId: a.typeId, title: a.title, brief: a.brief, sessionNo: SESSION_NO, sectionIds, weightBucket: "artifact-quality" },
      update: { assignmentTypeId: a.typeId, title: a.title, brief: a.brief, sessionNo: SESSION_NO, sectionIds },
    });
  }
  console.log(`[s2] upserted ${ASSIGNMENTS.length} assignments`);

  // 3) Point the Session-2 hub at exactly these four; drop the quiz.
  const page = await prisma.sessionPage.findUnique({ where: { sessionNo: SESSION_NO } });
  if (!page) throw new Error("Session 2 page not found — seed the base world first");
  await prisma.sessionPage.update({
    where: { sessionNo: SESSION_NO },
    data: { linkedAssignmentIds: ASSIGNMENTS.map((a) => a.id), linkedQuizIds: [] },
  });

  // 4) Create the original Session-2 open gates only when absent. A rerun must
  // not reopen an instructor-closed S2 gate, and it must never relock or remove
  // Sessions 3–5 (or any future release).
  const createdCount = await createMissingSession2Gates({
    db: prisma,
    sectionIds,
    pageId: page.id,
    actorId,
  });
  console.log(
    `[s2] created ${createdCount} missing Session-2 gate rows across ${sectionIds.length} sections; existing and other-session gates preserved`,
  );
  console.log("[s2] done — Session 2 content is configured without changing any later release");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/session2-setup.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
