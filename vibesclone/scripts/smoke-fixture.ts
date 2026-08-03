import { randomUUID } from "node:crypto";
import { understandingSchema } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import { analyzeProject, generateProjectPrompts } from "@/worker/jobs";

async function main(): Promise<void> {
  if (process.env.FIXTURE_MODE !== "true") throw new Error("smoke:fixture requires FIXTURE_MODE=true");
  const identity = `smoke-${randomUUID()}`;
  const user = await prisma.user.create({ data: { clerkUserId: identity, email: `${identity}@example.test` } });
  const analysisRunId = randomUUID();
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: "Smoke project",
      sourceUrl: "https://linear.app/",
      niche: "Independent recruiters",
      usp: "Local-first pipeline with zero setup",
      buildTarget: "claude-code",
      status: "analyzing",
      jobs: { create: { id: analysisRunId, kind: "analyze", idempotencyKey: `smoke-analysis:${analysisRunId}` } },
    },
  });
  try {
    await analyzeProject({ projectId: project.id, runId: analysisRunId });
    const analyzed = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { understandings: true } });
    if (analyzed.status !== "review" || analyzed.currentUnderstanding !== 1) throw new Error("Analysis did not reach review.");
    const version = analyzed.understandings[0];
    const edited = understandingSchema.parse(version.content);
    edited.features[0].disposition = "remove";
    await prisma.$transaction([
      prisma.understandingVersion.update({ where: { id: version.id }, data: { content: edited, approvedAt: new Date() } }),
      prisma.project.update({ where: { id: project.id }, data: { status: "approved", approvedVersion: 1 } }),
    ]);
    const generationRunId = randomUUID();
    await prisma.$transaction([
      prisma.providerRun.create({ data: { id: generationRunId, projectId: project.id, kind: "generate", idempotencyKey: `smoke-generation:${generationRunId}` } }),
      prisma.project.update({ where: { id: project.id }, data: { status: "generating" } }),
    ]);
    await generateProjectPrompts({ projectId: project.id, runId: generationRunId });
    const completed = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { promptSets: true } });
    if (completed.status !== "complete" || completed.promptSets.length !== 1) throw new Error("Generation did not complete exactly once.");
    const promptText = JSON.stringify(completed.promptSets[0].content);
    if (promptText.includes(edited.features[0].name)) throw new Error("A removed feature leaked into prompts.");
    console.log(JSON.stringify({ status: completed.status, understandingVersion: completed.approvedVersion, promptSets: completed.promptSets.length, removedFeatureExcluded: true }));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
