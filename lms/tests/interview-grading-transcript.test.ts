import { describe, expect, it } from "vitest";
import {
  assembleInterviewGradingContext,
  joinStudentRuns,
  type TranscriptTurn,
} from "../lib/ai/interview-grading";

// A pause ends a student turn, so one answer arrives as several rows. The
// grader must see it as one answer, and must be told an answer the interviewer
// talked over is not the student's fault.

const t0 = new Date("2026-09-12T17:47:36Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

function turn(turnNo: number, speaker: string, text: string, s: number): TranscriptTurn {
  return { turnNo, speaker, text, startedAt: at(s) };
}

describe("joinStudentRuns", () => {
  it("joins consecutive student turns into one, timed from the first piece", () => {
    const joined = joinStudentRuns([
      turn(1, "agent", "How would you tell whether the emails were doing a good job?", 0),
      turn(2, "student", "Firstly, I would provide ", 27),
      turn(3, "student", "them some template of the emails", 34),
      turn(4, "student", "and check the replies.", 49),
      turn(5, "agent", "Let's move on to your workflow.", 60),
    ]);

    expect(joined.map((t) => t.speaker)).toEqual(["agent", "student", "agent"]);
    expect(joined[1]!.text).toBe(
      "Firstly, I would provide them some template of the emails and check the replies.",
    );
    expect(joined[1]!.startedAt).toEqual(at(27));
    expect(joined[1]!.turnNo).toBe(2);
  });

  it("never joins across an interviewer turn", () => {
    const joined = joinStudentRuns([
      turn(1, "student", "Historical data of an organization through", 0),
      turn(2, "agent", "What data would you keep out?", 7),
      turn(3, "student", "we can do some predictive analysis.", 16),
    ]);
    expect(joined).toHaveLength(3);
  });

  it("does not mutate the stored transcript it was given", () => {
    const input = [turn(1, "student", "one", 0), turn(2, "student", "two", 5)];
    joinStudentRuns(input);
    expect(input.map((t) => t.text)).toEqual(["one", "two"]);
  });
});

describe("assembleInterviewGradingContext", () => {
  it("shows the grader one STUDENT line per answer", () => {
    const { user } = assembleInterviewGradingContext({
      transcript: [
        turn(1, "agent", "Which part of your sector map are you least sure about?", 0),
        turn(2, "student", "I would be least confident about how easy", 23),
        turn(3, "student", "it is for new entrants to enter.", 64),
      ],
      submissions: [],
      sectorName: null,
    });
    expect(user.match(/STUDENT:/g)).toHaveLength(1);
    expect(user).toContain("how easy it is for new entrants to enter.");
  });

  it("tells the grader interrupted answers belong to the earlier question and cost nothing", () => {
    const { system } = assembleInterviewGradingContext({
      transcript: [],
      submissions: [],
      sectorName: null,
    });
    expect(system).toContain("CUT BY MACHINE TURN-TAKING");
    expect(system).toContain("ONE answer to the earlier question");
    expect(system).toContain("never lower a score for it");
  });
});
