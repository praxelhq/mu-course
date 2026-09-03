import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";
import { missingPrerequisites } from "@/lib/interview/prerequisites";
import { interviewOpen } from "@/lib/interview/rollout";
import { progressFromTurns, studentEscalationMail } from "@/lib/interview/escalation";
import { InterviewRoom } from "./room";
import { InterviewPrerequisites } from "./prerequisites";
import { InterviewEscalation } from "./escalate";

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

  const [window, latest, retake, missingPrereqs, isOpen] = await Promise.all([
    user.sectionId
      ? prisma.interviewWindow.findFirst({
          where: { sectionId: user.sectionId },
          orderBy: { opensAt: "asc" },
        })
      : null,
    prisma.interview.findFirst({
      where: { userId: user.userId },
      orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        attemptNumber: true,
        completedAt: true,
        createdAt: true,
        turns: { orderBy: { turnNo: "asc" }, select: { speaker: true, meta: true } },
      },
    }),
    prisma.interviewRetake.findFirst({
      where: { userId: user.userId, usedByInterviewId: null },
      select: { id: true },
    }),
    missingPrerequisites(user.userId),
    interviewOpen(),
  ]);

  const now = new Date();
  const windowOpen = Boolean(window && window.opensAt <= now && window.closesAt >= now);
  // A live interview can always be resumed; otherwise a fresh start needs an
  // open window and either no prior attempt or an unused retake grant.
  const canResume = latest?.status === "live";
  // The three prerequisite artifacts gate the start alongside the window and
  // attempt guards; startInterview enforces the same rule server-side.
  const prerequisitesComplete = missingPrereqs.length === 0;
  const canStart =
    isOpen && windowOpen && (!latest || Boolean(retake)) && prerequisitesComplete;

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

      {latest && latest.status !== "completed" && latest.status !== "graded" && (
        <InterviewEscalation
          {...(() => {
            const mail = studentEscalationMail(
              progressFromTurns({
                interviewId: latest.id,
                attemptNumber: latest.attemptNumber,
                createdAt: latest.createdAt,
                turns: latest.turns,
              }),
            );
            return { href: mail.href, body: mail.body, subject: mail.subject };
          })()}
        />
      )}

      {!isOpen && !canResume ? (
        <Card>
          <p style={{ margin: 0 }}>
            Interviews are not open yet. Your instructor will let you know when they are — nothing
            to do here until then.
          </p>
        </Card>
      ) : (
        <>
          {!canResume && <InterviewPrerequisites />}

          <InterviewRoom
            canStart={canStart}
            canResume={canResume}
            textMode={process.env.NEXT_PUBLIC_INTERVIEW_TEXT_MODE === "1"}
          />
        </>
      )}
    </main>
  );
}
