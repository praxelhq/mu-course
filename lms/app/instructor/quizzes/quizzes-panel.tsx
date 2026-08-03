"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Td, Th } from "@/components/ui";

// Client half of the instructor quiz console: arm/disarm per section (a gate
// flip via the existing /api/gates/set), per-quiz results tables, and the
// quiz creation form.

export type PanelSection = { id: string; code: string };

export type SectionSignalRow = {
  sectionId: string;
  sectionCode: string;
  attemptCount: number;
  avgScorePct: number | null;
  perQuestionCorrectPct: number[];
};

export type PanelQuiz = {
  id: string;
  sessionNo: number;
  title: string;
  isDiagnostic: boolean;
  questionCount: number;
  attemptCount: number;
  avgScorePct: number | null;
  gates: Record<string, "locked" | "open" | "closed">;
  results: { questions: string[]; perSection: SectionSignalRow[] } | null;
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

// Tweaks over the shared Th/Td base (components/ui) — tighter cells, wider
// header tracking.
const th: React.CSSProperties = {
  fontSize: "0.625rem",
  letterSpacing: "0.1em",
  padding: "0.375rem 0.75rem 0.375rem 0",
};

const td: React.CSSProperties = {
  padding: "0.375rem 0.75rem 0.375rem 0",
  fontSize: "0.875rem",
  color: "var(--ink)",
};

function GateButton({
  state,
  onArm,
  onDisarm,
  busy,
}: {
  state: "locked" | "open" | "closed";
  onArm: () => void;
  onDisarm: () => void;
  busy: boolean;
}) {
  const live = state === "open";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={live ? onDisarm : onArm}
      title={live ? "Disarm (close the quiz)" : "Arm (open the quiz live)"}
      style={{
        ...mono,
        fontSize: "0.625rem",
        cursor: busy ? "default" : "pointer",
        color: live ? "var(--cream)" : "var(--charcoal)",
        background: live ? "var(--pine)" : "var(--parchment)",
        border: `1px solid ${live ? "var(--pine)" : "var(--sand)"}`,
        padding: "0.25rem 0.5rem",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {live ? "Live" : state === "closed" ? "Closed" : "Locked"}
    </button>
  );
}

function QuizCard({ quiz, sections }: { quiz: PanelQuiz; sections: PanelSection[] }) {
  const router = useRouter();
  const [gates, setGates] = useState(quiz.gates);
  const [busy, setBusy] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  async function flip(sectionId: string, state: "open" | "closed") {
    setBusy(sectionId);
    try {
      const res = await fetch("/api/gates/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "quiz", targetId: quiz.id, sectionId, state }),
      });
      if (res.ok) {
        setGates((g) => ({ ...g, [sectionId]: state }));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 500, fontSize: "1.0625rem" }}>
            {quiz.title}
            {quiz.isDiagnostic && (
              <span
                style={{
                  ...mono,
                  fontSize: "0.625rem",
                  color: "var(--ochre)",
                  border: "1px solid var(--ochre)",
                  padding: "0.125rem 0.5rem",
                  marginLeft: "0.75rem",
                  verticalAlign: "middle",
                }}
              >
                Diagnostic — never counts, invisible to students
              </span>
            )}
          </p>
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.375rem 0 0" }}>
            Session {quiz.sessionNo} · {quiz.questionCount} questions · {quiz.attemptCount} attempts
            {quiz.avgScorePct !== null && ` · avg ${Math.round(quiz.avgScorePct)}%`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowResults((s) => !s)}
          style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {showResults ? "Hide results" : "Results"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem", alignItems: "center" }}>
        {sections.map((s) => (
          <div key={s.id} style={{ display: "grid", justifyItems: "center", gap: "0.25rem" }}>
            <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)" }}>{s.code}</span>
            <GateButton
              state={gates[s.id] ?? "locked"}
              busy={busy === s.id}
              onArm={() => flip(s.id, "open")}
              onDisarm={() => flip(s.id, "closed")}
            />
          </div>
        ))}
      </div>

      {showResults && quiz.results && (
        <div style={{ marginTop: "1.25rem", overflowX: "auto" }}>
          {quiz.isDiagnostic && (
            <p style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", margin: "0 0 0.5rem" }}>
              Pre-read signal — per-section correct-rate per question
            </p>
          )}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <Th style={th}>Section</Th>
                <Th style={th}>Attempts</Th>
                <Th style={th}>Avg</Th>
                {quiz.results.questions.map((q, i) => (
                  <Th key={i} style={th} title={q}>
                    Q{i + 1}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quiz.results.perSection.map((row) => (
                <tr key={row.sectionId}>
                  <Td style={{ ...td, ...mono, fontSize: "0.6875rem" }}>{row.sectionCode}</Td>
                  <Td style={td}>{row.attemptCount}</Td>
                  <Td style={td}>
                    {row.avgScorePct === null ? "—" : `${Math.round(row.avgScorePct)}%`}
                  </Td>
                  {row.perQuestionCorrectPct.map((pct, i) => (
                    <Td key={i} style={{ ...td, color: pct < 50 ? "#8a2a1c" : "var(--ink)" }}>
                      {row.attemptCount === 0 ? "—" : `${pct}%`}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

type DraftQuestion = { q: string; options: string[]; correctIndex: number };

const emptyQuestion = (): DraftQuestion => ({ q: "", options: ["", "", "", ""], correctIndex: 0 });

const input: React.CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.9375rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  padding: "0.5rem 0.75rem",
  width: "100%",
  boxSizing: "border-box",
};

function CreateQuizForm() {
  const router = useRouter();
  const [sessionNo, setSessionNo] = useState(1);
  const [title, setTitle] = useState("");
  const [isDiagnostic, setIsDiagnostic] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    Array.from({ length: 5 }, emptyQuestion),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function patchQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  const valid =
    title.trim().length > 0 &&
    questions.length >= 5 &&
    questions.length <= 8 &&
    questions.every((q) => q.q.trim() && q.options.every((o) => o.trim()));

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/instructor/quizzes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionNo, title: title.trim(), isDiagnostic, questions }),
      });
      const body = await res.json();
      if (res.ok) {
        setMsg("Quiz created. Arm it above when you're ready.");
        setTitle("");
        setIsDiagnostic(false);
        setQuestions(Array.from({ length: 5 }, emptyQuestion));
        router.refresh();
      } else {
        setMsg(body.error ?? "Could not create the quiz.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Create a quiz</h2>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1rem" }}>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>Session</span>
            <select
              value={sessionNo}
              onChange={(e) => setSessionNo(Number(e.target.value))}
              style={{ ...input, width: "auto" }}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Surprise quiz · …"
              style={input}
            />
          </label>
        </div>

        <label style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={isDiagnostic}
            onChange={(e) => setIsDiagnostic(e.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span style={{ fontSize: "0.875rem", color: "var(--charcoal)", lineHeight: 1.5 }}>
            <strong>Diagnostic quiz.</strong> Students take it like any other quiz and see
            their score, but it never counts toward any grade and never appears in any
            student-facing history or tally — instructor signal only. Do not mention its
            special status to students anywhere.
          </span>
        </label>

        {questions.map((q, i) => (
          <div key={i} style={{ border: "1px solid var(--sand)", padding: "1rem", display: "grid", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
                Question {i + 1}
              </span>
              {questions.length > 5 && (
                <button
                  type="button"
                  onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                  style={{ ...mono, fontSize: "0.625rem", color: "#8a2a1c", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              value={q.q}
              onChange={(e) => patchQuestion(i, { q: e.target.value })}
              placeholder="The question"
              style={input}
            />
            {q.options.map((opt, j) => (
              <label key={j} style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
                <input
                  type="radio"
                  name={`correct_${i}`}
                  checked={q.correctIndex === j}
                  onChange={() => patchQuestion(i, { correctIndex: j })}
                  title="Correct answer"
                />
                <input
                  value={opt}
                  onChange={(e) =>
                    patchQuestion(i, {
                      options: q.options.map((o, k) => (k === j ? e.target.value : o)),
                    })
                  }
                  placeholder={`Option ${j + 1}${q.correctIndex === j ? " (correct)" : ""}`}
                  style={input}
                />
              </label>
            ))}
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {questions.length < 8 && (
            <button
              type="button"
              onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
              style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)", background: "var(--parchment)", border: "1px solid var(--sand)", padding: "0.375rem 0.75rem", cursor: "pointer" }}
            >
              + Add question ({questions.length}/8)
            </button>
          )}
          <Button type="button" disabled={!valid || busy} onClick={create}>
            {busy ? "Creating…" : "Create quiz"}
          </Button>
          {msg && <span style={{ fontSize: "0.875rem", color: "var(--charcoal)" }}>{msg}</span>}
        </div>
      </div>
    </Card>
  );
}

export function QuizzesPanel({
  quizzes,
  sections,
}: {
  quizzes: PanelQuiz[];
  sections: PanelSection[];
}) {
  const sessionNos = [...new Set(quizzes.map((q) => q.sessionNo))].sort((a, b) => a - b);
  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {sessionNos.map((n) => (
        <section key={n} style={{ display: "grid", gap: "0.75rem" }}>
          <h2 style={{ ...mono, fontSize: "0.75rem", color: "var(--clay)", margin: 0 }}>
            Session {n}
          </h2>
          {quizzes
            .filter((q) => q.sessionNo === n)
            .map((q) => (
              <QuizCard key={q.id} quiz={q} sections={sections} />
            ))}
        </section>
      ))}
      <CreateQuizForm />
    </div>
  );
}
