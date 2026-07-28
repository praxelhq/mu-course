import { getPeerOverview } from "@/lib/scoring/overview";
import { Eyebrow } from "@/components/ui";

// Instructor peer-review overview: per-team checkpoint completion, the
// PCI table, and the §5 near-identical safeguard flag (Ochre badge). The flag
// is surfaced only — a genuinely equal team and a pact look identical from
// here, so the call stays with the instructor, never the system.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const cell: React.CSSProperties = {
  padding: "0.625rem 0.875rem",
  borderBottom: "1px solid var(--sand)",
  verticalAlign: "top",
};

const fmt2 = (n: number | null) => (n === null ? "—" : (Math.round(n * 100) / 100).toFixed(2));

export default async function InstructorPeerPage() {
  const teams = await getPeerOverview();
  const flagged = teams.filter((t) => t.nearIdentical.cp1 || t.nearIdentical.cp2);

  return (
    <main style={{ maxWidth: "80rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Peer review</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Checkpoints & PCI</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6, maxWidth: "48rem" }}>
        Per-team completion for both checkpoints and each student&apos;s Peer Contribution
        Index (40/60 toward checkpoint 2, clipped 0.70–1.20). Teams where every reviewer
        allocated near-identically are flagged for your judgment — the pattern can mean a
        genuinely equal team or a pact, and the system never resolves it either way.
      </p>

      {flagged.length > 0 ? (
        <p style={{ margin: "0 0 1.5rem" }}>
          <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--ochre)", border: "1px solid var(--ochre)", padding: "0.25rem 0.625rem" }}>
            {flagged.length} team{flagged.length === 1 ? "" : "s"} flagged near-identical
          </span>
        </p>
      ) : null}

      <div style={{ overflowX: "auto", border: "1px solid var(--sand)", background: "var(--parchment)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "56rem" }}>
          <thead>
            <tr>
              {["Team", "Section", "CP1 submitted", "CP2 submitted", "Flags", "Members · PCI (cp1 / cp2 / combined)"].map((h) => (
                <th key={h} style={{ ...mono, ...cell, fontSize: "0.625rem", color: "var(--clay)", fontWeight: 400, textAlign: "left" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.teamId}>
                <td style={{ ...cell, fontWeight: 500, whiteSpace: "nowrap" }}>{t.teamName}</td>
                <td style={{ ...cell, fontFamily: "var(--font-geist-mono)" }}>{t.sectionCode}</td>
                {([1, 2] as const).map((cp) => {
                  const submitted = cp === 1 ? t.submitted.cp1 : t.submitted.cp2;
                  return (
                    <td key={cp} style={{ ...cell, fontFamily: "var(--font-geist-mono)", whiteSpace: "nowrap" }}>
                      <span style={{ color: submitted === t.teamSize ? "var(--pine)" : submitted === 0 ? "var(--clay)" : "var(--charcoal)" }}>
                        {submitted}/{t.teamSize}
                      </span>
                    </td>
                  );
                })}
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  {t.nearIdentical.cp1 || t.nearIdentical.cp2 ? (
                    <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--ochre)", border: "1px solid var(--ochre)", padding: "0.125rem 0.375rem" }}>
                      Near-identical{" "}
                      {[t.nearIdentical.cp1 ? "CP1" : null, t.nearIdentical.cp2 ? "CP2" : null]
                        .filter(Boolean)
                        .join(" + ")}
                    </span>
                  ) : (
                    <span style={{ color: "var(--clay)" }}>—</span>
                  )}
                </td>
                <td style={{ ...cell }}>
                  {t.submitted.cp1 === 0 && t.submitted.cp2 === 0 ? (
                    <span style={{ color: "var(--clay)", fontSize: "0.8125rem" }}>No checkpoint data yet</span>
                  ) : (
                    <div style={{ display: "grid", gap: "0.25rem" }}>
                      {t.members.map((m) => (
                        <div key={m.userId} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.8125rem" }}>
                          <span>{m.name}</span>
                          <span style={{ fontFamily: "var(--font-geist-mono)", whiteSpace: "nowrap", color: m.pending ? "var(--clay)" : "var(--ink)" }}>
                            {fmt2(m.cp1)} / {fmt2(m.cp2)} → {m.pending ? "1.00 (pending)" : fmt2(m.pci)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
