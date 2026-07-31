import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { DataRaceError, submitDataRaceAnswer } from "@/lib/data-race";

const Body = z.object({ questionId: z.string().min(1), selectedOptionId: z.string().min(1) }).strict();

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "student") return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid answer." }, { status: 400 });
  try {
    return Response.json(
      await submitDataRaceAnswer({ userId: user.userId, sectionId: user.sectionId, ...parsed.data }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DataRaceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
});
