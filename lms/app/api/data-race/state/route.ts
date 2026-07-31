import { withAuth } from "@/lib/auth";
import { DataRaceError, getStudentRaceState } from "@/lib/data-race";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, { user }) => {
  if (user.role !== "student") return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const state = await getStudentRaceState(user.userId, user.sectionId);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DataRaceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
});
