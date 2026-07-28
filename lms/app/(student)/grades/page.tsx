import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getGradeLine } from "@/lib/scoring/assemble";
import { Card, Eyebrow } from "@/components/ui";

// U15 — the line-by-line grade view (§8: "Grading only feels fair when a
// student can see exactly where each point came from"). Students see ONLY
// their own line: the userId comes from the session, the page takes no
// parameters. Grades and PCI never leave the LMS.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const fmt = (n: number, dp = 1) =>
  (Math.round(n * 10 ** dp) / 10 ** dp).toFixed(dp);

export default async function GradesPage() {
  let userId: string;
  try {
    const user = await requireUser();
    if (user.role !== "student") redirect("/instructor/matrix");
    userId = user.userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const line = await getGradeLine(userId);

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Grades</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Where every point comes from</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        The seven components of your final grade, line by line: the raw score, the peer
        contribution multiplier where one applies, the weight, and the weighted points.
        Your grades stay inside the LMS — Praxy only ever shows your artifacts and
        validations, never a number.
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.25rem" }}>
              Current total
            </p>
            <p style={{ color: "var(--charcoal)", margin: 0, fontSize: "0.875rem" }}>
              Pending components count as zero until their source exists — this number only
              goes up as the term progresses.
            </p>
          </div>
          <p style={{ fontFamily: "var(--font-fraunces)", fontSize: "2.75rem", fontWeight: 700, margin: 0, color: "var(--pine)" }}>
            {fmt(line.total)}<span style={{ fontSize: "1.25rem", color: "var(--clay)" }}> / 100</span>
          </p>
        </Card>

        <Card style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "44rem" }}>
            <thead>
              <tr>
                {["Component", "Raw score", "PCI", "Weight", "Weighted", "Status"].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      ...mono,
                      fontSize: "0.625rem",
                      color: "var(--clay)",
                      fontWeight: 400,
                      textAlign: i === 0 ? "left" : "right",
                      padding: "0.875rem 1rem",
                      borderBottom: "1px solid var(--sand)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {line.lines.map((l) => (
                <tr key={l.key}>
                  <td style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--sand)" }}>
                    <p style={{ margin: 0, fontWeight: 500 }}>{l.label}</p>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--clay)" }}>{l.detail}</p>
                  </td>
                  <td style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--sand)", textAlign: "right", fontFamily: "var(--font-geist-mono)" }}>
                    {l.raw === null ? "—" : fmt(l.raw)}
                  </td>
                  <td style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--sand)", textAlign: "right", fontFamily: "var(--font-geist-mono)" }}>
                    {l.pciApplied === null ? (
                      <span style={{ color: "var(--clay)" }}>—</span>
                    ) : line.pci.pending ? (
                      <span title="No peer checkpoint data yet — neutral 1.00 applied">
                        1.00<span style={{ color: "var(--clay)" }}>*</span>
                      </span>
                    ) : (
                      `×${fmt(l.pciApplied, 2)}`
                    )}
                  </td>
                  <td style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--sand)", textAlign: "right", fontFamily: "var(--font-geist-mono)", color: "var(--charcoal)" }}>
                    {Math.round(l.weight * 100)}%
                  </td>
                  <td style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--sand)", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontWeight: 700 }}>
                    {fmt(l.weighted, 2)}
                  </td>
                  <td style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--sand)", textAlign: "right" }}>
                    <span
                      style={{
                        ...mono,
                        fontSize: "0.5625rem",
                        color: l.pending ? "var(--clay)" : l.provisional ? "#8a6a1c" : "var(--pine)",
                        border: `1px solid ${l.pending ? "var(--sand)" : l.provisional ? "#8a6a1c" : "var(--pine)"}`,
                        padding: "0.125rem 0.375rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.pending ? "Pending" : l.provisional ? "Provisional" : "Current"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: "0.875rem 1rem", fontWeight: 700 }}>Total</td>
                <td colSpan={3} />
                <td style={{ padding: "0.875rem 1rem", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontWeight: 700, color: "var(--pine)" }}>
                  {fmt(line.total, 2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>

        <p style={{ color: "var(--clay)", fontSize: "0.8125rem", margin: 0, lineHeight: 1.6 }}>
          {line.pci.pending
            ? "* Peer contribution index pending: no peer checkpoint data yet, so a neutral ×1.00 is applied to the team-scored components. "
            : ""}
          Every line stays provisional until its source grade is finalised by an
          instructor. Pending components contribute nothing yet and appear as they are
          collected across the term.
        </p>
      </div>
    </main>
  );
}
