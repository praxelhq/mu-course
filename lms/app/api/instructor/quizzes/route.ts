import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { createQuiz, listQuizzesForInstructor } from "@/lib/quizzes/instructor";

// Instructor quiz CRUD. Creation validates 5–8 MCQs per the scoring
// methodology (docs/build/01_scoring_methodology.md §6). Arming/disarming is
// NOT here — it is a plain gate flip via /api/gates/set.

export const dynamic = "force-dynamic";

const questionSchema = z.object({
  q: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().min(0),
});

const createSchema = z.object({
  sessionNo: z.number().int().min(1).max(10),
  title: z.string().min(1).max(200),
  isDiagnostic: z.boolean().default(false),
  questions: z.array(questionSchema).min(5).max(8),
});

export const GET = withAuth(
  async () => Response.json({ quizzes: await listQuizzesForInstructor() }),
  { role: "instructor" },
);

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid quiz: need a title and 5–8 questions, each with options." },
        { status: 422 },
      );
    }
    for (const q of parsed.data.questions) {
      if (q.correctIndex >= q.options.length) {
        return Response.json(
          { error: "A question's correct answer is out of range." },
          { status: 422 },
        );
      }
    }
    const { id } = await createQuiz({ ...parsed.data, actorId: user.userId });
    return Response.json({ ok: true, id }, { status: 201 });
  },
  { role: "instructor" },
);
