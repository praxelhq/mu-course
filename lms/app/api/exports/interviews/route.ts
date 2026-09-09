import { withAuth } from "@/lib/auth";
import { csvResponse } from "@/lib/csv-export";
import { buildInterviewScoreCsv } from "@/lib/interview/score-export";

// Instructor CSV export of interview status + rubric scores. One row per
// interview attempt, escalation reason included so the review queue can be
// worked from a spreadsheet.
//
// The rows come from buildInterviewScoreCsv, shared with the token feed, so a
// score can never read one way here and another way in the sheet.

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async () => csvResponse(await buildInterviewScoreCsv(), "interviews.csv"),
  { role: "instructor" },
);
