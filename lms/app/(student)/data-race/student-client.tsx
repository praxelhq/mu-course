"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RaceState = {
  serverNow: string;
  title: string;
  sectionCode: string;
  phase: "waiting" | "question" | "feedback" | "leaderboard" | "complete";
  currentPosition: number;
  totalQuestions: number;
  question: null | {
    id: string;
    position: number;
    prompt: string;
    options: { id: string; label: string }[];
    difficulty: string;
    endsAt: string | null;
  };
  submitted: boolean;
  selectedOptionId: string | null;
  result: null | { answered: boolean; correct: boolean };
};

export function DataRaceStudent() {
  const [state, setState] = useState<RaceState | null>(null);
  const [now, setNow] = useState(0);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const requestSequence = useRef(0);
  const appliedSequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch("/api/data-race/state", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not join Data Race.");
      if (sequence < appliedSequence.current) return;
      appliedSequence.current = sequence;
      setState(body);
      setServerOffsetMs(new Date(body.serverNow).getTime() - Date.now());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connection lost. Retrying…");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!cancelled) await refresh();
      if (!cancelled) timer = setTimeout(poll, 2_000 + Math.floor(Math.random() * 700));
    };
    timer = setTimeout(poll, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh]);

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  async function answer(optionId: string) {
    if (!state?.question || busy || state.submitted) return;
    setBusy(true);
    appliedSequence.current = ++requestSequence.current;
    setError(null);
    try {
      const response = await fetch("/api/data-race/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: state.question.id, selectedOptionId: optionId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Answer was not recorded.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Answer was not recorded.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <p>{error ?? "Joining Data Race…"}</p>;
  const remaining = state.question?.endsAt
    ? Math.max(0, Math.ceil((new Date(state.question.endsAt).getTime() - (now + serverOffsetMs)) / 1_000))
    : 0;
  const waiting = state.phase === "waiting" || state.phase === "leaderboard";

  return (
    <section aria-live="polite">
      <p style={eyebrow}>Data Race · Section {state.sectionCode}</p>
      <h1 style={{ fontSize: "clamp(2.25rem, 8vw, 4.5rem)", lineHeight: 0.95, margin: "0 0 1.25rem" }}>
        {state.title}
      </h1>
      {error && <p style={{ color: "var(--ochre)" }}>{error}</p>}

      {waiting && (
        <div style={panel}>
          <p style={eyebrow}>{state.phase === "waiting" ? "You are in" : "Leaderboard is on screen"}</p>
          <h2 style={{ margin: 0 }}>{state.phase === "waiting" ? "Waiting for the first question." : "Look up. Next question soon."}</h2>
        </div>
      )}

      {state.phase === "complete" && <div style={panel}><h2 style={{ margin: 0 }}>Race complete.</h2></div>}

      {state.question && state.phase === "question" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
            <span style={eyebrow}>Question {state.currentPosition} of {state.totalQuestions} · {state.question.difficulty}</span>
            <strong style={{ fontFamily: "var(--font-geist-mono)", color: remaining <= 10 ? "var(--ochre)" : "var(--pine)" }}>{remaining}s</strong>
          </div>
          <h2 style={{ fontSize: "clamp(1.5rem, 5vw, 2.5rem)", lineHeight: 1.15 }}>{state.question.prompt}</h2>
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
            {state.question.options.map((option, index) => {
              const selected = state.selectedOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy || state.submitted || remaining === 0}
                  onClick={() => void answer(option.id)}
                  style={{
                    minHeight: "4rem",
                    padding: "1rem 1.25rem",
                    textAlign: "left",
                    fontSize: "1.05rem",
                    border: `2px solid ${selected ? "var(--ochre)" : "var(--sand)"}`,
                    background: selected ? "#f4e8dc" : "var(--parchment)",
                    color: "var(--ink)",
                    cursor: state.submitted ? "default" : "pointer",
                  }}
                >
                  <span style={{ ...eyebrow, display: "inline", marginRight: "0.75rem" }}>{String.fromCharCode(65 + index)}</span>
                  {option.label}
                </button>
              );
            })}
          </div>
          {state.submitted && <p style={{ fontFamily: "var(--font-geist-mono)", color: "var(--pine)" }}>Answer locked. Wait for the timer.</p>}
        </>
      )}

      {state.question && state.phase === "feedback" && state.result && (
        <div style={{ ...panel, borderColor: state.result.correct ? "var(--pine)" : "var(--ochre)" }}>
          <p style={eyebrow}>Question {state.currentPosition} complete</p>
          <h2 style={{ fontSize: "clamp(2rem, 8vw, 4rem)", margin: 0 }}>
            {!state.result.answered ? "No answer recorded" : state.result.correct ? "Correct" : "Not quite"}
          </h2>
          <p style={{ marginBottom: 0 }}>Look up—the leaderboard is next.</p>
        </div>
      )}
    </section>
  );
}

const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.75rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--clay)",
  margin: 0,
};

const panel: React.CSSProperties = {
  border: "1px solid var(--sand)",
  padding: "clamp(1.25rem, 5vw, 2.5rem)",
  marginTop: "2rem",
  background: "var(--parchment)",
};
