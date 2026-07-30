"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

export type TakeQuestion = { q: string; options: string[] };
export type TakeStableQuestion = {
  itemVersionId: string;
  q: string;
  options: { optionId: string; text: string }[];
};

export type ReceiptPayload = {
  attemptId: string;
  quizId: string;
  title: string;
  sessionNo: number;
  submittedAt: string;
  feedbackReleaseAt: string;
};

type LegacyResultLine = {
  q: string;
  options: string[];
  yourAnswer: number;
  correctAnswer: number;
  correct: boolean;
};

type StableResultLine = {
  itemVersionId: string;
  q: string;
  options: { optionId: string; text: string }[];
  selectedOptionId: string;
  correctOptionId: string;
  correct: boolean;
  rationale?: string;
  feedbackMd?: string;
};

type QuizResult = {
  scorePct: number;
  correctCount: number;
  questionCount: number;
  lines: (LegacyResultLine | StableResultLine)[];
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const releaseFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function isStableQuestion(question: TakeQuestion | TakeStableQuestion): question is TakeStableQuestion {
  return "itemVersionId" in question;
}

function isStableLine(line: LegacyResultLine | StableResultLine): line is StableResultLine {
  return "itemVersionId" in line;
}

function AttemptReceipt({ receipt }: { receipt: ReceiptPayload }) {
  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <Card style={{ textAlign: "center", padding: "2.5rem 2rem" }}>
        <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
          Attempt received
        </p>
        <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem", color: "var(--pine)" }}>
          Your answers are safely recorded.
        </h2>
        <p style={{ color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>
          Feedback releases after the delivery window closes, at{" "}
          <strong>{releaseFmt.format(new Date(receipt.feedbackReleaseAt))}</strong>. Until then,
          this receipt is the only result shown.
        </p>
        <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "1rem 0 0" }}>
          Receipt {receipt.attemptId}
        </p>
      </Card>
      <p style={{ margin: 0 }}>
        <Link href="/quizzes" style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)" }}>
          View your quiz record →
        </Link>
      </p>
    </div>
  );
}

function ReleasedResult({ result }: { result: QuizResult }) {
  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <Card style={{ textAlign: "center", padding: "2.5rem 2rem" }}>
        <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
          Your score
        </p>
        <p style={{ fontFamily: "var(--font-fraunces)", fontSize: "3rem", fontWeight: 700, margin: 0, color: "var(--pine)" }}>
          {Math.round(result.scorePct * 10) / 10}%
        </p>
        <p style={{ color: "var(--charcoal)", margin: "0.75rem 0 0" }}>
          {result.correctCount} of {result.questionCount} correct. The released answers below
          are feedback — worth a look while the material is fresh.
        </p>
      </Card>

      {result.lines.map((line, index) => (
        <Card key={isStableLine(line) ? line.itemVersionId : index}>
          <p style={{ margin: "0 0 0.75rem", fontWeight: 500 }}>
            {index + 1}. {line.q}
          </p>
          {isStableLine(line) && (
            <p style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)", margin: "-0.5rem 0 0.75rem" }}>
              {line.itemVersionId}
            </p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.375rem" }}>
            {line.options.map((option, optionIndex) => {
              const stable = isStableLine(line);
              const optionId = stable ? (option as { optionId: string }).optionId : String(optionIndex);
              const text = stable ? (option as { text: string }).text : (option as string);
              const isCorrect = stable
                ? optionId === line.correctOptionId
                : optionIndex === line.correctAnswer;
              const isYours = stable
                ? optionId === line.selectedOptionId
                : optionIndex === line.yourAnswer;
              return (
                <li
                  key={optionId}
                  style={{
                    border: `1px solid ${isCorrect ? "var(--pine)" : "var(--sand)"}`,
                    padding: "0.5rem 0.75rem",
                    color: isCorrect ? "var(--pine)" : isYours ? "var(--charcoal)" : "var(--clay)",
                    fontWeight: isCorrect ? 600 : 400,
                  }}
                >
                  {text}
                  {stable && (
                    <span style={{ ...mono, fontSize: "0.5625rem", marginLeft: "0.5rem", color: "var(--clay)" }}>
                      {optionId}
                    </span>
                  )}
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
          {isStableLine(line) && (line.rationale || line.feedbackMd) && (
            <div style={{ marginTop: "0.875rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
              {line.rationale && <p style={{ margin: 0 }}>{line.rationale}</p>}
              {line.feedbackMd && <p style={{ margin: "0.5rem 0 0" }}>{line.feedbackMd}</p>}
            </div>
          )}
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

export function QuizTakeForm({
  quizId,
  questions,
  initialReceipt,
  initialResult,
}: {
  quizId: string;
  questions: (TakeQuestion | TakeStableQuestion)[];
  initialReceipt?: ReceiptPayload;
  initialResult?: QuizResult;
}) {
  const [answers, setAnswers] = useState<(number | string | null)[]>(
    questions.map(() => null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(initialReceipt ?? null);
  const [result, setResult] = useState<QuizResult | null>(initialResult ?? null);

  const allAnswered = answers.every((answer) => answer !== null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const answerPayload = questions.map((question, index) =>
        isStableQuestion(question)
          ? {
              itemVersionId: question.itemVersionId,
              selectedOptionId: answers[index],
            }
          : answers[index],
      );
      const response = await fetch(`/api/quiz/${quizId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: answerPayload }),
      });
      const body = (await response.json().catch(() => null)) as
        | { result?: QuizResult; receipt?: ReceiptPayload; error?: string }
        | null;
      if (body?.result) {
        setResult(body.result);
        setReceipt(null);
      } else if (body?.receipt) {
        setReceipt(body.receipt);
      } else {
        setError(body?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <ReleasedResult result={result} />;
  if (receipt) return <AttemptReceipt receipt={receipt} />;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {questions.map((question, index) => (
        <Card key={isStableQuestion(question) ? question.itemVersionId : index}>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ margin: "0 0 0.75rem", fontWeight: 500 }}>
              {index + 1}. {question.q}
            </legend>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.375rem" }}>
              {question.options.map((option, optionIndex) => {
                const optionId = isStableQuestion(question)
                  ? (option as { optionId: string }).optionId
                  : optionIndex;
                const text = isStableQuestion(question)
                  ? (option as { text: string }).text
                  : (option as string);
                return (
                  <li key={String(optionId)}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.625rem",
                        border: `1px solid ${answers[index] === optionId ? "var(--pine)" : "var(--sand)"}`,
                        padding: "0.5rem 0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={`q${index}`}
                        checked={answers[index] === optionId}
                        onChange={() =>
                          setAnswers((current) =>
                            current.map((answer, answerIndex) =>
                              answerIndex === index ? optionId : answer,
                            ),
                          )
                        }
                      />
                      {text}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </Card>
      ))}

      {error && <p style={{ color: "#8a2a1c", margin: 0 }}>{error}</p>}
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
