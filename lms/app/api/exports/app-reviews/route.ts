import { withAuth } from "@/lib/auth";
import { appReviewOverview } from "@/lib/app-reviews/service";
import { APP_REVIEW_RUBRIC_VERSION } from "@/lib/app-reviews/policy";
import { csvResponse, toCsv } from "@/lib/csv-export";

export const dynamic = "force-dynamic";
export const GET = withAuth(async (req) => {
  const data = await appReviewOverview();
  const kind = new URL(req.url).searchParams.get("kind");
  const users = new Map(data.users.map((user) => [user.id, user]));
  const entries = new Map(data.entries.map((entry) => [entry.id, entry]));
  let csv: string;
  if (kind === "completion") {
    csv = toCsv(["student_id", "name", "email", "section", "assigned", "completed", "required", "complete", "blocked"], data.users.map((user) => [user.id, user.name, user.email, user.section?.code, user.assigned, user.completed, 5, user.completed === 5 && user.blocked === 0, user.blocked]));
  } else if (kind === "scores") {
    csv = toCsv(["entry_id", "author_id", "author_email", "source_ref", "app_url", "reviews_received", "visual_mean", "functionality_mean", "overall_mean", "rubric_version", "grade_weight_applied"], data.entries.map((entry) => {
      const reviews = data.reviews.filter((row) => row.entryId === entry.id && row.completedAt && !row.retiredAt);
      const mean = (key: "visual" | "functionality" | "overall") => reviews.length ? reviews.reduce((sum, row) => sum + row[key]!, 0) / reviews.length : "";
      return [entry.id, entry.authorId, entry.author.email, entry.sourceRef, entry.appUrl, reviews.length, mean("visual"), mean("functionality"), mean("overall"), APP_REVIEW_RUBRIC_VERSION, "none"];
    }));
  } else {
    csv = toCsv(["review_id", "entry_id", "reviewer_id", "reviewer_email", "author_id", "author_email", "slot", "visual", "functionality", "overall", "comment", "access_issue", "assigned_at", "completed_at", "retired_at", "rubric_version"], data.reviews.map((review) => [
      review.id, review.entryId, review.reviewerId, users.get(review.reviewerId)?.email, entries.get(review.entryId)?.authorId, entries.get(review.entryId)?.author.email,
      review.slot, review.visual, review.functionality, review.overall, review.comment, review.accessIssue, review.assignedAt.toISOString(), review.completedAt?.toISOString(), review.retiredAt?.toISOString(), APP_REVIEW_RUBRIC_VERSION,
    ]));
  }
  const response = csvResponse(csv, `app_reviews_${kind === "completion" || kind === "scores" ? kind : "raw"}.csv`);
  response.headers.set("Cache-Control", "no-store");
  return response;
}, { role: "instructor" });
