import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";
import { IntervalRefresh } from "@/components/interval-refresh";
import {
  HEARTBEAT_STALE_MS,
  TRANSPORT_REALTIME,
  maxRealtimeRooms,
} from "@/lib/interview/realtime";

// U13 — admin live-rooms + spend meter: realtime rooms in flight (fresh
// heartbeat), turn-based interviews live, per-provider interview spend today
// and total (CostLog feature 'interview' — U16's spend source), and the
// recent interviews table. Auto-refreshes every 10s via IntervalRefresh.
// Admin-only via the admin layout's requireRole.

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const usd = (n: number) => `$${n.toFixed(4)}`;

export default async function AdminInterviewsPage() {
  const now = new Date();
  const heartbeatCutoff = new Date(now.getTime() - HEARTBEAT_STALE_MS);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [liveRealtime, liveTurnbased, spendToday, spendTotal, recent] = await Promise.all([
    prisma.interview.count({
      where: {
        status: "live",
        transport: TRANSPORT_REALTIME,
        lastSeenAt: { gte: heartbeatCutoff },
      },
    }),
    prisma.interview.count({
      where: { status: "live", transport: { not: TRANSPORT_REALTIME } },
    }),
    prisma.costLog.groupBy({
      by: ["provider"],
      where: { feature: "interview", createdAt: { gte: startOfDay } },
      _sum: { costUsd: true },
    }),
    prisma.costLog.groupBy({
      by: ["provider"],
      where: { feature: "interview" },
      _sum: { costUsd: true },
    }),
    prisma.interview.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        transport: true,
        attemptNumber: true,
        costUsd: true,
        createdAt: true,
        lastSeenAt: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  const maxRooms = maxRealtimeRooms();
  const todayByProvider = new Map(spendToday.map((r) => [r.provider, r._sum.costUsd ?? 0]));
  const providers = spendTotal
    .map((r) => ({
      provider: r.provider,
      today: todayByProvider.get(r.provider) ?? 0,
      total: r._sum.costUsd ?? 0,
    }))
    .sort((a, b) => b.total - a.total);
  const todayTotal = providers.reduce((s, p) => s + p.today, 0);
  const grandTotal = providers.reduce((s, p) => s + p.total, 0);

  const meters = [
    { label: "Realtime rooms live", value: `${liveRealtime} / ${maxRooms}` },
    { label: "Turn-based live", value: String(liveTurnbased) },
    { label: "Spend today", value: usd(todayTotal) },
    { label: "Spend total", value: usd(grandTotal) },
  ];

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <IntervalRefresh intervalMs={10_000} />
      <Eyebrow muted>Admin</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Interviews</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Live rooms, provider spend, and recent sessions. Refreshes every ten seconds. Students
        arriving while all {maxRooms} realtime rooms are busy wait in the queue and connect
        automatically; a room with no heartbeat for 90 seconds stops counting.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        {meters.map((m) => (
          <Card key={m.label}>
            <p style={{ margin: 0, fontFamily: "var(--font-geist-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
              {m.label}
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.75rem", fontFamily: "var(--font-fraunces)" }}>
              {m.value}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <p style={{ margin: "0 0 1rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
          Interview spend by provider (CostLog, feature &lsquo;interview&rsquo;)
        </p>
        {providers.length === 0 ? (
          <p style={{ margin: 0, color: "var(--charcoal)" }}>No interview spend recorded yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
              <thead>
                <tr>
                  {["Provider", "Today", "Total"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)", fontFamily: "var(--font-geist-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.provider}>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{p.provider}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{usd(p.today)}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{usd(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: "1.5rem" }} />

      <Card>
        <p style={{ margin: "0 0 1rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
          Recent interviews
        </p>
        {recent.length === 0 ? (
          <p style={{ margin: 0, color: "var(--charcoal)" }}>No interviews yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
              <thead>
                <tr>
                  {["Student", "Status", "Transport", "Attempt", "Cost", "Started", "Last seen"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)", fontFamily: "var(--font-geist-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((iv) => (
                  <tr key={iv.id}>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{iv.user.email}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{iv.status}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{iv.transport ?? "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{iv.attemptNumber}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{usd(iv.costUsd)}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>{fmt.format(iv.createdAt)}</td>
                    <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}>
                      {iv.lastSeenAt ? fmt.format(iv.lastSeenAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
