import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { assignStudentSection, InstructorRosterError } from "@/lib/instructor-roster";

const Body = z.object({ email: z.string().trim().email(), sectionCode: z.string().trim().min(1).max(2) }).strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter an email and choose a section." }, { status: 400 });
  try {
    const result = await assignStudentSection({ actorId: user.userId, ...parsed.data });
    return Response.json(result, { status: result.status === "created" ? 201 : 200 });
  } catch (error) {
    if (error instanceof InstructorRosterError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}, { role: "instructor" });
