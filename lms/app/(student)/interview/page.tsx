import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";
import { InterviewRoom } from "./room";

// The student interview entry + room. The server component resolves the
// window/attempt situation; everything conversational happens in the client
// room against /api/interview/*. Consent (DPDP) is collected in the room
// BEFORE any mic access.

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function InterviewPage() {
  const user = await requireUser();

  const [window, latest, retake] = await Promise.all([
    user.sectionId
      ? prisma.interviewWindow.findFirst({
          where: { sectionId: user.sectionId },
          orderBy: { opensAt: "asc" },
        })
      : null,
    prisma.interview.findFirst({
      where: { userId: user.userId },
      orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      select: { id: true, status: true, attemptNumber: true, completedAt: true },
    }),
    prisma.interviewRetake.findFirst({
      where: { userId: user.userId, usedByInterviewId: null },
      select: { id: true },
    }),
  ]);

  const now = new Date();
  const windowOpen = Boolean(window && window.opensAt <= now && window.closesAt >= now);
  // A live interview can always be resumed; otherwise a fresh start needs an
  // open window and either no prior attempt or an unused retake grant.
  const canResume = latest?.status === "live";
  const canStart = windowOpen && (!latest || Boolean(retake));

  return (
    <main style={{ maxWidth: "44rem", margin: "0 auto", padding: "2.5rem 2rem" }}>
      <Eyebrow muted>AI Interview</Eyebrow>
      <h1
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: "1.75rem",
          margin: "0 0 1rem",
        }}
      >
        Your interview
      </h1>

      {window ? (
        <p style={{ color: "var(--charcoal)", margin: "0 0 1.5rem" }}>
          Window for your section: {fmt.format(window.opensAt)} — {fmt.format(window.closesAt)}
          {windowOpen ? " (open now)" : ""}
        </p>
      ) : (
        <p style={{ color: "var(--charcoal)", margin: "0 0 1.5rem" }}>
          No interview window is scheduled for your section yet.
        </p>
      )}

      {latest && !canResume && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <p style={{ margin: 0 }}>
            {latest.status === "completed"
              ? "Your interview is recorded. Grading takes a while — results will be shared after instructor review."
              : latest.status === "escalated"
                ? "Your interview is with an instructor for review. You'll hear once it's finalised."
                : latest.status === "graded"
                  ? "Your interview has been reviewed. Results are shared by your instructor."
                  : "Your interview is on record."}
          </p>
          {retake && windowOpen && (
            <p style={{ margin: "0.75rem 0 0", color: "var(--charcoal)" }}>
              Your instructor has granted you a retake — you can begin again below.
            </p>
          )}
        </Card>
      )}

      <InterviewRoom
        canStart={canStart}
        canResume={canResume}
        textMode={process.env.NEXT_PUBLIC_INTERVIEW_TEXT_MODE === "1"}
      />
    </main>
  );
}
