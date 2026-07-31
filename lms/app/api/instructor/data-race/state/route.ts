import { withAuth } from "@/lib/auth";
import { DataRaceError, getInstructorRaceState } from "@/lib/data-race";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req) => {
  const section = new URL(req.url).searchParams.get("section") ?? "A";
  try {
    return Response.json(await getInstructorRaceState(section), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DataRaceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}, { role: "instructor" });
