import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";

// U12 — instructor interview queue: escalations FIRST (they block finalising a
// 15% component), then completed (grading in flight), then graded. Live rows
// shown last for situational awareness.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const STATUS_ORDER: Record<string, number> = {
  escalated: 0,
  completed: 1,
  graded: 2,
  live: 3,
  pending: 4,
};

const STATUS_COLOR: Record<string, string> = {
  escalated: "#8a3b1c",
  completed: "#8a6a1c",
  graded: "var(--pine)",
  live: "var(--charcoal)",
  pending: "var(--clay)",
};

const fmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function InstructorInterviewsPage() {
  const interviews = await prisma.interview.findMany({
    include: {
      user: {
        select: { name: true, email: true, section: { select: { code: true } } },
      },
      _count: { select: { turns: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  interviews.sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );

  const escalatedCount = interviews.filter((i) => i.status === "escalated").length;

  return (
    <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "2.5rem 2rem" }}>
      <Eyebrow muted>Interviews</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.75rem", margin: "0 0 0.5rem" }}>
        AI interviews
      </h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem" }}>
        {escalatedCount > 0
          ? `${escalatedCount} escalation${escalatedCount === 1 ? "" : "s"} awaiting your review — these must be resolved before scores count.`
          : "No escalations waiting. Escalated interviews always appear at the top."}
      </p>

      <Card>
        {interviews.length === 0 && <p style={{ margin: 0 }}>No interviews yet.</p>}
        {interviews.map((iv) => {
          const scores = (iv.rubricScores ?? null) as Record<string, unknown> | null;
          const total = typeof scores?.total === "number" ? (scores.total as number) : null;
          const color = STATUS_COLOR[iv.status] ?? "var(--charcoal)";
          return (
            <div
              key={iv.id}
              style={{
                borderTop: "1px solid var(--sand)",
                padding: "0.875rem 0",
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                alignItems: "baseline",
              }}
            >
              <span style={{ ...mono, fontSize: "0.6875rem", color, border: `1px solid ${color}`, padding: "0.125rem 0.5rem" }}>
                {iv.status}
              </span>
              <Link href={`/instructor/interviews/${iv.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>
                {iv.user.name}
              </Link>
              {iv.user.section && (
                <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
                  Sec {iv.user.section.code}
                </span>
              )}
              <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
                attempt {iv.attemptNumber} · {iv._count.turns} turns
              </span>
              {total !== null && (
                <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
                  {total}/100{iv.confidence != null ? ` · conf ${iv.confidence.toFixed(2)}` : ""}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: "0.8125rem", color: "var(--clay)" }}>
                {fmt.format(iv.createdAt)}
              </span>
              {iv.escalationReason && (
                <p style={{ flexBasis: "100%", margin: 0, fontSize: "0.875rem", color: "#8a3b1c" }}>
                  {iv.escalationReason}
                </p>
              )}
            </div>
          );
        })}
      </Card>
    </main>
  );
}
