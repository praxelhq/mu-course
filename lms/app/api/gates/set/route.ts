import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth";
import {
  bulkCloseSession,
  bulkOpenSession,
  QuizGateContractError,
  setGateState,
} from "@/lib/gates";

// Instructor gate toggles (single cell + session bulk actions) for the Unlock
// Console. Closing an assignment gate while students in that section still
// have DRAFT submissions requires confirmed:true — the endpoint answers
// { needsConfirm: true, draftCount } without changing state until then.

const singleSchema = z.object({
  targetType: z.enum(["session", "material", "assignment", "quiz"]),
  targetId: z.string().min(1),
  sectionId: z.string().min(1),
  state: z.enum(["locked", "open", "closed"]),
  confirmed: z.boolean().optional(),
});

const bulkSchema = z.object({
  bulk: z.enum(["open-session", "close-session"]),
  sessionPageId: z.string().min(1),
  sectionId: z.string().min(1),
  confirmed: z.boolean().optional(),
});

const bodySchema = z.union([bulkSchema, singleSchema]);

async function draftCountFor(assignmentIds: string[], sectionId: string): Promise<number> {
  if (assignmentIds.length === 0) return 0;
  return prisma.submission.count({
    where: {
      assignmentId: { in: assignmentIds },
      status: "draft",
      user: { sectionId },
    },
  });
}

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }
    const body = parsed.data;

    if ("bulk" in body) {
      const { bulk, sessionPageId, sectionId } = body;
      if (bulk === "close-session" && !body.confirmed) {
        const page = await prisma.sessionPage.findUnique({
          where: { id: sessionPageId },
          select: { linkedAssignmentIds: true },
        });
        if (!page) return Response.json({ error: "Unknown session" }, { status: 404 });
        const draftCount = await draftCountFor(page.linkedAssignmentIds, sectionId);
        if (draftCount > 0) return Response.json({ needsConfirm: true, draftCount });
      }
      if (bulk === "open-session") await bulkOpenSession(sessionPageId, sectionId, user.userId);
      else await bulkCloseSession(sessionPageId, sectionId, user.userId);
      return Response.json({ ok: true, state: bulk === "open-session" ? "open" : "closed" });
    }

    const { targetType, targetId, sectionId, state } = body;
    if (targetType === "assignment" && state === "closed" && !body.confirmed) {
      const draftCount = await draftCountFor([targetId], sectionId);
      if (draftCount > 0) return Response.json({ needsConfirm: true, draftCount });
    }
    try {
      const result = await setGateState({
        targetType,
        targetId,
        sectionId,
        state,
        actorId: user.userId,
      });
      return Response.json({ ok: true, state: result.after, changed: result.changed });
    } catch (error) {
      if (error instanceof QuizGateContractError) {
        return Response.json(
          { error: "Classify and publish this versioned quiz before arming it.", reason: error.reason },
          { status: 409 },
        );
      }
      throw error;
    }
  },
  { role: "instructor" },
);
