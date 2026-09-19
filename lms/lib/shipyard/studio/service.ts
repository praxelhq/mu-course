import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { headObject, presignGet, presignPut } from "@/lib/s3";
import { getBoss } from "@/lib/queue";
import {
  actionSchema,
  allowedEmail,
  checkpointFields,
  documentSchema,
  emptyDocument,
  gateOpen,
  latestSubmission,
  RUBRIC,
} from "./contracts";
import { StudioError, type StudioActor } from "./auth";
import { sourceEnabled } from "./settings";
import type { z } from "zod";

type Tx = Prisma.TransactionClient;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const STUDIO_QUEUE = "shipyard.studio";
export async function wakeStudio() {
  try {
    const boss = await getBoss();
    await boss.createQueue(STUDIO_QUEUE);
    await boss.send(STUDIO_QUEUE, {});
  } catch {
    /* The durable database job is recovered by the worker's minute sweep. */
  }
}
async function membership(tx: Tx, actor: StudioActor) {
  const member = await tx.shipyardStudioMember.findUnique({
    where: { identityId: actor.id },
    include: { workspace: true },
  });
  if (!member) throw new StudioError(404, "Create or join a workspace first.");
  await tx.$queryRaw`SELECT id FROM "ShipyardStudioWorkspace" WHERE id=${member.workspaceId} FOR UPDATE`;
  const fresh = await tx.shipyardStudioMember.findUnique({
    where: { identityId: actor.id },
    include: { workspace: true },
  });
  if (!fresh || fresh.workspaceId !== member.workspaceId)
    throw new StudioError(
      403,
      "Your team membership changed. Reload Shipyard.",
    );
  return fresh;
}
function owner(role: string) {
  if (role !== "owner")
    throw new StudioError(403, "Only the team owner can manage membership.");
}
function currentVersion(expected: number, actual: number) {
  if (expected !== actual)
    throw new StudioError(
      409,
      "A teammate saved changes. Reload the workspace before saving or submitting. Your unsaved text is still here.",
    );
}
async function budget(tx: Tx, workspaceId: string, kind: string) {
  const since = new Date(Date.now() - 86400000);
  // Serialize admission across teams and reserve spend for pending/uncertain calls.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shipyard-studio-budget'))`;
  const [count, active, global, cohort] = await Promise.all([
    tx.shipyardStudioJob.count({
      where: { workspaceId, kind, createdAt: { gte: since } },
    }),
    tx.shipyardStudioJob.count({
      where: { workspaceId, status: { in: ["queued", "running"] } },
    }),
    tx.$queryRaw<Array<{ allocated: number }>>`SELECT COALESCE(SUM(CASE
      WHEN (status IN ('queued', 'running', 'failed') OR (status = 'cancelled' AND "startedAt" IS NOT NULL AND "costUsd" = 0)) AND kind IN ('coach', 'review', 'research')
        THEN GREATEST("costUsd", 1.0) ELSE "costUsd" END), 0)::float8 AS allocated
      FROM "ShipyardStudioJob" WHERE "createdAt" >= ${since}`,
    tx.$queryRaw<Array<{ allocated: number }>>`SELECT COALESCE(SUM(CASE
      WHEN status IN ('queued', 'running', 'failed') OR (status = 'cancelled' AND "startedAt" IS NOT NULL AND "costUsd" = 0) THEN GREATEST("costUsd", 1.0)
      ELSE "costUsd" END), 0)::float8 AS allocated
      FROM "ShipyardStudioJob" WHERE kind IN ('coach', 'review')`,
  ]);
  if (active >= 3)
    throw new StudioError(
      429,
      "Your team already has three jobs in progress. Wait or cancel one.",
    );
  if (count >= (kind === "coach" ? 30 : 10))
    throw new StudioError(
      429,
      "Your team's daily limit is reached. Try again tomorrow.",
    );
  if (kind === "coach" || kind === "review") {
    const total = Number(process.env.SHIPYARD_COHORT_AI_BUDGET_USD || 150);
    const reserve = Number(process.env.SHIPYARD_REVIEW_RESERVE_USD || 40);
    const limit = kind === "coach" ? Math.max(0, total - reserve) : total;
    if (!Number.isFinite(limit) || (cohort[0]?.allocated || 0) + 1 > limit)
      throw new StudioError(
        429,
        kind === "coach"
          ? "The shared coaching budget is reached. Your work is saved and checkpoint reviews remain available. Contact build@praxel.in."
          : "The shared AI review budget is reached. Your work is saved. Contact build@praxel.in for instructor review.",
      );
  }
  if (
    (global[0]?.allocated || 0) + 1 >
    Number(process.env.SHIPYARD_DAILY_BUDGET_USD || 50)
  )
    throw new StudioError(
      429,
      "Today's research and review budget is used. Please try tomorrow or contact build@praxel.in.",
    );
}
export async function studioState(actor: StudioActor, workspaceId?: string) {
  const own = await prisma.shipyardStudioMember.findUnique({
    where: { identityId: actor.id },
  });
  const id = actor.staff && workspaceId ? workspaceId : own?.workspaceId;
  if (!id)
    return {
      actor: {
        id: actor.id,
        email: actor.email,
        name: actor.name,
        staff: actor.staff,
      },
      workspace: null,
    };
  const workspace = await prisma.shipyardStudioWorkspace.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          identity: { select: { id: true, email: true, name: true } },
        },
      },
      invitations: {
        where: {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, email: true, expiresAt: true },
      },
      submissions: {
        orderBy: { createdAt: "desc" },
        include: { appeal: true },
      },
      jobs: { orderBy: { createdAt: "desc" }, take: 60 },
      files: {
        where: { versionId: { not: null } },
        select: {
          id: true,
          name: true,
          kind: true,
          contentType: true,
          bytes: true,
        },
      },
    },
  });
  // Tokens, email payloads, storage keys and provider errors stay server-side.
  return {
    actor: {
      id: actor.id,
      email: actor.email,
      name: actor.name,
      staff: actor.staff,
    },
    workspace: workspace && {
      ...workspace,
      submissions: workspace.submissions.map((s) => ({
        ...s,
        appeal: s.appeal && {
          id: s.appeal.id,
          reason: s.appeal.reason,
          emailStatus: s.appeal.emailStatus,
          decision: s.appeal.decision,
          decisionNote: s.appeal.decisionNote,
          createdAt: s.appeal.createdAt,
        },
      })),
      jobs: workspace.jobs.map((j) => ({
        id: j.id,
        kind: j.kind,
        status: j.status,
        payload: j.payload,
        result: j.result,
        error: j.error,
        createdAt: j.createdAt,
        costUsd: j.costUsd,
      })),
    },
  };
}

export async function performStudioAction(
  actor: StudioActor,
  input: z.infer<typeof actionSchema>,
) {
  if (input.action === "source-setting") {
    if (!actor.staff) throw new StudioError(403, "Instructor access required.");
    await prisma.$transaction(async (tx) => {
      const key = `shipyard.studio.source.${input.source}`;
      const before = await tx.configKV.findUnique({ where: { key } });
      await tx.configKV.upsert({
        where: { key },
        create: { key, value: input.enabled },
        update: { value: input.enabled },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "studio.source-setting",
          targetType: "ShipyardStudio",
          targetId: input.source,
          before: before?.value ?? true,
          after: input.enabled,
        },
      });
    });
    return { ok: true };
  }
  if (input.action === "upload") {
    const member = await prisma.shipyardStudioMember.findUnique({
      where: { identityId: actor.id },
    });
    if (!member) throw new StudioError(404, "Create a workspace first.");
    const count = await prisma.shipyardStudioFile.count({
      where: { workspaceId: member.workspaceId },
    });
    if (count >= 150)
      throw new StudioError(
        429,
        "Workspace upload limit reached. Contact your instructor.",
      );
    const key = `shipyard-studio/${member.workspaceId}/${randomUUID()}`;
    const signed = await presignPut({
      key,
      contentType: input.contentType,
      maxBytes: input.bytes,
      oneTime: true,
    });
    const file = await prisma.shipyardStudioFile.create({
      data: {
        workspaceId: member.workspaceId,
        actorId: actor.id,
        key,
        name: input.name,
        kind: input.kind,
        contentType: input.contentType,
        bytes: input.bytes,
      },
    });
    return { fileId: file.id, ...signed };
  }
  if (input.action === "confirm-upload") {
    const member = await prisma.shipyardStudioMember.findUnique({
      where: { identityId: actor.id },
    });
    const file = await prisma.shipyardStudioFile.findFirst({
      where: {
        id: input.fileId,
        workspaceId: member?.workspaceId || "none",
        actorId: actor.id,
      },
    });
    if (!file) throw new StudioError(404, "Upload not found.");
    if (file.versionId) return { fileId: file.id };
    const head = await headObject(file.key);
    if (
      !head ||
      head.contentLength !== file.bytes ||
      head.contentType !== file.contentType ||
      !head.versionId
    )
      throw new StudioError(
        422,
        "Upload could not be verified. Please upload the image again.",
      );
    await prisma.shipyardStudioFile.updateMany({
      where: { id: file.id, versionId: null },
      data: { versionId: head.versionId },
    });
    return { fileId: file.id };
  }
  const result = await prisma.$transaction(
    async (tx) => {
      if (input.action === "create") {
        if (
          await tx.shipyardStudioMember.findUnique({
            where: { identityId: actor.id },
          })
        )
          throw new StudioError(409, "You already belong to a workspace.");
        const doc = emptyDocument();
        const workspace = await tx.shipyardStudioWorkspace.create({
          data: {
            name: input.name,
            document: json(doc),
            members: { create: { identityId: actor.id, role: "owner" } },
            revisions: {
              create: {
                version: 0,
                actorId: actor.id,
                reason: "Created workspace",
                document: json(doc),
              },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "studio.created",
            targetType: "ShipyardStudioWorkspace",
            targetId: workspace.id,
          },
        });
        return { workspaceId: workspace.id };
      }
      if (input.action === "join") {
        const invite = await tx.shipyardStudioInvitation.findUnique({
          where: { tokenHash: hash(input.token) },
        });
        if (
          !invite ||
          invite.email !== actor.email ||
          invite.revokedAt ||
          invite.expiresAt < new Date()
        )
          throw new StudioError(
            403,
            "This invitation is expired or belongs to a different MU email.",
          );
        await tx.$queryRaw`SELECT id FROM "ShipyardStudioWorkspace" WHERE id=${invite.workspaceId} FOR UPDATE`;
        const consumed = await tx.shipyardStudioInvitation.updateMany({
          where: {
            id: invite.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date() },
        });
        if (!consumed.count)
          throw new StudioError(
            409,
            "This invitation has already been used or revoked.",
          );
        if (
          await tx.shipyardStudioMember.findUnique({
            where: { identityId: actor.id },
          })
        )
          throw new StudioError(
            409,
            "You already belong to a workspace. Ask its owner to remove you before joining another.",
          );
        if (
          (await tx.shipyardStudioMember.count({
            where: { workspaceId: invite.workspaceId },
          })) >= 10
        )
          throw new StudioError(422, "This team already has ten members.");
        await tx.shipyardStudioMember.create({
          data: { workspaceId: invite.workspaceId, identityId: actor.id },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "studio.joined",
            targetType: "ShipyardStudioWorkspace",
            targetId: invite.workspaceId,
          },
        });
        return { workspaceId: invite.workspaceId };
      }
      if (input.action === "decide") {
        if (!actor.staff)
          throw new StudioError(403, "Instructor access required.");
        const appeal = await tx.shipyardStudioAppeal.findUnique({
          where: { id: input.appealId },
          include: { submission: true },
        });
        if (!appeal) throw new StudioError(404, "Appeal not found.");
        const submission = appeal.submission;
        await tx.$queryRaw`SELECT id FROM "ShipyardStudioWorkspace" WHERE id=${submission.workspaceId} FOR UPDATE`;
        const rows = await tx.shipyardStudioSubmission.findMany({
          where: { workspaceId: submission.workspaceId },
        });
        if (
          latestSubmission(submission.checkpoint, rows)?.id !== submission.id ||
          !gateOpen(submission.checkpoint, rows) ||
          submission.status === "superseded"
        )
          throw new StudioError(
            409,
            "This appeal belongs to an outdated submission. Review the current submission instead.",
          );
        const changed = await tx.shipyardStudioAppeal.updateMany({
          where: { id: appeal.id, decision: null },
          data: {
            decision: input.decision,
            decisionNote: input.note,
            decidedBy: actor.id,
            decidedAt: new Date(),
          },
        });
        if (!changed.count)
          throw new StudioError(
            409,
            "An instructor already decided this appeal.",
          );
        await tx.shipyardStudioSubmission.update({
          where: { id: submission.id },
          data: { status: input.decision === "approved" ? "passed" : "revise" },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "studio.appeal-decided",
            targetType: "ShipyardStudioAppeal",
            targetId: appeal.id,
            after: { decision: input.decision, note: input.note },
          },
        });
        return { ok: true };
      }
      const member = await membership(tx, actor);
      const workspace = member.workspace;
      if (input.action === "save") {
        currentVersion(input.version, workspace.version);
        const files = [
          ...new Set(
            input.document.ideas.flatMap((i) => [
              ...i.sketches,
              ...i.designs,
              ...(i.references || []),
            ]),
          ),
        ];
        if (
          files.length &&
          (await tx.shipyardStudioFile.count({
            where: {
              id: { in: files },
              workspaceId: workspace.id,
              versionId: { not: null },
            },
          })) !== files.length
        )
          throw new StudioError(
            422,
            "One or more designs are not verified uploads in this workspace.",
          );
        const next = workspace.version + 1;
        await tx.shipyardStudioWorkspace.update({
          where: { id: workspace.id },
          data: { version: next, document: json(input.document) },
        });
        await tx.shipyardStudioRevision.create({
          data: {
            workspaceId: workspace.id,
            version: next,
            actorId: actor.id,
            reason: input.reason || "Saved workspace",
            document: json(input.document),
          },
        });
        return { version: next };
      }
      if (input.action === "invite") {
        owner(member.role);
        const email = input.email.toLowerCase();
        if (!allowedEmail(email))
          throw new StudioError(422, "Invite a Masters’ Union email address.");
        if (
          (await tx.shipyardStudioMember.count({
            where: { workspaceId: workspace.id },
          })) >= 10
        )
          throw new StudioError(422, "Teams support up to ten members.");
        await tx.shipyardStudioInvitation.updateMany({
          where: { workspaceId: workspace.id, email, acceptedAt: null },
          data: { revokedAt: new Date() },
        });
        const token = randomBytes(32).toString("base64url");
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "studio.invited",
            targetType: "ShipyardStudioWorkspace",
            targetId: workspace.id,
            after: { email },
          },
        });
        await tx.shipyardStudioInvitation.create({
          data: {
            workspaceId: workspace.id,
            email,
            tokenHash: hash(token),
            expiresAt: new Date(Date.now() + 7 * 86400000),
          },
        });
        return {
          inviteUrl: `${process.env.APP_URL || "http://localhost:3000"}/shipyard/join?token=${token}`,
        };
      }
      if (input.action === "revoke") {
        owner(member.role);
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "studio.invitation-revoked",
            targetType: "ShipyardStudioWorkspace",
            targetId: workspace.id,
            after: { invitationId: input.invitationId },
          },
        });
        await tx.shipyardStudioInvitation.updateMany({
          where: {
            id: input.invitationId,
            workspaceId: workspace.id,
            acceptedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        return { ok: true };
      }
      if (input.action === "member") {
        owner(member.role);
        const target = await tx.shipyardStudioMember.findFirst({
          where: { id: input.memberId, workspaceId: workspace.id },
        });
        if (!target || target.id === member.id)
          throw new StudioError(422, "Choose another team member.");
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: `studio.member-${input.operation}`,
            targetType: "ShipyardStudioWorkspace",
            targetId: workspace.id,
            after: { identityId: target.identityId },
          },
        });
        if (input.operation === "remove")
          await tx.shipyardStudioMember.delete({ where: { id: target.id } });
        else {
          await tx.shipyardStudioMember.update({
            where: { id: member.id },
            data: { role: "member" },
          });
          await tx.shipyardStudioMember.update({
            where: { id: target.id },
            data: { role: "owner" },
          });
        }
        return { ok: true };
      }
      if (input.action === "cancel") {
        await tx.shipyardStudioJob.updateMany({
          where: {
            id: input.jobId,
            workspaceId: workspace.id,
            kind: { in: ["coach", "research"] },
            status: { in: ["queued", "running"] },
          },
          data: { status: "cancelled", finishedAt: new Date() },
        });
        return { ok: true };
      }
      if (input.action === "retry-email") {
        const appeal = await tx.shipyardStudioAppeal.findFirst({
          where: {
            id: input.appealId,
            submission: { workspaceId: workspace.id },
          },
        });
        if (!appeal || appeal.emailStatus !== "failed")
          throw new StudioError(
            409,
            "Only failed appeal emails can be retried.",
          );
        // Provider idempotency has a 24h lifetime. Older ambiguous deliveries need manual reconciliation.
        if (Date.now() - appeal.createdAt.getTime() > 23 * 3600000)
          throw new StudioError(
            409,
            "Please contact build@praxel.in with your appeal ID. This email needs manual reconciliation.",
          );
        await tx.shipyardStudioAppeal.update({
          where: { id: appeal.id },
          data: { emailStatus: "pending" },
        });
        await tx.shipyardStudioJob.updateMany({
          where: { requestKey: `appeal:${appeal.id}`, status: "failed" },
          data: { status: "queued", attempts: 0, error: null },
        });
        return { ok: true };
      }
      if (input.action === "appeal") {
        const rows = await tx.shipyardStudioSubmission.findMany({
          where: { workspaceId: workspace.id },
        });
        const s = rows.find((s) => s.id === input.submissionId);
        if (
          !s ||
          s.checkpoint === 3 ||
          !["revise", "evidence_needed", "awaiting_review"].includes(
            s.status,
          ) ||
          latestSubmission(s.checkpoint, rows)?.id !== s.id ||
          !gateOpen(s.checkpoint, rows)
        )
          throw new StudioError(
            409,
            "Only the current returned or unavailable review can be appealed.",
          );
        const previousAppeal = await tx.shipyardStudioAppeal.findUnique({
          where: { submissionId: s.id },
        });
        if (previousAppeal) return { appealId: previousAppeal.id };
        const id = randomUUID();
        const link = `${process.env.APP_URL || "http://localhost:3000"}/shipyard/reviews?workspace=${workspace.id}&appeal=${id}`;
        const emailPayload = {
          from: process.env.SHIPYARD_EMAIL_FROM || "Shipyard <build@praxel.in>",
          to: ["build@praxel.in"],
          cc: [actor.email],
          reply_to: actor.email,
          subject: `[Shipyard appeal] ${workspace.name} · checkpoint ${s.checkpoint} · v${s.version}`,
          text: `${actor.name} (${actor.email}) contests checkpoint ${s.checkpoint}, version ${s.version}.\n\nReason:\n${input.reason}\n\nSubmission:\n${JSON.stringify(s.snapshot, null, 2)}\n\nAI feedback:\n${JSON.stringify(s.review, null, 2)}\n\nReply all to continue the conversation. Record your decision here (instructor sign-in required):\n${link}\n\nAppeal ID: ${id}`,
        };
        await tx.shipyardStudioAppeal.create({
          data: {
            id,
            submissionId: s.id,
            actorId: actor.id,
            studentEmail: actor.email,
            reason: input.reason,
            emailPayload: json(emailPayload),
          },
        });
        await tx.shipyardStudioJob.create({
          data: {
            workspaceId: workspace.id,
            actorId: actor.id,
            kind: "appeal",
            requestKey: `appeal:${id}`,
            payload: { appealId: id },
          },
        });
        return { appealId: id };
      }
      const requestKey = `${workspace.id}:${input.action}:${input.requestId}`;
      const existing = await tx.shipyardStudioJob.findUnique({
        where: { requestKey },
      });
      if (existing) return { jobId: existing.id };
      const doc = documentSchema.parse(workspace.document),
        idea = doc.ideas.find((i) => i.id === doc.activeIdeaId)!;
      if (input.action === "submit") {
        currentVersion(input.version, workspace.version);
        const rows = await tx.shipyardStudioSubmission.findMany({
          where: { workspaceId: workspace.id },
        });
        if (!gateOpen(input.checkpoint, rows))
          throw new StudioError(
            409,
            "The previous checkpoint must pass before you submit this one.",
          );
        const fields = checkpointFields(input.checkpoint).parse(idea);
        if (input.checkpoint === 2) {
          for (const [kind, ids] of [
            ["sketch", idea.sketches],
            ["design", idea.designs],
          ] as const) {
            if (
              (await tx.shipyardStudioFile.count({
                where: {
                  workspaceId: workspace.id,
                  id: { in: ids },
                  kind,
                  versionId: { not: null },
                },
              })) !== ids.length
            )
              throw new StudioError(
                422,
                "Attach verified images in both design sections.",
              );
          }
        }
        const predecessor = latestSubmission(input.checkpoint - 1, rows);
        if (
          predecessor &&
          (predecessor.snapshot as { ideaId?: string }).ideaId !== idea.id
        )
          throw new StudioError(
            409,
            "Continue with the approved idea, or submit your new idea at checkpoint 1 first.",
          );
        const version =
          (latestSubmission(input.checkpoint, rows)?.version || 0) + 1;
        if (input.checkpoint < 3) await budget(tx, workspace.id, "review");
        const members = await tx.shipyardStudioMember.findMany({
          where: { workspaceId: workspace.id },
          include: {
            identity: { select: { id: true, email: true, name: true } },
          },
        });
        const s = await tx.shipyardStudioSubmission.create({
          data: {
            workspaceId: workspace.id,
            checkpoint: input.checkpoint,
            version,
            actorId: actor.id,
            snapshot: json({
              fields,
              ideaId: idea.id,
              workspaceVersion: workspace.version,
              previousSubmissionId: predecessor?.id || null,
              idea:
                input.checkpoint === 2
                  ? latestSubmission(1, rows)?.snapshot
                  : undefined,
            }),
            members: json(members.map((m) => m.identity)),
            rubric: RUBRIC,
            status: input.checkpoint === 3 ? "received" : "queued",
          },
        });
        await tx.shipyardStudioSubmission.updateMany({
          where: {
            workspaceId: workspace.id,
            checkpoint: { gt: input.checkpoint },
          },
          data: { status: "superseded" },
        });
        // Receipt job only provides request idempotency; checkpoint 3 never invokes a worker.
        const job = await tx.shipyardStudioJob.create({
          data: {
            workspaceId: workspace.id,
            actorId: actor.id,
            kind: input.checkpoint === 3 ? "receipt" : "review",
            requestKey,
            payload: { submissionId: s.id },
            status: input.checkpoint === 3 ? "complete" : "queued",
            finishedAt: input.checkpoint === 3 ? new Date() : null,
          },
        });
        return { submissionId: s.id, jobId: job.id };
      }
      await budget(tx, workspace.id, input.action);
      if (
        input.action === "research" &&
        !(await sourceEnabled(input.source, tx))
      )
        throw new StudioError(
          503,
          "This source is paused by your instructor. Choose another source.",
        );
      const job = await tx.shipyardStudioJob.create({
        data: {
          workspaceId: workspace.id,
          actorId: actor.id,
          kind: input.action,
          requestKey,
          payload: json({
            ...input,
            idea,
            workspaceVersion: workspace.version,
          }),
        },
      });
      return { jobId: job.id };
    },
    { timeout: 15000 },
  );
  void wakeStudio();
  return result;
}

export async function studioFileUrl(actor: StudioActor, id: string) {
  const member = await prisma.shipyardStudioMember.findUnique({
    where: { identityId: actor.id },
  });
  const file = await prisma.shipyardStudioFile.findFirst({
    where: {
      id,
      ...(!actor.staff ? { workspaceId: member?.workspaceId || "none" } : {}),
      versionId: { not: null },
    },
  });
  if (!file) throw new StudioError(404, "File not found.");
  return presignGet(file.key, { versionId: file.versionId! });
}
