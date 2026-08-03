"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

// The quiz taking flow: all questions on one page, radio options, one submit.
// After submitting, the immediate formative result: score plus the correct
// answer for every question. Identical for every quiz.

export type TakeQuestion = { q: string; options: string[] };

type ResultLine = {
  q: string;
  options: string[];
  yourAnswer: number;
  correctAnswer: number;
  correct: boolean;
};

type QuizResult = {
  scorePct: number;
  correctCount: number;
  questionCount: number;
  lines: ResultLine[];
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export function QuizTakeForm({
  quizId,
  questions,
}: {
  quizId: string;
  questions: TakeQuestion[];
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  const allAnswered = answers.every((a) => a !== null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz/${quizId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = await res.json();
      if (body.result) {
        setResult(body.result); // ok or duplicate — either way, the result
      } else {
        setError(body.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Card style={{ textAlign: "center", padding: "2.5rem 2rem" }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
            Your score
          </p>
          <p style={{ fontFamily: "var(--font-fraunces)", fontSize: "3rem", fontWeight: 700, margin: 0, color: "var(--pine)" }}>
            {Math.round(result.scorePct)}%
          </p>
          <p style={{ color: "var(--charcoal)", margin: "0.75rem 0 0" }}>
            {result.correctCount} of {result.questionCount} correct. The answers below are
            feedback — worth a look while the material is fresh.
          </p>
        </Card>

        {result.lines.map((line, i) => (
          <Card key={i}>
            <p style={{ margin: "0 0 0.75rem", fontWeight: 500 }}>
              {i + 1}. {line.q}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.375rem" }}>
              {line.options.map((opt, j) => {
                const isCorrect = j === line.correctAnswer;
                const isYours = j === line.yourAnswer;
                return (
                  <li
                    key={j}
                    style={{
                      border: `1px solid ${isCorrect ? "var(--pine)" : "var(--sand)"}`,
                      padding: "0.5rem 0.75rem",
                      color: isCorrect ? "var(--pine)" : isYours ? "var(--charcoal)" : "var(--clay)",
                      fontWeight: isCorrect ? 600 : 400,
                    }}
                  >
                    {opt}
                    {isCorrect && (
                      <span style={{ ...mono, fontSize: "0.625rem", marginLeft: "0.5rem" }}>
                        Correct answer
                      </span>
                    )}
                    {isYours && !isCorrect && (
                      <span style={{ ...mono, fontSize: "0.625rem", marginLeft: "0.5rem" }}>
                        Your answer
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}

        <p style={{ margin: 0 }}>
          <Link href="/quizzes" style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)" }}>
            View your quiz record →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {questions.map((question, i) => (
        <Card key={i}>
          <p style={{ margin: "0 0 0.75rem", fontWeight: 500 }}>
            {i + 1}. {question.q}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.375rem" }}>
            {question.options.map((opt, j) => (
              <li key={j}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.625rem",
                    border: `1px solid ${answers[i] === j ? "var(--pine)" : "var(--sand)"}`,
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name={`q${i}`}
                    checked={answers[i] === j}
                    onChange={() => {
                      const next = [...answers];
                      next[i] = j;
                      setAnswers(next);
                    }}
                  />
                  {opt}
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {error && (
        <p style={{ color: "#8a2a1c", margin: 0 }}>{error}</p>
      )}
      <div>
        <Button type="button" disabled={!allAnswered || submitting} onClick={submit}>
          {submitting ? "Submitting…" : "Submit answers"}
        </Button>
        {!allAnswered && (
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.5rem 0 0" }}>
            Answer every question to submit.
          </p>
        )}
      </div>
    </div>
  );
}
