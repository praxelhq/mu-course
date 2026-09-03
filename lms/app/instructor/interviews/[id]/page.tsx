import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { presignGet, s3Configured } from "@/lib/s3";
import { Card, Eyebrow } from "@/components/ui";
import { INTERVIEW_CATEGORIES } from "@/lib/ai/interview-grading";
import { InterviewActions, RegenerateInterview } from "./actions";

// One interview: transcript with per-turn audio (presigned, short TTL),
// rubric + escalation reason, and the resolution actions (audited).

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const fmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, section: { select: { code: true } } } },
      turns: { orderBy: { turnNo: "asc" } },
    },
  });
  if (!interview) notFound();

  const turns = interview.turns.filter((t) => t.turnNo > 0);
  const audioUrls = new Map<number, string>();
  if (s3Configured()) {
    for (const t of turns) {
      if (t.audioS3Key && t.audioS3VersionId) {
        try {
          audioUrls.set(
            t.turnNo,
            await presignGet(t.audioS3Key, { versionId: t.audioS3VersionId }),
          );
        } catch {
          // Missing object / signing hiccup — the text transcript still stands.
        }
      }
    }
  }

  const scores = (interview.rubricScores ?? null) as Record<string, unknown> | null;
  const rationales = (scores?.rationales ?? {}) as Record<string, string>;
  const t0 = turns[0]?.startedAt.getTime() ?? 0;

  const retake = await prisma.interviewRetake.findFirst({
    where: { userId: interview.user.id, usedByInterviewId: null },
  });

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 2rem" }}>
      <Eyebrow muted>Interview · {interview.status}</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.75rem", margin: "0 0 0.25rem" }}>
        {interview.user.name}
      </h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem" }}>
        {interview.user.email}
        {interview.user.section ? ` · Section ${interview.user.section.code}` : ""} · attempt{" "}
        {interview.attemptNumber} · started {fmt.format(interview.createdAt)}
        {interview.completedAt ? ` · completed ${fmt.format(interview.completedAt)}` : ""}
      </p>

      {interview.escalationReason && (
        <Card style={{ marginBottom: "1.5rem", borderColor: "#8a3b1c" }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "#8a3b1c", margin: "0 0 0.5rem" }}>
            Escalation reason
          </p>
          <p style={{ margin: 0 }}>{interview.escalationReason}</p>
        </Card>
      )}

      {scores && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 1rem" }}>
            Rubric scores{typeof scores.total === "number" ? ` — ${scores.total}/100` : ""}
            {interview.confidence != null ? ` · confidence ${interview.confidence.toFixed(2)}` : ""}
          </p>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {INTERVIEW_CATEGORIES.map((key) => (
              <div key={key} style={{ borderTop: "1px solid var(--sand)", paddingTop: "0.75rem" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {key.replace(/_/g, " ")} —{" "}
                  {typeof scores[key] === "number" ? `${scores[key]}/25` : "—"}
                </p>
                {rationales[key] && (
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--charcoal)" }}>
                    {rationales[key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: "1.5rem" }}>
        <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 1rem" }}>
          Transcript
        </p>
        {turns.length === 0 && <p style={{ margin: 0 }}>No turns recorded.</p>}
        <div style={{ display: "grid", gap: "1rem" }}>
          {turns.map((t) => {
            const elapsed = Math.max(0, Math.round((t.startedAt.getTime() - t0) / 1000));
            const url = audioUrls.get(t.turnNo);
            return (
              <div key={t.turnNo} style={{ borderTop: "1px solid var(--sand)", paddingTop: "0.75rem" }}>
                <span style={{ ...mono, fontSize: "0.625rem", color: t.speaker === "agent" ? "var(--pine)" : "var(--charcoal)" }}>
                  {t.speaker === "agent" ? "Interviewer" : "Student"} · +{elapsed}s
                </span>
                <p style={{ margin: "0.25rem 0 0", lineHeight: 1.55 }}>{t.text}</p>
                {url && (
                  <audio controls src={url} style={{ marginTop: "0.5rem", width: "100%", maxWidth: "24rem" }} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <InterviewActions
        interviewId={interview.id}
        studentUserId={interview.user.id}
        status={interview.status}
        currentScores={Object.fromEntries(
          INTERVIEW_CATEGORIES.map((k) => [k, typeof scores?.[k] === "number" ? (scores[k] as number) : 0]),
        )}
        hasUnusedRetake={Boolean(retake)}
      />
      <RegenerateInterview interviewId={interview.id} />
    </main>
  );
}
