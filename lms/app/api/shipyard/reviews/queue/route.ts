import { withAuth } from "@/lib/auth";
import { loadReviewQueue } from "@/lib/shipyard/review-escalate";

// GET /api/shipyard/reviews/queue?sectionId=   (instructor or admin)
//   → 200 { entries: QueueEntry[] }
//
// SPEC §6's human review queue: every review flagged for a person and not yet
// ruled on, newest first. A HELD PASS is in here too — `heldPass: true` — and
// that is the case the queue exists for: the reviewer said pass, the gate is
// still shut, and only an instructor's ruling opens it.
//
// The payload is deliberately complete rather than minimal: the student, the
// checkpoint, the confidence, every rule that fired, the student's dispute if
// they made one, and the escalation second opinion if one was run. An
// instructor working a queue on a deadline night should not have to open a
// second page to decide.

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const sectionId = url.searchParams.get("sectionId");
    const limitRaw = Number(url.searchParams.get("limit"));
    const entries = await loadReviewQueue({
      sectionId: sectionId && sectionId !== "" ? sectionId : null,
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
    });
    return Response.json({ entries, count: entries.length });
  },
  { role: "instructor" },
);
