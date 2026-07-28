import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getArtifactChecklist,
  parseExternalLinks,
  parseLastCrawl,
  parseValidations,
} from "@/lib/portfolio";
import { Card, Eyebrow } from "@/components/ui";
import { PortfolioForm } from "./portfolio-form";

// U16 — the student portfolio page feeding the 25% component (§7):
//  - linked-artifacts checklist (automatic: graded submissions by type),
//  - narrative + external links (editable, saved via POST /api/portfolio),
//  - validations viewer (read-only; instructors add them),
//  - last link-liveness crawl result (read-only; the crawl worker writes it).
// Always the caller's OWN entry — no parameters.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const fmtAt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function PortfolioPage() {
  let userId: string;
  try {
    const user = await requireUser();
    if (user.role !== "student") redirect("/instructor");
    userId = user.userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const [entry, checklist] = await Promise.all([
    prisma.portfolioEntry.findUnique({ where: { userId } }),
    getArtifactChecklist(userId),
  ]);
  const links = parseExternalLinks(entry?.links);
  const validations = parseValidations(entry?.validations);
  const lastCrawl = parseLastCrawl(entry?.lastCrawl);
  const presentCount = checklist.filter((c) => c.present).length;

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Portfolio</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Your portfolio</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        A quarter of your grade. Artifacts appear automatically as they are graded; the
        narrative and external links are yours to write. Validations are recorded by
        instructors, and every link you claim is checked for liveness.
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.25rem" }}>Linked artifacts</h2>
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0 0 1rem" }}>
            {presentCount} of {checklist.length} artifact types graded
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {checklist.map((c) => (
              <li
                key={c.slug}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  borderBottom: "1px solid var(--sand)",
                  padding: "0.5rem 0",
                }}
              >
                <span style={{ color: c.present ? "var(--ink)" : "var(--charcoal)" }}>
                  {c.title}
                  {c.teamBased && (
                    <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)", marginLeft: "0.5rem" }}>
                      team
                    </span>
                  )}
                </span>
                <span
                  style={{
                    ...mono,
                    fontSize: "0.625rem",
                    color: c.present ? "var(--pine)" : "var(--clay)",
                  }}
                >
                  {c.present ? "Graded" : "Not yet"}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <PortfolioForm
          initialNarrative={entry?.narrative ?? ""}
          initialLinks={links}
        />

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Validations</h2>
          {validations.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0, fontSize: "0.9375rem" }}>
              No validations recorded yet. External sign-offs and peer validations are
              entered by your instructors as they come in.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {validations.map((v, i) => (
                <li key={i} style={{ borderBottom: "1px solid var(--sand)", padding: "0.625rem 0" }}>
                  <p style={{ ...mono, fontSize: "0.625rem", color: v.kind === "external" ? "var(--pine)" : "var(--charcoal)", margin: "0 0 0.25rem" }}>
                    {v.kind} · {v.by}
                    {v.at && ` · ${fmtAt.format(new Date(v.at))}`}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--ink)" }}>{v.note}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.25rem" }}>Link liveness</h2>
          {lastCrawl === null ? (
            <p style={{ color: "var(--charcoal)", margin: "0.75rem 0 0", fontSize: "0.9375rem" }}>
              No crawl yet — your links have not been checked. Evidence integrity scores
              once the automated crawl has run.
            </p>
          ) : (
            <>
              <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0 0 1rem" }}>
                Last checked {fmtAt.format(new Date(lastCrawl.checkedAt))} ·{" "}
                {lastCrawl.links.filter((l) => l.ok).length} of {lastCrawl.links.length} alive
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {lastCrawl.links.map((l) => (
                  <li
                    key={l.url}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      borderBottom: "1px solid var(--sand)",
                      padding: "0.5rem 0",
                      fontSize: "0.875rem",
                    }}
                  >
                    <span style={{ overflowWrap: "anywhere", color: "var(--charcoal)" }}>{l.url}</span>
                    <span style={{ ...mono, fontSize: "0.625rem", color: l.ok ? "var(--pine)" : "var(--ochre)", whiteSpace: "nowrap" }}>
                      {l.ok ? "OK" : "Dead"}
                      {l.status !== undefined && ` · ${l.status}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
