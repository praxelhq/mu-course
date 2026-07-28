import Link from "next/link";
import { prisma } from "@/lib/db";
import { listDeadLetterJobs, QUEUE_GRADE_SUBMISSION_DEAD } from "@/lib/queue";
import { Card, Eyebrow } from "@/components/ui";
import { RetryGradeButton, RetryScreenshotButton, RunCrawlButton } from "./actions";

// U16 — the admin cost & operations dashboard:
//   - CostLog aggregation by feature × provider (today / 7 days / total),
//   - the 50 most recent cost rows,
//   - grading dead letters (pg-boss 'grade.submission.dead', still queued)
//     with per-job Retry → POST /api/admin/regrade,
//   - screenshot-blocked gallery items with re-enqueue,
//   - the portfolio crawl trigger.
// Admin-only via the admin layout.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const th: React.CSSProperties = {
  ...mono,
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--sand)",
  fontSize: "0.6875rem",
  color: "var(--clay)",
  fontWeight: 400,
};

const td: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid var(--sand)",
  fontSize: "0.875rem",
};

const fmtAt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const usd = (n: number) => `$${n.toFixed(4)}`;

type Agg = { feature: string; provider: string; count: number; cost: number };

function aggMap(
  rows: {
    feature: string;
    provider: string;
    _count: { _all: number };
    _sum: { costUsd: number | null };
  }[],
): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const r of rows) {
    m.set(`${r.feature}|${r.provider}`, {
      feature: r.feature,
      provider: r.provider,
      count: r._count._all,
      cost: r._sum.costUsd ?? 0,
    });
  }
  return m;
}

export default async function AdminCostsPage() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

  const [allAgg, weekAgg, todayAgg, recent, deadJobs, blocked] = await Promise.all([
    prisma.costLog.groupBy({
      by: ["feature", "provider"],
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
    prisma.costLog.groupBy({
      by: ["feature", "provider"],
      _count: { _all: true },
      _sum: { costUsd: true },
      where: { createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.costLog.groupBy({
      by: ["feature", "provider"],
      _count: { _all: true },
      _sum: { costUsd: true },
      where: { createdAt: { gte: startOfDay } },
    }),
    prisma.costLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    listDeadLetterJobs<{ submissionId?: string }>(QUEUE_GRADE_SUBMISSION_DEAD),
    prisma.galleryItem.findMany({
      where: { screenshotS3Key: "blocked" },
      select: {
        submissionId: true,
        submission: { select: { user: { select: { email: true } } } },
      },
    }),
  ]);

  const total = aggMap(allAgg);
  const week = aggMap(weekAgg);
  const today = aggMap(todayAgg);
  const keys = [...total.keys()].sort();
  const grandTotal = [...total.values()].reduce((s, a) => s + a.cost, 0);

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Admin</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Costs &amp; operations</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6, maxWidth: "48rem" }}>
        AI spend by feature and provider, grading dead letters, blocked screenshots, and
        the portfolio link crawl. The live interview meter has its own page:{" "}
        <Link href="/admin/interviews" style={{ color: "var(--pine)" }}>
          Interviews
        </Link>
        .
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Card>
          <p style={{ ...mono, fontSize: "0.75rem", color: "var(--clay)", margin: "0 0 1rem" }}>
            AI spend by feature × provider (grand total {usd(grandTotal)})
          </p>
          {keys.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>No cost rows yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Feature</th>
                    <th style={th}>Provider</th>
                    <th style={th}>Today</th>
                    <th style={th}>7 days</th>
                    <th style={th}>Total</th>
                    <th style={th}>Calls (total)</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const t = total.get(k)!;
                    return (
                      <tr key={k}>
                        <td style={td}>{t.feature}</td>
                        <td style={td}>{t.provider}</td>
                        <td style={td}>{usd(today.get(k)?.cost ?? 0)}</td>
                        <td style={td}>{usd(week.get(k)?.cost ?? 0)}</td>
                        <td style={td}>{usd(t.cost)}</td>
                        <td style={td}>{t.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
            <p style={{ ...mono, fontSize: "0.75rem", color: "var(--clay)", margin: "0 0 1rem" }}>
              Grading dead letters ({QUEUE_GRADE_SUBMISSION_DEAD})
            </p>
          </div>
          {deadJobs.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>
              No dead-lettered grading jobs. (If the queue schema has never been
              initialised this list is also empty.)
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Submission</th>
                    <th style={th}>Dead-lettered</th>
                    <th style={th}>Retries used</th>
                    <th style={th}>Failure</th>
                    <th style={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deadJobs.map((j) => (
                    <tr key={j.id}>
                      <td style={{ ...td, fontFamily: "var(--font-geist-mono)" }}>
                        {j.data.submissionId ?? "—"}
                      </td>
                      <td style={td}>{fmtAt.format(j.createdOn)}</td>
                      <td style={td}>{j.retryCount}</td>
                      <td style={{ ...td, maxWidth: "22rem", overflowWrap: "anywhere", fontSize: "0.75rem", color: "var(--charcoal)" }}>
                        {j.output ? JSON.stringify(j.output).slice(0, 200) : "—"}
                      </td>
                      <td style={td}>
                        {j.data.submissionId ? (
                          <RetryGradeButton submissionId={j.data.submissionId} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <p style={{ ...mono, fontSize: "0.75rem", color: "var(--clay)", margin: "0 0 1rem" }}>
            Screenshot capture blocked (SSRF policy)
          </p>
          {blocked.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>
              No gallery items with blocked screenshots.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {blocked.map((b) => (
                <li
                  key={b.submissionId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    borderBottom: "1px solid var(--sand)",
                    padding: "0.5rem 0",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.8125rem" }}>
                    {b.submissionId}
                    <span style={{ color: "var(--charcoal)" }}> · {b.submission.user.email}</span>
                  </span>
                  <RetryScreenshotButton submissionId={b.submissionId} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p style={{ ...mono, fontSize: "0.75rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
            Portfolio link crawl
          </p>
          <p style={{ color: "var(--charcoal)", margin: "0 0 1rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
            Checks every claimed link (portfolio + submission link fields) for liveness and
            writes the evidence-integrity data the grade line reads. Runs in the worker; no
            AI cost.
          </p>
          <RunCrawlButton />
        </Card>

        <Card>
          <p style={{ ...mono, fontSize: "0.75rem", color: "var(--clay)", margin: "0 0 1rem" }}>
            Recent cost rows (latest 50)
          </p>
          {recent.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>No cost rows yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>When</th>
                    <th style={th}>Feature</th>
                    <th style={th}>Provider</th>
                    <th style={th}>Model</th>
                    <th style={th}>Tokens in/out</th>
                    <th style={th}>Cost</th>
                    <th style={th}>Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{fmtAt.format(r.createdAt)}</td>
                      <td style={td}>{r.feature}</td>
                      <td style={td}>{r.provider}</td>
                      <td style={td}>{r.model ?? "—"}</td>
                      <td style={td}>
                        {r.tokensIn ?? "—"} / {r.tokensOut ?? "—"}
                      </td>
                      <td style={td}>{usd(r.costUsd)}</td>
                      <td style={{ ...td, fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem" }}>
                        {r.refType ? `${r.refType}:${r.refId ?? ""}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
