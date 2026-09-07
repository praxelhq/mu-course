import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getBestOfThreeAvg, getStudentQuizHistory } from "@/lib/quizzes";
import { Card, Eyebrow } from "@/components/ui";

// The student's quiz record: every attempt with its score, labelled either as
// counting toward the grade (top three) or as feedback only. All data comes
// through the single student repository module (lib/quizzes).

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const releaseFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function QuizzesPage() {
  let userId: string;
  try {
    const user = await requireUser();
    if (user.role !== "student") redirect("/instructor/quizzes");
    userId = user.userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const now = new Date();
  const [attempts, avg] = await Promise.all([
    getStudentQuizHistory(userId, now),
    getBestOfThreeAvg(userId, now),
  ]);

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Quizzes</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Your quiz record</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Surprise quizzes land in class, unannounced. Your top three scores are averaged
        into the 5% quiz component of your grade once feedback is released; every other
        attempt still shows here as feedback.
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.25rem" }}>
              Best-of-three average
            </p>
            <p style={{ color: "var(--charcoal)", margin: 0, fontSize: "0.875rem" }}>
              The average of your top three scores — this is your current quiz component.
            </p>
          </div>
          <p style={{ fontFamily: "var(--font-fraunces)", fontSize: "2.5rem", fontWeight: 700, margin: 0, color: "var(--pine)" }}>
            {avg === null ? "—" : `${Math.round(avg * 10) / 10}%`}
          </p>
        </Card>

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Attempts</h2>
          {attempts.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0 }}>
              No quiz attempts yet. Quizzes appear on the session hub when armed in class.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {attempts.map((a) => (
                <li
                  key={a.attemptId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: "1rem",
                    borderBottom: "1px solid var(--sand)",
                    padding: "0.75rem 0",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{a.title}</p>
                    <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.25rem 0 0" }}>
                      Session {a.sessionNo} · {dateFmt.format(a.submittedAt)}
                    </p>
                    {a.feedbackStatus === "pending" && a.feedbackReleaseAt && (
                      <p style={{ fontSize: "0.75rem", color: "var(--charcoal)", margin: "0.375rem 0 0" }}>
                        Feedback releases {releaseFmt.format(a.feedbackReleaseAt)}.
                      </p>
                    )}
                  </div>
                  <span
                    style={{
                      ...mono,
                      fontSize: "0.625rem",
                      color: a.feedbackStatus === "pending" ? "var(--clay)" : a.countsTowardGrade ? "var(--pine)" : "var(--clay)",
                      border: `1px solid ${a.feedbackStatus === "released" && a.countsTowardGrade ? "var(--pine)" : "var(--sand)"}`,
                      padding: "0.125rem 0.5rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.feedbackStatus === "pending"
                      ? "Receipt only"
                      : a.countsTowardGrade
                        ? "Counts toward your grade"
                        : "Feedback only"}
                  </span>
                  <span style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: "1.25rem", color: "var(--ink)" }}>
                    {a.feedbackStatus === "released" && a.scorePct !== undefined
                      ? `${Math.round(a.scorePct * 10) / 10}%`
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
