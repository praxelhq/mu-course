import { prisma } from "@/lib/db";
import { researchSources, sourceEnabled } from "./settings";

export async function instructorState() {
  const [appeals, workspaces, knowledge, failures, spend, switches] =
    await Promise.all([
      prisma.shipyardStudioAppeal.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          studentEmail: true,
          reason: true,
          emailStatus: true,
          decision: true,
          createdAt: true,
          submission: {
            select: {
              workspaceId: true,
              checkpoint: true,
              version: true,
              status: true,
              workspace: { select: { name: true } },
            },
          },
        },
      }),
      prisma.shipyardStudioWorkspace.findMany({
        orderBy: { updatedAt: "desc" },
        take: 500,
        select: {
          id: true,
          name: true,
          updatedAt: true,
          members: { select: { identity: { select: { email: true } } } },
          submissions: {
            orderBy: { version: "desc" },
            distinct: ["checkpoint"],
            select: {
              id: true,
              checkpoint: true,
              version: true,
              status: true,
              snapshot: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.shipyardStudioKnowledge.groupBy({
        by: ["source"],
        _count: true,
        _max: { capturedAt: true, updatedAt: true },
      }),
      prisma.shipyardStudioJob.findMany({
        where: { status: "failed" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          workspaceId: true,
          kind: true,
          error: true,
          createdAt: true,
          workspace: { select: { name: true } },
        },
      }),
      prisma.shipyardStudioJob.groupBy({
        by: ["workspaceId"],
        where: { createdAt: { gte: new Date(Date.now() - 86400000) } },
        _sum: { costUsd: true },
        _count: true,
      }),
      Promise.all(
        researchSources.map(async (source) => ({
          source,
          enabled: await sourceEnabled(source),
        })),
      ),
    ]);
  // The overview only needs the short idea, not every full design/spec snapshot.
  const overviewWorkspaces = workspaces.map((w) => ({
    ...w,
    submissions: w.submissions.map(({ snapshot, ...s }) => {
      const fields = (
        snapshot as { fields?: { title?: string; description?: string } }
      ).fields;
      return {
        ...s,
        snapshot:
          s.checkpoint === 1
            ? {
                fields: {
                  title: fields?.title,
                  description: fields?.description,
                },
              }
            : null,
      };
    }),
  }));
  return {
    appeals,
    workspaces: overviewWorkspaces,
    knowledge,
    failures,
    spend,
    switches,
  };
}
export type InstructorState = Awaited<ReturnType<typeof instructorState>>;
