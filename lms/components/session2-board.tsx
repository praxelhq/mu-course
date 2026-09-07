"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Session2Console } from "@/lib/session2-console";
import { ImageGalleryPresenter } from "@/components/image-gallery-presenter";

// The live Session-2 board. Refreshes every 15s during class so the instructor
// can pace delivery off real submission counts, and exposes the per-section
// reveal toggle for each voting gallery.

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const cell: React.CSSProperties = {
  borderBottom: "1px solid var(--sand)",
  padding: "0.5rem 0.6rem",
  fontSize: "0.8rem",
  textAlign: "left",
  whiteSpace: "nowrap",
};

export function Session2Board({
  data,
  sections,
}: {
  data: Session2Console;
  sections: { id: string; code: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // Live refresh during class.
  useEffect(() => {
    const t = setInterval(() => startTransition(() => router.refresh()), 15_000);
    return () => clearInterval(t);
  }, [router]);

  async function toggleReveal(assignmentId: string, revealed: boolean) {
    setBusy(assignmentId);
    try {
      await fetch("/api/votes/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId, sectionId: data.sectionId, revealed }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ maxWidth: "80rem", margin: "0 auto", padding: "2.5rem 2rem" }}>
      <p style={{ ...mono, fontSize: "0.65rem", color: "var(--ochre)", margin: "0 0 0.4rem" }}>
        Instructor · Session 2 {pending && "· refreshing"}
      </p>
      <h1 style={{ fontSize: "1.9rem", margin: "0 0 1.25rem" }}>Live participation</h1>

      {/* Section switcher */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`/instructor/session2?section=${s.code}`}
            style={{
              ...mono,
              fontSize: "0.7rem",
              padding: "0.35rem 0.7rem",
              border: "1px solid var(--sand)",
              textDecoration: "none",
              background: s.code === data.sectionCode ? "var(--pine)" : "transparent",
              color: s.code === data.sectionCode ? "var(--parchment)" : "var(--charcoal)",
            }}
          >
            {s.code}
          </a>
        ))}
      </div>

      {/* Artifact summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
          gap: "0.75rem",
          marginBottom: "2rem",
        }}
      >
        {data.artifacts.map((a) => (
          <div key={a.assignmentId} style={{ border: "1px solid var(--sand)", padding: "0.9rem" }}>
            <p style={{ ...mono, fontSize: "0.6rem", color: "var(--clay)", margin: "0 0 0.3rem" }}>
              {a.slug}
            </p>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>{a.title}</p>
            <p style={{ margin: 0, fontSize: "1.5rem" }}>
              {a.submitted}
              <span style={{ fontSize: "0.85rem", color: "var(--clay)" }}> / {data.totalStudents}</span>
            </p>
            <p style={{ ...mono, fontSize: "0.6rem", color: "var(--clay)", margin: "0.25rem 0 0" }}>
              submitted
            </p>
            {a.aiGraded && (
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
                Graded {a.graded}
                {a.avgTotal !== null && ` · avg ${a.avgTotal.toFixed(1)}`}
              </p>
            )}
            {a.galleryEligible && (
              <>
                <button
                  type="button"
                  disabled={busy === a.assignmentId}
                  onClick={() => toggleReveal(a.assignmentId, !a.revealed)}
                  style={{
                    ...mono,
                    marginTop: "0.7rem",
                    width: "100%",
                    padding: "0.4rem",
                    fontSize: "0.65rem",
                    border: "1px solid var(--sand)",
                    borderRadius: 0,
                    cursor: "pointer",
                    background: a.revealed ? "var(--ochre)" : "transparent",
                    color: a.revealed ? "var(--parchment)" : "var(--pine)",
                  }}
                >
                  {busy === a.assignmentId
                    ? "…"
                    : a.revealed
                      ? `Results shown to ${data.sectionCode} — hide`
                      : `Reveal results to ${data.sectionCode}`}
                </button>
                <ImageGalleryPresenter
                  title={a.title}
                  sectionCode={data.sectionCode}
                  items={a.presentationItems}
                />
              </>
            )}
          </div>
        ))}
      </div>

      {/* Per-student table */}
      <div style={{ overflowX: "auto", border: "1px solid var(--sand)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "56rem" }}>
          <thead>
            <tr>
              <th style={{ ...cell, ...mono, fontSize: "0.6rem" }}>Student</th>
              {data.artifacts.map((a) => (
                <th key={a.assignmentId} style={{ ...cell, ...mono, fontSize: "0.6rem" }}>
                  {a.slug}
                  {a.galleryEligible ? " (cast/got)" : a.aiGraded ? " (mark)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.userId}>
                <td style={cell}>
                  {s.name}
                  <span style={{ color: "var(--clay)", fontSize: "0.7rem" }}> · {s.email}</span>
                </td>
                {data.artifacts.map((a) => {
                  const c = s.cells[a.assignmentId];
                  return (
                    <td key={a.assignmentId} style={cell}>
                      {c?.submitted ? (
                        <>
                          <span style={{ color: "var(--pine)" }}>✓</span>
                          {a.galleryEligible && (
                            <span style={{ color: "var(--clay)" }}>
                              {" "}
                              {s.votesCast[a.assignmentId]}/{s.votesReceived[a.assignmentId]}
                            </span>
                          )}
                          {a.aiGraded && c.total !== null && <span> {c.total.toFixed(1)}</span>}
                          {a.aiGraded && c.total === null && (
                            <span style={{ color: "var(--clay)" }}> ({c.status})</span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--sand)" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...mono, fontSize: "0.6rem", color: "var(--clay)", marginTop: "0.75rem" }}>
        cast/got = upvotes this student gave / received · auto-refreshes every 15s
      </p>
    </main>
  );
}
