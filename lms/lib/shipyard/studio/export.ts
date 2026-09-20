import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv-export";
import { featureText } from "./contracts";
import { StudioError, type StudioActor } from "./auth";

export async function submissionExport(actor: StudioActor) {
  if (!actor.staff) throw new StudioError(403, "Instructor access required.");
  const headers = [
    "Submission ID",
    "Submitted at",
    "Team",
    "Students at submission",
    "Checkpoint",
    "Version",
    "Status",
    "Title",
    "Idea",
    "Job spec",
    "Features",
    "Images (sign-in required)",
    "Product URL",
    "AI feedback",
    "Appeal",
    "Instructor decision",
    "Open project",
  ];
  const base = process.env.APP_URL || "https://lms.praxel.in";
  let cursor: string | undefined;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(toCsv(headers, [])));
    },
    async pull(controller) {
      const rows = await prisma.shipyardStudioSubmission.findMany({
        orderBy: { id: "asc" },
        take: 200,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          workspace: { select: { name: true } },
          appeal: { select: { reason: true, decision: true } },
        },
      });
      if (!rows.length) {
        controller.close();
        return;
      }
      // Final receipts point to the exact approved spec, even after later resubmissions.
      const predecessorIds = rows
        .filter((s) => s.checkpoint === 3)
        .flatMap((s) => {
          const id = (s.snapshot as { previousSubmissionId?: string })
            .previousSubmissionId;
          return id ? [id] : [];
        });
      const predecessors = await prisma.shipyardStudioSubmission.findMany({
        where: { id: { in: predecessorIds }, checkpoint: 2 },
        select: { id: true, snapshot: true },
      });
      const approvedIdeas = new Map(
        predecessors.map((s) => [
          s.id,
          (s.snapshot as { idea?: { fields?: Record<string, unknown> } }).idea
            ?.fields,
        ]),
      );
      const values = rows.map((s) => {
        const snapshot = s.snapshot as {
          fields: Record<string, unknown>;
          idea?: { fields?: Record<string, unknown> };
          previousSubmissionId?: string;
        };
        const fields = snapshot.fields || {};
        const idea =
          s.checkpoint === 1
            ? fields
            : snapshot.idea?.fields ||
              approvedIdeas.get(snapshot.previousSubmissionId || "") ||
              {};
        const images = [
          fields.visuals,
          fields.sketches,
          fields.designs,
        ].flatMap((v) =>
          Array.isArray(v)
            ? v.filter((id): id is string => typeof id === "string")
            : [],
        );
        const members = s.members as { email: string }[];
        return [
          s.id,
          s.createdAt.toISOString(),
          s.workspace.name,
          members.map((m) => m.email).join(", "),
          s.checkpoint,
          s.version,
          s.status,
          idea.title,
          idea.description,
          fields.job,
          featureText(fields as Parameters<typeof featureText>[0]),
          images
            .map(
              (id) =>
                `${base}/api/shipyard/studio?file=${encodeURIComponent(id)}`,
            )
            .join("\n"),
          fields.liveUrl || fields.landingUrl,
          (s.review as { summary?: string } | null)?.summary,
          s.appeal?.reason,
          s.appeal?.decision,
          `${base}/shipyard/reviews?workspace=${encodeURIComponent(s.workspaceId)}`,
        ];
      });
      // The first data row fills the serializer's header slot; all cells use the same escaping.
      controller.enqueue(encoder.encode(toCsv(values[0], values.slice(1))));
      cursor = rows.at(-1)!.id;
      if (rows.length < 200) controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="shipyard-submissions.csv"',
      "cache-control": "private, no-store",
    },
  });
}
