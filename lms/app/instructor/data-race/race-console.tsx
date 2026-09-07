"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Eyebrow, Td, Th } from "@/components/ui";

type InstructorState = {
  title: string;
  sectionCode: string;
  phase: "waiting" | "question" | "feedback" | "leaderboard" | "complete";
  currentPosition: number;
  totalQuestions: number;
  responseCount: number;
  participantCount: number;
  question: null | { prompt: string; difficulty: string; endsAt: string | null };
  leaderboard: Array<{
    rank: number; movement: number; name: string; correct: number; accuracy: number;
    avgSeconds: number; streak: number; totalPoints: number;
  }>;
};

export function DataRaceConsole({ sectionCodes }: { sectionCodes: string[] }) {
  const [section, setSection] = useState(sectionCodes[0] ?? "A");
  const [state, setState] = useState<InstructorState | null>(null);
  const [raceBusy, setRaceBusy] = useState(false);
  const [rosterBusy, setRosterBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [assignSection, setAssignSection] = useState(sectionCodes[0] ?? "A");
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);
  const sectionRef = useRef(section);
  const requestSequence = useRef(0);
  const appliedSequence = useRef(0);

  const refresh = useCallback(async (targetSection: string) => {
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch(`/api/instructor/data-race/state?section=${encodeURIComponent(targetSection)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load Data Race.");
      if (targetSection !== sectionRef.current || sequence < appliedSequence.current) return;
      appliedSequence.current = sequence;
      setState(body); setError(null);
    } catch (reason) {
      if (targetSection === sectionRef.current) setError(reason instanceof Error ? reason.message : "Could not load Data Race.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(section);
      if (!cancelled) timer = setTimeout(poll, 2_000);
    };
    timer = setTimeout(poll, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh, section]);

  async function control(action: "start" | "show_leaderboard" | "next" | "reset" | "end") {
    setRaceBusy(true); setError(null);
    appliedSequence.current = ++requestSequence.current;
    try {
      const response = await fetch("/api/instructor/data-race/control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionCode: section, action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Action failed.");
      if (section === sectionRef.current) setState(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed. Try again.");
    } finally {
      setRaceBusy(false);
    }
  }

  async function assignStudent(event: React.FormEvent) {
    event.preventDefault(); setRosterBusy(true); setRosterMessage(null);
    try {
      const response = await fetch("/api/instructor/roster", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sectionCode: assignSection }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not update student.");
      setRosterMessage(`${body.name} is assigned to Section ${body.sectionCode}. (${body.status})${body.metadataSyncPending ? " Login metadata sync is pending; retry if their next login fails." : ""}`);
      setEmail("");
    } catch (reason) {
      setRosterMessage(reason instanceof Error ? reason.message : "Could not update student.");
    } finally {
      setRosterBusy(false);
    }
  }

  return (
    <>
      <Eyebrow muted>Session 3 · Live class</Eyebrow>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "end" }}>
        <div><h1 style={{ fontSize: "3rem", margin: 0 }}>Data Race</h1><p>Timed, section-specific questions with automatic feedback.</p></div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="race-section" style={label}>Section</label>
          <select id="race-section" value={section} onChange={(event) => { sectionRef.current = event.target.value; setSection(event.target.value); setState(null); }} style={inputStyle}>
            {sectionCodes.map((code) => <option key={code}>{code}</option>)}
          </select>
          <a href={`/projector/data-race?section=${section}`} target="_blank" rel="noopener noreferrer" style={linkButton}>Open projector</a>
        </div>
      </div>

      {error && <p style={{ color: "var(--ochre)" }}>{error}</p>}
      <Card style={{ marginTop: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <Eyebrow muted>{state?.phase ?? "loading"} · Question {state?.currentPosition ?? 0}/{state?.totalQuestions ?? 0}</Eyebrow>
            <h2 style={{ margin: 0 }}>{state?.question?.prompt ?? "Students are waiting."}</h2>
            {state?.question && <p>{state.responseCount} of {state.participantCount} answered · {state.question.difficulty}</p>}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "start" }}>
            {state?.phase === "waiting" && <Button disabled={raceBusy} onClick={() => void control("start")}>Start question 1</Button>}
            {state?.phase === "feedback" && <Button disabled={raceBusy} onClick={() => void control("show_leaderboard")}>Show leaderboard</Button>}
            {state?.phase === "leaderboard" && <Button disabled={raceBusy} onClick={() => void control("next")}>{state.currentPosition === state.totalQuestions ? "Finish race" : "Next question"}</Button>}
            {state?.phase !== "waiting" && <button type="button" disabled={raceBusy} onClick={() => void control("end")} style={secondaryButton}>End</button>}
            <button type="button" disabled={raceBusy} onClick={() => window.confirm("Reset this section's race and delete its answers?") && void control("reset")} style={secondaryButton}>Reset</button>
          </div>
        </div>
      </Card>

      {state?.phase === "leaderboard" && <Leaderboard rows={state.leaderboard} />}

      <Card style={{ marginTop: "1.5rem" }}>
        <Eyebrow muted>Add or move a student</Eyebrow>
        <form onSubmit={assignStudent} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))", gap: "0.75rem", alignItems: "end" }}>
          <label style={label}>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={{ ...inputStyle, display: "block", width: "100%", marginTop: "0.35rem" }} /></label>
          <label style={label}>Section<select value={assignSection} onChange={(event) => setAssignSection(event.target.value)} style={{ ...inputStyle, display: "block", width: "100%", marginTop: "0.35rem" }}>{sectionCodes.map((code) => <option key={code}>{code}</option>)}</select></label>
          <Button type="submit" disabled={rosterBusy}>Assign</Button>
        </form>
        {rosterMessage && <p style={{ marginBottom: 0 }}>{rosterMessage}</p>}
      </Card>
    </>
  );
}

function Leaderboard({ rows }: { rows: InstructorState["leaderboard"] }) {
  return <Card style={{ marginTop: "1.5rem", overflowX: "auto" }}><h2>Current leaderboard</h2><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><Th>Rank</Th><Th>Student</Th><Th>Correct</Th><Th>Accuracy</Th><Th>Avg time</Th><Th>Streak</Th><Th>Score</Th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.rank}-${row.name}`}><Td>{row.rank} {row.movement > 0 ? `↑${row.movement}` : row.movement < 0 ? `↓${Math.abs(row.movement)}` : "—"}</Td><Td>{row.name}</Td><Td>{row.correct}</Td><Td>{row.accuracy}%</Td><Td>{row.avgSeconds}s</Td><Td>{row.streak}</Td><Td><strong>{row.totalPoints}</strong></Td></tr>)}</tbody></table></Card>;
}

const label: React.CSSProperties = { fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em" };
const inputStyle: React.CSSProperties = { border: "1px solid var(--sand)", background: "var(--parchment)", minHeight: "2.75rem", padding: "0.5rem", color: "var(--ink)" };
const linkButton: React.CSSProperties = { background: "var(--pine)", color: "var(--cream)", textDecoration: "none", padding: "0.72rem 1rem" };
const secondaryButton: React.CSSProperties = { border: "1px solid var(--pine)", background: "transparent", color: "var(--pine)", padding: "0.625rem 1rem", cursor: "pointer" };
