import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { controlDataRace, DataRaceError } from "@/lib/data-race";

const Body = z.object({
  sectionCode: z.string().trim().min(1).max(2),
  action: z.enum(["start", "show_leaderboard", "next", "reset", "end"]),
}).strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid control action." }, { status: 400 });
  try {
    return Response.json(await controlDataRace({ ...parsed.data, actorId: user.userId }));
  } catch (error) {
    if (error instanceof DataRaceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}, { role: "instructor" });
