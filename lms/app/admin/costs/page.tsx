import Link from "next/link";
import { prisma } from "@/lib/db";
import { listDeadLetterJobs, QUEUE_GRADE_SUBMISSION_DEAD } from "@/lib/queue";
import { Card, Eyebrow, Td, Th } from "@/components/ui";
import { RetryGradeButton, RetryScreenshotButton, RunCrawlButton } from "./actions";

// The admin cost & operations dashboard:
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

// Tweaks over the shared Th/Td base (components/ui) — denser padding, mono
// header tracking, smaller sizes.
const th: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  fontSize: "0.6875rem",
  letterSpacing: "0.1em",
};

const td: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
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
                    <Th style={th}>Feature</Th>
                    <Th style={th}>Provider</Th>
                    <Th style={th}>Today</Th>
                    <Th style={th}>7 days</Th>
                    <Th style={th}>Total</Th>
                    <Th style={th}>Calls (total)</Th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const t = total.get(k)!;
                    return (
                      <tr key={k}>
                        <Td style={td}>{t.feature}</Td>
                        <Td style={td}>{t.provider}</Td>
                        <Td style={td}>{usd(today.get(k)?.cost ?? 0)}</Td>
                        <Td style={td}>{usd(week.get(k)?.cost ?? 0)}</Td>
                        <Td style={td}>{usd(t.cost)}</Td>
                        <Td style={td}>{t.count}</Td>
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
                    <Th style={th}>Submission</Th>
                    <Th style={th}>Dead-lettered</Th>
                    <Th style={th}>Retries used</Th>
                    <Th style={th}>Failure</Th>
                    <Th style={th}>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {deadJobs.map((j) => (
                    <tr key={j.id}>
                      <Td style={{ ...td, fontFamily: "var(--font-geist-mono)" }}>
                        {j.data.submissionId ?? "—"}
                      </Td>
                      <Td style={td}>{fmtAt.format(j.createdOn)}</Td>
                      <Td style={td}>{j.retryCount}</Td>
                      <Td style={{ ...td, maxWidth: "22rem", overflowWrap: "anywhere", fontSize: "0.75rem", color: "var(--charcoal)" }}>
                        {j.output ? JSON.stringify(j.output).slice(0, 200) : "—"}
                      </Td>
                      <Td style={td}>
                        {j.data.submissionId ? (
                          <RetryGradeButton submissionId={j.data.submissionId} />
                        ) : (
                          "—"
                        )}
                      </Td>
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
                    <Th style={th}>When</Th>
                    <Th style={th}>Feature</Th>
                    <Th style={th}>Provider</Th>
                    <Th style={th}>Model</Th>
                    <Th style={th}>Tokens in/out</Th>
                    <Th style={th}>Cost</Th>
                    <Th style={th}>Ref</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <Td style={td}>{fmtAt.format(r.createdAt)}</Td>
                      <Td style={td}>{r.feature}</Td>
                      <Td style={td}>{r.provider}</Td>
                      <Td style={td}>{r.model ?? "—"}</Td>
                      <Td style={td}>
                        {r.tokensIn ?? "—"} / {r.tokensOut ?? "—"}
                      </Td>
                      <Td style={td}>{usd(r.costUsd)}</Td>
                      <Td style={{ ...td, fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem" }}>
                        {r.refType ? `${r.refType}:${r.refId ?? ""}` : "—"}
                      </Td>
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
