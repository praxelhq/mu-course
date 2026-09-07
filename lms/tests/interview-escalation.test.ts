import { describe, expect, it } from "vitest";
import {
  ESCALATION_MAILBOX,
  instructorReplyDraft,
  studentEscalationMail,
  type InterviewProgress,
} from "../lib/interview/escalation";

// U8 — recovery for a dropped call. Both templates carry progress and never a
// score: grades reach students through instructor review, not a support mail.

const progress: InterviewProgress = {
  interviewId: "iv_042",
  attemptNumber: 1,
  segmentsCovered: ["intro", "ai_in_their_work"],
  studentTurns: 4,
  startedAt: new Date("2026-09-03T09:30:00.000Z"),
};

describe("student escalation mail", () => {
  it("is addressed to the build mailbox", () => {
    expect(studentEscalationMail(progress).to).toBe(ESCALATION_MAILBOX);
    expect(ESCALATION_MAILBOX).toBe("build@praxel.in");
  });

  it("carries the interview reference, attempt, timestamp and how far they got", () => {
    const { body } = studentEscalationMail(progress);
    expect(body).toContain("iv_042");
    expect(body).toContain("Attempt: 1");
    expect(body).toContain("2026-09-03T09:30:00.000Z");
    expect(body).toContain("4 answers recorded");
  });

  it("builds a mailto href that survives the newlines", () => {
    const { href, subject } = studentEscalationMail(progress);
    expect(href.startsWith(`mailto:${ESCALATION_MAILBOX}?`)).toBe(true);
    expect(href).toContain(encodeURIComponent(subject));
    expect(href).toContain("%0A");
    expect(href).not.toMatch(/\n/);
  });

  it("says plainly when the call dropped before any answer", () => {
    const { body } = studentEscalationMail({ ...progress, studentTurns: 0, segmentsCovered: [] });
    expect(body).toMatch(/before any answer was recorded/i);
  });

  it("uses the singular for a single answer", () => {
    expect(studentEscalationMail({ ...progress, studentTurns: 1 }).body).toContain(
      "1 answer recorded",
    );
  });

  it("carries no score, rubric or confidence", () => {
    const { body, subject } = studentEscalationMail(progress);
    for (const forbidden of [/score/i, /rubric/i, /confidence/i, /grade/i, /marks/i, /\/100/]) {
      expect(body).not.toMatch(forbidden);
      expect(subject).not.toMatch(forbidden);
    }
  });
});

describe("instructor reply draft", () => {
  const draft = () =>
    instructorReplyDraft({
      progress,
      studentName: "Ravi",
      interviewUrl: "https://forge.example/interview",
    });

  it("greets the student and carries the fresh link", () => {
    expect(draft()).toContain("Hi Ravi,");
    expect(draft()).toContain("https://forge.example/interview");
  });

  it("names what was covered so the student is not asked to repeat it", () => {
    expect(draft()).toMatch(/introduction/);
    expect(draft()).toMatch(/applying AI in their previous role/);
  });

  it("names what is still to cover", () => {
    const text = draft();
    expect(text).toMatch(/Still to cover/);
    expect(text).toMatch(/retrieval and connectors/);
    expect(text).toMatch(/defending their own workflow/);
  });

  it("does not promise remaining questions when the interview had finished", () => {
    const text = instructorReplyDraft({
      progress: {
        ...progress,
        segmentsCovered: [
          "intro",
          "ai_in_their_work",
          "data_and_privacy",
          "rag_mcp",
          "own_work_defence",
        ],
      },
      studentName: "Ravi",
      interviewUrl: "https://forge.example/interview",
    });
    expect(text).toMatch(/reached the end/i);
    expect(text).not.toMatch(/Still to cover/);
  });

  it("handles a zero-turn interview without claiming progress", () => {
    const text = instructorReplyDraft({
      progress: { ...progress, studentTurns: 0, segmentsCovered: [] },
      studentName: "Ravi",
      interviewUrl: "https://forge.example/interview",
    });
    expect(text).toMatch(/before any answer was recorded/i);
  });

  it("reassures that the interruption is not held against them", () => {
    expect(draft()).toMatch(/not be marked down/i);
  });

  it("carries no score, rubric or confidence", () => {
    const text = draft();
    for (const forbidden of [/score/i, /rubric/i, /confidence/i, /\/100/]) {
      expect(text).not.toMatch(forbidden);
    }
  });
});
