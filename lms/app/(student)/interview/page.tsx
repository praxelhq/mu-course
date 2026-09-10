import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shownWindowClose } from "@/lib/deadlines";
import { Card, Eyebrow } from "@/components/ui";
import { missingPrerequisites } from "@/lib/interview/prerequisites";
import { interviewOpen } from "@/lib/interview/rollout";
import { progressFromTurns, studentEscalationMail } from "@/lib/interview/escalation";
import { InterviewStart } from "./start";
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
  // Gating reads closesAt and ONLY closesAt. The date below it is what the
  // student is told; this is what the course actually enforces.
  const windowOpen = Boolean(window && window.opensAt <= now && window.closesAt >= now);
  const shownClose = window ? shownWindowClose(window) : null;
  // A live interview can always be resumed; otherwise a fresh start needs an
  // open window and either no prior attempt or an unused retake grant.
  const canResume = latest?.status === "live";
  // Once the interview has happened there is nothing left to upload, so the
  // whole "before you start" block goes away — leaving it up implies the
  // student still owes something. A granted retake brings it back.
  const interviewFinished =
    !!latest &&
    ["completed", "graded", "escalated"].includes(latest.status) &&
    !retake;
  // The three prerequisite artifacts gate the start alongside the window and
  // attempt guards; startInterview enforces the same rule server-side.
  const prerequisitesComplete = missingPrereqs.length === 0;
  const canStart =
    isOpen && windowOpen && (!latest || Boolean(retake)) && prerequisitesComplete;

  // Why there is no start control, in the student's own terms. A student whose
  // section window had closed the night before was shown "All three are in.
  // You can begin your interview below" with nothing below it — everything
  // asked of them done, and no way to tell whether they were early, late,
  // locked out, or looking at a broken page.
  const startBlockedReason = !prerequisitesComplete
    ? null // the card already lists what is missing
    : canStart || canResume
      ? null
      : !isOpen
        ? "The interview is not open yet. Your uploads are saved — come back when your instructor opens it."
        : !window
          ? "No interview window is scheduled for your section yet. Your uploads are saved."
          : window.opensAt > now
            ? `Your uploads are saved. Your section's window opens ${fmt.format(window.opensAt)}.`
            : window.closesAt < now
              ? `Your section's interview window closed on ${fmt.format(shownClose!)}. Your uploads are saved — ask your instructor if you still need to sit the interview.`
              : latest && !retake
                ? "You have already taken your interview. Ask your instructor for a retake if you need another attempt."
                : "Your interview cannot be started right now. Please tell your instructor what this page shows.";

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
          Window for your section: {fmt.format(window.opensAt)} — {fmt.format(shownClose!)}
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
            {/* `escalated` deliberately reads EXACTLY like `graded`. The result
                page goes to some length to keep the two indistinguishable, and
                this line quietly told every flagged student they had been
                flagged — which hands a cheater the feedback loop they need and
                turns every borderline case into a dispute. */}
            {latest.status === "completed"
              ? "Your interview is recorded and is being marked."
              : latest.status === "graded" || latest.status === "escalated"
                ? "Your interview is marked."
                : "Your interview is on record."}
          </p>
          {retake && windowOpen && (
            <p style={{ margin: "0.75rem 0 0", color: "var(--charcoal)" }}>
              Your instructor has granted you a retake — you can begin again below.
            </p>
          )}
        </Card>
      )}

      {/* Shown for a cut-off interview — but NOT for `escalated`, whose
          presence here was itself a disclosure: graded students never saw it. */}
      {latest &&
        latest.status !== "completed" &&
        latest.status !== "graded" &&
        latest.status !== "escalated" && (
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
          {!canResume && !interviewFinished && (
            <InterviewPrerequisites startBlockedReason={startBlockedReason} />
          )}

          {canStart || canResume ? <InterviewStart canResume={canResume} /> : null}
        </>
      )}
    </main>
  );
}
