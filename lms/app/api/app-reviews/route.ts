import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { AppReviewError, assignAppReviews, getStudentAppReviews, reportAppReviewIssue, submitAppReview } from "@/lib/app-reviews/service";

export const dynamic = "force-dynamic";
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("submit"), reviewId: z.string().min(1).max(100), review: z.unknown() }).strict(),
  z.object({ action: z.literal("report"), reviewId: z.string().min(1).max(100), comment: z.string().max(5000) }).strict(),
]);
function failure(error: unknown): Response {
  if (error instanceof AppReviewError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  throw error;
}
export const GET = withAuth(async (_req, { user }) => {
  try { return Response.json(await getStudentAppReviews(user), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
});
export const POST = withAuth(async (req, { user }) => {
  // Bounded payload before parsing; no caller-supplied reviewer/author identity.
  const text = await req.text();
  if (text.length > 24000) return Response.json({ error: "Review request is too large." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON." }, { status: 422 }); }
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid review request." }, { status: 422 });
  try {
    const command = parsed.data;
    if (command.action === "start") return Response.json(await assignAppReviews(user));
    if (command.action === "report") return Response.json(await reportAppReviewIssue(user, command.reviewId, command.comment));
    return Response.json(await submitAppReview(user, command.reviewId, command.review));
  } catch (error) { return failure(error); }
});
