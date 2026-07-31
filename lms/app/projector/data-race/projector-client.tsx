"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ProjectorState = {
  serverNow: string;
  sectionCode: string;
  phase: "waiting" | "question" | "feedback" | "leaderboard" | "complete";
  currentPosition: number; totalQuestions: number; responseCount: number; participantCount: number;
  question: null | { prompt: string; options: { id: string; label: string }[]; difficulty: string; endsAt: string | null };
  leaderboard: Array<{ rank: number; movement: number; name: string; correct: number; accuracy: number; avgSeconds: number; streak: number; totalPoints: number }>;
};

export function DataRaceProjector({ sectionCode, initialState = null, poll = true }: { sectionCode: string; initialState?: ProjectorState | null; poll?: boolean }) {
  const [state, setState] = useState<ProjectorState | null>(initialState);
  const [now, setNow] = useState(0);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const requestSequence = useRef(0);
  const appliedSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch(`/api/instructor/data-race/state?section=${encodeURIComponent(sectionCode)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setState(null);
        throw new Error(body.error ?? "Could not load Data Race.");
      }
      if (sequence < appliedSequence.current) return;
      appliedSequence.current = sequence;
      setState(body); setServerOffsetMs(new Date(body.serverNow).getTime() - Date.now()); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Connection lost. Retrying…"); }
  }, [sectionCode]);
  useEffect(() => { if (!poll) return; let cancelled = false; let timer: ReturnType<typeof setTimeout>; const runPoll = async () => { await refresh(); if (!cancelled) timer = setTimeout(runPoll, 1_500); }; timer = setTimeout(runPoll, 0); return () => { cancelled = true; clearTimeout(timer); }; }, [poll, refresh]);
  useEffect(() => { const first = setTimeout(() => setNow(Date.now()), 0); const timer = setInterval(() => setNow(Date.now()), 250); return () => { clearTimeout(first); clearInterval(timer); }; }, []);
  useEffect(() => { const update = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", update); return () => document.removeEventListener("fullscreenchange", update); }, []);
  const remaining = state?.question?.endsAt ? Math.max(0, Math.ceil((new Date(state.question.endsAt).getTime() - (now + serverOffsetMs)) / 1_000)) : 0;

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError("Fullscreen was blocked. Use your browser's full-screen control.");
    }
  }

  return (
    <main style={{ height: "100dvh", boxSizing: "border-box", background: "var(--pine)", color: "var(--cream)", padding: "clamp(1rem, 2vw, 2rem)", overflow: "hidden" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "1rem" }}>
        <div><p style={mono}>Data Race · Section {sectionCode}</p><h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 4.5rem)" }}>TrustMRR</h1></div>
        <button type="button" onClick={() => void toggleFullscreen()} style={fullButton}>{fullscreen ? "Exit full screen" : "Full screen"}</button>
      </header>
      {error && <p style={{ color: "#f0b48f" }}>{error}</p>}
      {!state && <h2 style={centerMessage}>Loading race…</h2>}
      {state?.phase === "waiting" && <h2 style={centerMessage}>Join the Data Race on your LMS.</h2>}
      {state?.phase === "question" && state.question && (
        <section style={{ marginTop: "clamp(2rem, 6vh, 6rem)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem" }}><p style={mono}>Question {state.currentPosition} of {state.totalQuestions} · {state.question.difficulty}</p><div style={{ fontFamily: "var(--font-fraunces)", fontSize: "clamp(3rem, 8vw, 7rem)", color: remaining <= 10 ? "#f0b48f" : "var(--cream)", lineHeight: 0.8 }}>{remaining}</div></div>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 4.5rem)", lineHeight: 1.05, maxWidth: "68rem", margin: "1rem 0 2.5rem" }}>{state.question.prompt}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>{state.question.options.map((option, index) => <div key={option.id} style={optionCard}><span style={{ ...mono, color: "#f0b48f" }}>{String.fromCharCode(65 + index)}</span><span>{option.label}</span></div>)}</div>
          <p style={{ ...mono, textAlign: "center", marginTop: "2rem" }}>{state.responseCount} of {state.participantCount} answered</p>
        </section>
      )}
      {state?.phase === "feedback" && <section style={{ textAlign: "center", marginTop: "20vh" }}><p style={{ ...mono, color: "#f0b48f" }}>Question {state.currentPosition} complete</p><h2 style={{ fontSize: "clamp(4rem, 12vw, 10rem)", margin: 0 }}>Time’s up.</h2><p style={{ fontSize: "1.5rem" }}>Check your screen.</p></section>}
      {state?.phase === "leaderboard" && <ProjectorLeaderboard state={state} />}
      {state?.phase === "complete" && <section style={{ textAlign: "center", marginTop: "20vh" }}><p style={{ ...mono, color: "#f0b48f" }}>Session 3</p><h2 style={{ fontSize: "clamp(4rem, 12vw, 10rem)", margin: 0 }}>Race complete.</h2></section>}
    </main>
  );
}

function ProjectorLeaderboard({ state }: { state: ProjectorState }) {
  const rows = state.leaderboard.slice(0, 10);
  return <section style={{ marginTop: "0.75rem", minHeight: 0 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}><div><p style={{ ...mono, color: "#f0b48f" }}>Question {state.currentPosition} of {state.totalQuestions}</p><h2 style={{ fontSize: "clamp(2.25rem, 4vw, 4rem)", lineHeight: 1, margin: 0 }}>Leaderboard</h2></div><p style={mono}>Accuracy + speed + streak</p></div><div style={{ overflowX: "auto", marginTop: "0.75rem" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "clamp(0.75rem, 1.25vw, 1rem)" }}><thead><tr>{["Rank", "Student", "Correct", "Accuracy", "Avg time", "Streak", "Score"].map((head) => <th key={head} style={th}>{head}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${row.rank}-${row.name}`}><td style={td}><strong>{row.rank}</strong> <span style={{ color: "#f0b48f" }}>{row.movement > 0 ? `↑${row.movement}` : row.movement < 0 ? `↓${Math.abs(row.movement)}` : "—"}</span></td><td style={td}><strong>{row.name}</strong></td><td style={td}>{row.correct}/{state.currentPosition}</td><td style={td}>{row.accuracy}%</td><td style={td}>{row.avgSeconds}s</td><td style={td}>{row.streak}</td><td style={td}><strong>{row.totalPoints.toLocaleString()}</strong></td></tr>)}</tbody></table></div></section>;
}

const mono: React.CSSProperties = { fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 };
const fullButton: React.CSSProperties = { ...mono, border: "1px solid var(--cream)", background: "transparent", color: "var(--cream)", padding: "0.85rem 1.25rem", cursor: "pointer" };
const centerMessage: React.CSSProperties = { textAlign: "center", marginTop: "30vh", fontSize: "clamp(2.5rem, 8vw, 7rem)" };
const optionCard: React.CSSProperties = { display: "grid", gridTemplateColumns: "2rem 1fr", gap: "1rem", alignItems: "center", border: "1px solid rgba(251,248,243,.65)", padding: "clamp(1rem, 2vw, 1.75rem)", fontSize: "clamp(1.1rem, 2vw, 1.75rem)" };
const th: React.CSSProperties = { ...mono, textAlign: "left", color: "#d9cdc1", borderBottom: "1px solid rgba(251,248,243,.5)", padding: "0.45rem 0.65rem" };
const td: React.CSSProperties = { borderBottom: "1px solid rgba(251,248,243,.22)", padding: "0.48rem 0.65rem" };
