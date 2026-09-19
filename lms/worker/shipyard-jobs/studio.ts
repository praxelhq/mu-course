import { randomUUID } from "node:crypto";
import type { Prisma, ShipyardStudioJob } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/db";
import { imagePart } from "@/lib/ai/openrouter";
import { callStudio } from "@/lib/ai/studio";
import { readObjectVersion } from "@/lib/s3";
import { renderLiveProduct } from "@/lib/shipyard/reviewer/render";
import {
  buildRedactor,
  type StudentIdentity,
} from "@/lib/shipyard/reviewer/anonymise";
import {
  canPass,
  coachSchema,
  ideaSchema,
  gateOpen,
  latestSubmission,
  reviewSchema,
} from "@/lib/shipyard/studio/contracts";
import {
  appRillSearch,
  cacheEvidence,
  knowledgeSearch,
  socialResearch,
  type Evidence,
} from "@/lib/shipyard/studio/evidence";
import { COACH_PROMPT, reviewPrompt } from "@/lib/shipyard/studio/prompts";
import { STUDIO_QUEUE } from "@/lib/shipyard/studio/service";
import { sourceEnabled } from "@/lib/shipyard/studio/settings";

const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function evidenceFor(
  job: ShipyardStudioJob,
  query: string,
  ideaId: string,
) {
  const knowledge = await knowledgeSearch(query);
  const previous = await prisma.shipyardStudioJob.findMany({
    where: {
      workspaceId: job.workspaceId,
      kind: "research",
      status: "complete",
      payload: { path: ["idea", "id"], equals: ideaId },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const enabled = await Promise.all(
    previous.map((j) =>
      sourceEnabled((j.payload as { source: string }).source),
    ),
  );
  const research = previous.flatMap((j, i) =>
    enabled[i] ? (j.result as { evidence?: Evidence[] })?.evidence || [] : [],
  );
  return [
    ...new Map([...knowledge, ...research].map((e) => [e.id, e])).values(),
  ].slice(0, 24);
}
async function modelCost(
  job: ShipyardStudioJob,
  result: {
    costUsd: number;
    modelUsed: string;
    providerUsed: string;
    tokensIn: number;
    tokensOut: number;
  },
) {
  await prisma.$transaction([
    prisma.costLog.create({
      data: {
        feature: `shipyard-studio-${job.kind}`,
        provider: result.providerUsed,
        model: result.modelUsed,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        refType: "studio-job",
        refId: job.id,
      },
    }),
    prisma.shipyardStudioJob.update({
      where: { id: job.id },
      data: { costUsd: { increment: result.costUsd } },
    }),
  ]);
}
async function finish(job: ShipyardStudioJob, result: unknown) {
  await prisma.shipyardStudioJob.updateMany({
    where: { id: job.id, lease: job.lease, status: "running" },
    data: {
      status: "complete",
      result: json(result),
      finishedAt: new Date(),
      error: null,
    },
  });
}
async function sendAppeal(job: ShipyardStudioJob) {
  const { appealId } = job.payload as { appealId: string };
  const appeal = await prisma.shipyardStudioAppeal.findUniqueOrThrow({
    where: { id: appealId },
  });
  if (appeal.emailStatus === "sent") return finish(job, { sent: true });
  const key = process.env.SHIPYARD_RESEND_API_KEY;
  if (!key)
    throw new Error(
      "Appeal email is not configured. Your appeal remains saved.",
    );
  if (Date.now() - appeal.createdAt.getTime() > 23 * 3600000)
    throw new Error(
      "Email needs manual reconciliation after its idempotency window.",
    );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "Idempotency-Key": `shipyard-appeal/${appeal.id}`,
    },
    body: JSON.stringify(appeal.emailPayload),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      `Email provider could not send the appeal (HTTP ${response.status}).`,
    );
  const body = await response.json();
  if (typeof body.id !== "string")
    throw new Error("Email provider returned no delivery receipt.");
  await prisma.shipyardStudioAppeal.update({
    where: { id: appeal.id },
    data: { emailStatus: "sent", emailId: body.id },
  });
  await finish(job, { sent: true });
}
async function review(job: ShipyardStudioJob) {
  const { submissionId } = job.payload as { submissionId: string };
  const submission = await prisma.shipyardStudioSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });
  if (submission.checkpoint === 3)
    throw new Error("Checkpoint 3 must never enter the reviewer.");
  if (submission.status !== "queued") return finish(job, { skipped: true });
  const snapshot = submission.snapshot as {
    ideaId: string;
    fields: {
      title?: string;
      description?: string;
      landingUrl?: string;
      job?: string;
      sketches?: string[];
      designs?: string[];
    };
  };
  const evidence = await evidenceFor(
    job,
    `${snapshot.fields.title || ""} ${snapshot.fields.description || snapshot.fields.job || ""}`,
    snapshot.ideaId,
  );
  const content: Array<
    { type: "text"; text: string } | ReturnType<typeof imagePart>
  > = [
    {
      type: "text",
      text: JSON.stringify({ submission: submission.snapshot, evidence }),
    },
  ];
  let unavailable = false;
  if (submission.checkpoint === 1) {
    const page = await renderLiveProduct(snapshot.fields.landingUrl!);
    unavailable = !page.ok || !page.domText.trim();
    content.push({
      type: "text",
      text: JSON.stringify({
        landing: {
          accessible: !unavailable,
          title: page.title,
          text: page.domText,
          notes: page.notes,
        },
      }),
    });
    if (page.screenshotPng)
      content.push(
        imagePart(page.screenshotPng.toString("base64"), "image/png"),
      );
  } else {
    const ids = [
      ...(snapshot.fields.sketches || []),
      ...(snapshot.fields.designs || []),
    ];
    const files = await prisma.shipyardStudioFile.findMany({
      where: {
        id: { in: ids },
        workspaceId: job.workspaceId,
        versionId: { not: null },
      },
    });
    unavailable = files.length !== ids.length;
    for (const file of files) {
      try {
        const bytes = await readObjectVersion(
          file.key,
          file.versionId!,
          file.bytes,
        );
        const magic = Buffer.from(bytes.subarray(0, 12));
        const valid =
          file.contentType === "image/png"
            ? magic
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : file.contentType === "image/jpeg"
              ? magic[0] === 255 && magic[1] === 216
              : magic.toString("ascii", 0, 4) === "RIFF" &&
                magic.toString("ascii", 8, 12) === "WEBP";
        if (!valid) throw new Error("Not a supported image");
        content.push(
          {
            type: "text",
            text: `${file.kind === "sketch" ? "EARLY HAND SKETCH / EXCALIDRAW" : "SUBSEQUENT STITCH DESIGN"}: ${file.name}`,
          },
          imagePart(Buffer.from(bytes).toString("base64"), file.contentType),
        );
      } catch {
        unavailable = true;
        content.push({
          type: "text",
          text: `Could not inspect ${file.kind}: ${file.name}.`,
        });
      }
    }
  }
  const redactions = { name: 0, email: 0, phone: 0, section: 0 };
  const redactors = (submission.members as StudentIdentity[]).map((identity) =>
    buildRedactor(identity),
  );
  const anonymisedContent = content.map((part) =>
    part.type === "text"
      ? {
          ...part,
          text: redactors.reduce(
            (text, redact) => redact(text, redactions),
            part.text,
          ),
        }
      : part,
  );
  const result = await callStudio({
    task: "verdict",
    system: reviewPrompt(submission.checkpoint),
    user: anonymisedContent,
    schema: reviewSchema,
    temperature: 0,
    maxTokens: 8192,
  });
  await modelCost(job, result);
  const validIds = new Set(evidence.map((e) => e.id));
  const data = {
    ...result.data,
    sourceIds: result.data.sourceIds.filter((id) => validIds.has(id)),
  };
  if (unavailable) {
    data.decision = "evidence_needed";
    data.summary =
      "Some submitted evidence could not be inspected. Provide accessible evidence and resubmit, or ask your instructor to review. " +
      data.summary;
  }
  const status = canPass(submission.checkpoint, data)
    ? "passed"
    : data.decision === "evidence_needed"
      ? "evidence_needed"
      : "revise";
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ShipyardStudioWorkspace" WHERE id=${job.workspaceId} FOR UPDATE`;
    const live = await tx.shipyardStudioJob.findUnique({
      where: { id: job.id },
    });
    const rows = await tx.shipyardStudioSubmission.findMany({
      where: { workspaceId: job.workspaceId },
    });
    if (live?.lease !== job.lease || live.status !== "running") return;
    if (
      latestSubmission(submission.checkpoint, rows)?.id === submission.id &&
      gateOpen(submission.checkpoint, rows) &&
      rows.find((r) => r.id === submission.id)?.status === "queued"
    ) {
      await tx.shipyardStudioSubmission.update({
        where: { id: submission.id },
        data: {
          status,
          review: json({
            ...data,
            evidence,
            model: result.modelUsed,
            provider: result.providerUsed,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            costUsd: result.costUsd,
            redactions,
            rubric: submission.rubric,
          }),
          reviewedAt: new Date(),
        },
      });
    }
    await tx.shipyardStudioJob.update({
      where: { id: job.id },
      data: {
        status: "complete",
        result: { submissionId, status },
        finishedAt: new Date(),
      },
    });
  });
}
export async function runStudioJob(id: string) {
  const lease = randomUUID();
  const claimed = await prisma.shipyardStudioJob.updateMany({
    where: { id, status: "queued" },
    data: {
      status: "running",
      lease,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (!claimed.count) return;
  const job = await prisma.shipyardStudioJob.findUniqueOrThrow({
    where: { id },
  });
  try {
    if (job.kind === "appeal") return await sendAppeal(job);
    const payload = job.payload as {
      message?: string;
      query?: string;
      source?: string;
      target?: string;
      idea?: {
        id: string;
        title: string;
        description: string;
        sketches?: string[];
        designs?: string[];
        references?: string[];
      };
    };
    if (job.kind === "research") {
      if (!(await sourceEnabled(payload.source!)))
        throw new Error("Social research source is paused by your instructor.");
      if (payload.source !== "market") {
        const result = await socialResearch(
          job.id,
          payload.source!,
          payload.query!,
          payload.target || "",
        );
        await prisma.shipyardStudioJob.update({
          where: { id },
          data: { costUsd: result.costUsd },
        });
        return await finish(job, result);
      }
      const knowledge = await knowledgeSearch(payload.query!);
      let apps: Evidence[] = [],
        notes: string[] = [];
      try {
        apps = await appRillSearch(payload.query!);
        await cacheEvidence(apps);
      } catch {
        notes = [
          "AppRill could not be reached. Existing knowledge remains available; try again later for fresh app data.",
        ];
      }
      return await finish(job, { evidence: [...knowledge, ...apps], notes });
    }
    if (job.kind === "review") return await review(job);
    if (job.kind !== "coach") throw new Error("Unknown studio job type");
    const evidence = await evidenceFor(
      job,
      `${payload.idea?.title || ""} ${payload.idea?.description || ""}`.trim() ||
        payload.message ||
        "",
      payload.idea!.id,
    );
    const attachments: Array<
      { type: "text"; text: string } | ReturnType<typeof imagePart>
    > = [];
    const fileIds = [
      ...(payload.idea?.references || []),
      ...(payload.idea?.sketches || []),
      ...(payload.idea?.designs || []),
    ].slice(0, 6);
    const files = await prisma.shipyardStudioFile.findMany({
      where: {
        id: { in: fileIds },
        workspaceId: job.workspaceId,
        versionId: { not: null },
      },
    });
    for (const file of files) {
      try {
        const bytes = await readObjectVersion(
          file.key,
          file.versionId!,
          file.bytes,
        );
        attachments.push(
          { type: "text", text: `Attached ${file.kind}: ${file.name}` },
          imagePart(Buffer.from(bytes).toString("base64"), file.contentType),
        );
      } catch {
        attachments.push({
          type: "text",
          text: `Cannot inspect attachment ${file.name}. Tell the student about this evidence gap.`,
        });
      }
    }
    const result = await callStudio({
      task: "verdict",
      system: COACH_PROMPT,
      user: [
        {
          type: "text",
          text: JSON.stringify({
            message: payload.message,
            idea: payload.idea,
            evidence,
            conversation: (
              await prisma.shipyardStudioJob.findMany({
                where: {
                  workspaceId: job.workspaceId,
                  kind: "coach",
                  status: "complete",
                  createdAt: { lt: job.createdAt },
                  payload: {
                    path: ["idea", "id"],
                    equals: (job.payload as { idea: { id: string } }).idea.id,
                  },
                },
                orderBy: { createdAt: "desc" },
                take: 8,
                select: { payload: true, result: true },
              })
            )
              .reverse()
              .map((j) => ({
                student: (j.payload as { message: string }).message,
                coach: (j.result as { answer: string }).answer,
              })),
          }),
        },
        ...attachments,
      ],
      schema: coachSchema,
      temperature: 0.2,
      maxTokens: 8192,
    });
    await modelCost(job, result);
    const validIds = new Set(evidence.map((e) => e.id));
    await finish(job, {
      ...result.data,
      suggestions: result.data.suggestions.filter(
        (s) => ideaSchema.shape[s.field].safeParse(s.value).success,
      ),
      sourceIds: result.data.sourceIds.filter((id) => validIds.has(id)),
      evidence,
      workspaceVersion: (job.payload as { workspaceVersion: number })
        .workspaceVersion,
    });
  } catch (error) {
    // Provider error bodies can contain credentials or student content. Store a bounded safe message only.
    const known =
      error instanceof Error &&
      /^(Appeal email|Email provider|Email needs|Social research|The AI reviewer|The source could|Research run|Provide a public|Use a public)/.test(
        error.message,
      );
    const message = known
      ? (error as Error).message.slice(0, 300)
      : "This job could not complete. Your work is saved. Retry, use another source, or escalate a checkpoint to your instructor.";
    await prisma.$transaction(async (tx) => {
      const changed = await tx.shipyardStudioJob.updateMany({
        where: { id, lease, status: "running" },
        data: { status: "failed", error: message, finishedAt: new Date() },
      });
      if (!changed.count) return;
      if (job.kind === "review")
        await tx.shipyardStudioSubmission.updateMany({
          where: {
            id: (job.payload as { submissionId: string }).submissionId,
            status: "queued",
          },
          data: { status: "awaiting_review" },
        });
      if (job.kind === "appeal")
        await tx.shipyardStudioAppeal.updateMany({
          where: {
            id: (job.payload as { appealId: string }).appealId,
            emailStatus: { not: "sent" },
          },
          data: { emailStatus: "failed" },
        });
    });
    console.warn(
      `[studio] ${job.kind} ${job.id} failed (${error instanceof Error ? error.name : "unknown"})`,
    );
  }
}
export async function sweepStudioJobs() {
  // A process may die between a provider response and persistence. Reviews are safe to resubmit;
  // paid social POSTs are not blindly replayed. Email retries keep the same provider idempotency key.
  const stale = await prisma.shipyardStudioJob.findMany({
    where: {
      status: "running",
      startedAt: { lt: new Date(Date.now() - 15 * 60000) },
    },
  });
  for (const j of stale) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.shipyardStudioJob.updateMany({
        where: { id: j.id, lease: j.lease, status: "running" },
        data: {
          status: j.kind === "appeal" && j.attempts < 2 ? "queued" : "failed",
          error:
            "The worker was interrupted. Your work is saved; retry or ask your instructor for review.",
        },
      });
      if (!changed.count) return;
      if (j.kind === "review")
        await tx.shipyardStudioSubmission.updateMany({
          where: {
            id: (j.payload as { submissionId: string }).submissionId,
            status: "queued",
          },
          data: { status: "awaiting_review" },
        });
      if (j.kind === "appeal" && j.attempts >= 2)
        await tx.shipyardStudioAppeal.updateMany({
          where: {
            id: (j.payload as { appealId: string }).appealId,
            emailStatus: { not: "sent" },
          },
          data: { emailStatus: "failed" },
        });
    });
  }
  const jobs = await prisma.shipyardStudioJob.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: 4,
  });
  for (let i = 0; i < jobs.length; i += 2)
    await Promise.all(jobs.slice(i, i + 2).map((j) => runStudioJob(j.id)));
}
export async function startStudioWorker(boss: PgBoss) {
  await boss.createQueue(STUDIO_QUEUE, { retryLimit: 1, expireInSeconds: 900 });
  await boss.work(
    STUDIO_QUEUE,
    { batchSize: 1, localConcurrency: 1 },
    async () => {
      await sweepStudioJobs();
    },
  );
  await boss.schedule(STUDIO_QUEUE, "* * * * *", {});
  await boss.send(STUDIO_QUEUE, {});
}
