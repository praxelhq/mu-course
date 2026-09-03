"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui";
import {
  formatInterviewResultText,
  type InterviewResultView,
} from "@/lib/interview/result";

// Grading runs on the queue, so a student who lands here straight from the
// closing screen arrives before the grade exists. Poll until it does rather
// than making them refresh — but stop once it is ready, and stop after a few
// minutes so a stuck queue does not poll forever.

const POLL_MS = 5_000;
const MAX_POLLS = 60;

export function InterviewResult({
  initial,
  studentName,
}: {
  initial: InterviewResultView;
  studentName: string;
}) {
  const [view, setView] = useState(initial);
  const [polls, setPolls] = useState(0);

  const waiting = view.state === "grading" || view.state === "live";

  useEffect(() => {
    if (!waiting || polls >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      let cancelled = false;
      fetch("/api/interview/result", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((next: InterviewResultView | null) => {
          if (!cancelled && next) setView(next);
          if (!cancelled) setPolls((n) => n + 1);
        })
        .catch(() => {
          if (!cancelled) setPolls((n) => n + 1);
        });
      return () => {
        cancelled = true;
      };
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, polls]);

  const download = useCallback(() => {
    if (view.state !== "ready") return;
    const blob = new Blob([formatInterviewResultText(view, studentName)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "praxel-interview-result.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [view, studentName]);

  if (view.state === "live") {
    return (
      <Card>
        <p style={{ margin: 0 }}>Your interview is still in progress.</p>
      </Card>
    );
  }

  if (view.state !== "ready") {
    return (
      <Card>
        <p style={{ margin: 0 }}>
          {polls >= MAX_POLLS
            ? "Your interview is recorded and is still being marked. Check back shortly — nothing is lost."
            : "Marking your interview. This usually takes under a minute."}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
          <span style={{ fontFamily: "var(--font-fraunces)", fontSize: "3rem", lineHeight: 1 }}>
            {view.total}
          </span>
          <span style={{ fontFamily: "var(--font-geist-mono)", color: "var(--ink-soft)" }}>
            / {view.max}
          </span>
        </div>
      </Card>

      {view.axes.map((axis) => (
        <Card key={axis.key} style={{ marginTop: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "1rem",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-fraunces)",
                fontSize: "1.125rem",
                margin: 0,
              }}
            >
              {axis.label}
            </h2>
            <span style={{ fontFamily: "var(--font-geist-mono)", whiteSpace: "nowrap" }}>
              {axis.score} / {axis.max}
            </span>
          </div>
          {axis.rationale ? (
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.6 }}>{axis.rationale}</p>
          ) : null}
        </Card>
      ))}

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={download}
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.75rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0.75rem 1.25rem",
            border: "1px solid var(--sand)",
            borderRadius: 0,
            background: "var(--pine)",
            color: "var(--parchment)",
            cursor: "pointer",
          }}
        >
          Download result
        </button>
      </div>

      <p style={{ marginTop: "1.5rem", color: "var(--ink-soft)", fontSize: "0.875rem" }}>
        Grades are finalised after instructor review.
      </p>
    </>
  );
}
