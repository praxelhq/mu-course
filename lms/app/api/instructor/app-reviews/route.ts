import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { AppReviewError, importAppReviewEntries, replaceReportedAppReview, setAppReviewGate } from "@/lib/app-reviews/service";
import { parseAppReviewCsv } from "@/lib/app-reviews/import";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), csv: z.string().max(2_000_000), apply: z.boolean() }).strict(),
  z.object({ action: z.literal("gate"), sectionId: z.string().min(1), state: z.enum(["open", "closed"]) }).strict(),
  z.object({ action: z.literal("replace"), reviewId: z.string().min(1) }).strict(),
]);
export const POST = withAuth(async (req, { user }) => {
  const text = await req.text();
  if (text.length > 2_100_000) return Response.json({ error: "Import is too large." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON." }, { status: 422 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid instructor request." }, { status: 422 });
  try {
    const command = parsed.data;
    if (command.action === "gate") return Response.json(await setAppReviewGate(command.sectionId, command.state, user.userId));
    if (command.action === "replace") return Response.json(await replaceReportedAppReview(command.reviewId, user.userId));
    let rows;
    try { rows = parseAppReviewCsv(command.csv); }
    catch (error) { throw new AppReviewError(error instanceof Error ? error.message : "Invalid CSV.", 422); }
    if (!rows.length || rows.length > 1000) throw new AppReviewError("Import between 1 and 1,000 student rows.", 422);
    return Response.json(await importAppReviewEntries(rows, user.userId, command.apply));
  } catch (error) {
    if (error instanceof AppReviewError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}, { role: "instructor" });
