import { z } from "zod";
import { withAuth, type SessionUser } from "@/lib/auth";
import {
  ResubmissionGrantAdminError,
  extendResubmissionGrant,
  issueRepairGrant,
} from "@/lib/resubmission-grant-admin";

export const dynamic = "force-dynamic";

const targetSchema = {
  assignmentId: z.string().trim().min(1).max(128),
  assessmentVersionId: z.string().trim().min(1).max(128),
  ownerKind: z.enum(["individual", "team"]),
  ownerId: z.string().trim().min(1).max(128),
  targetVersion: z.number().int().min(1).max(1_000),
  targetAttempt: z.number().int().min(1).max(1_000),
};

const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("issue-repair"),
      ...targetSchema,
      sourceSubmissionId: z.string().trim().min(1).max(128),
      expectedSourceUpdatedAt: z.string().datetime({ offset: true }),
      expiresAt: z.string().datetime({ offset: true }),
      reason: z.string().trim().min(3).max(1_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("extend"),
      ...targetSchema,
      grantId: z.string().trim().min(1).max(128),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
      expiresAt: z.string().datetime({ offset: true }),
      reason: z.string().trim().min(3).max(1_000),
    })
    .strict(),
]);

export function createInstructorSubmissionGrantHandler(options: {
  getUser?: (req: Request) => Promise<SessionUser | null>;
  issue?: typeof issueRepairGrant;
  extend?: typeof extendResubmissionGrant;
} = {}) {
  const issue = options.issue ?? issueRepairGrant;
  const extend = options.extend ?? extendResubmissionGrant;
  return withAuth(
    async (req, { user }) => {
      const parsed = bodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
      try {
        let result;
        if (parsed.data.action === "issue-repair") {
          const { action, expiresAt, expectedSourceUpdatedAt, ...data } = parsed.data;
          void action;
          result = await issue({
            ...data,
            expiresAt: new Date(expiresAt),
            expectedSourceUpdatedAt: new Date(expectedSourceUpdatedAt),
            actor: { userId: user.userId, role: user.role },
          });
        } else {
          const { action, expiresAt, expectedUpdatedAt, ...data } = parsed.data;
          void action;
          result = await extend({
            ...data,
            expiresAt: new Date(expiresAt),
            expectedUpdatedAt: new Date(expectedUpdatedAt),
            actor: { userId: user.userId, role: user.role },
          });
        }
        return Response.json(result);
      } catch (error) {
        if (error instanceof ResubmissionGrantAdminError) {
          return Response.json({ error: error.message }, { status: error.status });
        }
        throw error;
      }
    },
    { role: "instructor", ...(options.getUser ? { getUser: options.getUser } : {}) },
  );
}

export const POST = createInstructorSubmissionGrantHandler();
