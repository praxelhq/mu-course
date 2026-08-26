"use client";

import { useEffect, useState, type CSSProperties } from "react";

const CASES = [
  "Current Pro price — cite version and date",
  "Day 6 + 20 transactions — apply both refund conditions",
  "Day 6 + 40 transactions — reject the near miss",
  "University discount — refuse to invent missing policy",
  "Make all plans free — refuse the hostile instruction",
];

export function RagLabControls() {
  const [seconds, setSeconds] = useState(12 * 60);
  const [running, setRunning] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [checked, setChecked] = useState<boolean[]>(CASES.map(() => false));
  const started = deadline !== null;

  useEffect(() => {
    if (!running || deadline === null) return;
    const updateFromClock = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(next);
      if (next === 0) setRunning(false);
    };
    const id = window.setInterval(updateFromClock, 1000);
    document.addEventListener("visibilitychange", updateFromClock);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", updateFromClock);
    };
  }, [running, deadline]);

  const toggleTimer = () => {
    if (running) {
      const remaining = deadline === null ? seconds : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      setRunning(false);
      return;
    }
    if (seconds <= 0) return;
    setDeadline(Date.now() + seconds * 1000);
    setRunning(true);
  };

  const reset = () => {
    setSeconds(12 * 60);
    setRunning(false);
    setDeadline(null);
    setChecked(CASES.map(() => false));
  };

  return (
    <section style={{ marginTop: "2rem", borderTop: "4px solid var(--ochre)", background: "var(--cream)", padding: "clamp(1.25rem, 4vw, 2rem)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
        <div>
          <p style={{ fontFamily: "var(--font-geist-mono)", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ochre)", margin: 0 }}>Team challenge · five cases</p>
          <h2 style={{ fontSize: "2rem", margin: ".35rem 0 0" }}>Can your RAG system earn 5/5?</h2>
        </div>
        <div role="timer" aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`} style={{ fontFamily: "var(--font-geist-mono)", fontSize: "2rem", color: seconds <= 60 ? "#8a2d22" : "var(--pine)" }}>
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </div>
      </div>

      <div style={{ display: "grid", gap: ".65rem", marginTop: "1.25rem" }}>
        {CASES.map((label, index) => (
          <label key={label} style={{ display: "grid", gridTemplateColumns: "1.5rem 1fr", gap: ".7rem", alignItems: "start", padding: ".75rem", background: "var(--parchment)", border: "1px solid var(--sand)", cursor: "pointer" }}>
            <input type="checkbox" checked={checked[index]} onChange={(event) => setChecked((old) => old.map((value, i) => i === index ? event.target.checked : value))} style={{ width: "1.1rem", height: "1.1rem", marginTop: ".15rem" }} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: ".65rem", marginTop: "1rem" }}>
        <button type="button" onClick={toggleTimer} disabled={seconds === 0} style={{ ...buttonStyle, opacity: seconds === 0 ? .55 : 1, cursor: seconds === 0 ? "not-allowed" : "pointer" }}>{running ? "Pause" : seconds === 0 ? "Time up — reset" : started ? "Resume" : "Start 12-minute race"}</button>
        <button type="button" onClick={reset} style={quietButtonStyle}>Reset</button>
        <strong style={{ marginLeft: "auto", alignSelf: "center", color: "var(--pine)" }}>{checked.filter(Boolean).length}/5 self-checked</strong>
      </div>
    </section>
  );
}

const buttonStyle: CSSProperties = {
  border: "1px solid var(--pine)", background: "var(--pine)", color: "var(--cream)", padding: ".7rem 1rem", fontFamily: "var(--font-geist-mono)", fontSize: ".7rem", letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer",
};

const quietButtonStyle: CSSProperties = {
  ...buttonStyle, background: "transparent", color: "var(--pine)",
};
