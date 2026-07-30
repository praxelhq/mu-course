import { describe, expect, it } from "vitest";

// U15 — component scorers + the frozen final formula, pure functions (written
// RED-FIRST: this file existed and failed before lib/scoring/* did). Every
// fixture is hand-computed in a comment; the frozen methodology
// (docs/build/01_scoring_methodology.md §§1–8) wins any conflict.

import {
  aiInterview,
  artifactQuality,
  peerContribution,
  portfolio,
  quizzes,
  valueChainMap,
  workflowUsefulness,
} from "../lib/scoring/components";
import { finalGrade, WEIGHTS } from "../lib/scoring/formula";
import { verifiedSignOffStatus } from "../lib/scoring/assemble";

// ---------------------------------------------------------------------------
// §1 Value chain map — team score × PCI, clipped to 100 after the multiply
// ---------------------------------------------------------------------------

describe("valueChainMap", () => {
  it("multiplies the team score by the PCI: 80 × 1.1 = 88", () => {
    expect(valueChainMap({ teamMapGrade100: 80, pci: 1.1 }).raw).toBeCloseTo(88, 10);
  });

  it("clips to 100 AFTER the multiply: 95 × 1.2 = 114 → 100", () => {
    expect(valueChainMap({ teamMapGrade100: 95, pci: 1.2 }).raw).toBe(100);
  });

  it("PCI below 1 pulls the score down: 80 × 0.7 = 56", () => {
    expect(valueChainMap({ teamMapGrade100: 80, pci: 0.7 }).raw).toBeCloseTo(56, 10);
  });

  it("no team map grade yet → null (pending)", () => {
    expect(valueChainMap({ teamMapGrade100: null, pci: 1.0 }).raw).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2 Artifact quality — mean of individually-submitted artifact grades
// (each 0–40, scaled ×2.5 to 0–100), team media grade included in the mean
// ---------------------------------------------------------------------------

describe("artifactQuality", () => {
  it("scales each 0–40 grade ×2.5 and averages: [32, 36] → [80, 90] → 85", () => {
    expect(artifactQuality({ individualArtifactGrades: [32, 36] }).raw).toBeCloseTo(85, 10);
  });

  it("includes the team media grade in the mean per §2: [32, 36] + media 24 → (80+90+60)/3", () => {
    expect(
      artifactQuality({ individualArtifactGrades: [32, 36], teamMediaGrade0to40: 24 }).raw,
    ).toBeCloseTo((80 + 90 + 60) / 3, 2); // component raws round to 2 dp
  });

  it("media grade alone still scores (team artifact applies to every member)", () => {
    expect(
      artifactQuality({ individualArtifactGrades: [], teamMediaGrade0to40: 40 }).raw,
    ).toBe(100);
  });

  it("no graded artifacts at all → null (pending)", () => {
    expect(artifactQuality({ individualArtifactGrades: [] }).raw).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §3 Workflow — sign-off (0/15/40) + usefulness (0–30) + execution (0–20)
// pooled and ×PCI, plus individual ownership (0–10) OUTSIDE the multiplier
// ("applied to that specific student only"). Clip 100 after.
// ---------------------------------------------------------------------------

describe("workflowUsefulness", () => {
  it("signed_off=40 + 25 + 15 = 80 team pts, ×1.0 PCI, + 8 ownership = 88", () => {
    const r = workflowUsefulness({
      signOffStatus: "signed_off",
      usefulness0to30: 25,
      execution0to20: 15,
      ownership0to10: 8,
      pci: 1.0,
    });
    expect(r.raw).toBeCloseTo(88, 10);
  });

  it("PCI multiplies ONLY the team portion: (40+25+15)×0.8 + 8 = 72, not 70.4", () => {
    const r = workflowUsefulness({
      signOffStatus: "signed_off",
      usefulness0to30: 25,
      execution0to20: 15,
      ownership0to10: 8,
      pci: 0.8,
    });
    // team 80 × 0.8 = 64; + ownership 8 (NOT ×0.8) = 72
    expect(r.raw).toBeCloseTo(72, 10);
  });

  it("sign-off ladder: none→0, contacted→15, signed_off→40", () => {
    const base = { usefulness0to30: 0, execution0to20: 0, ownership0to10: 0, pci: 1.0 };
    expect(workflowUsefulness({ ...base, signOffStatus: "none" }).raw).toBe(0);
    expect(workflowUsefulness({ ...base, signOffStatus: "contacted" }).raw).toBe(15);
    expect(workflowUsefulness({ ...base, signOffStatus: "signed_off" }).raw).toBe(40);
  });

  it("clips to 100: full marks × PCI 1.2 → 90×1.2 + 10 = 118 → 100", () => {
    const r = workflowUsefulness({
      signOffStatus: "signed_off",
      usefulness0to30: 30,
      execution0to20: 20,
      ownership0to10: 10,
      pci: 1.2,
    });
    expect(r.raw).toBe(100);
  });

  it("no graded workflow yet (null parts) → null (pending)", () => {
    const r = workflowUsefulness({
      signOffStatus: "signed_off",
      usefulness0to30: null,
      execution0to20: null,
      ownership0to10: null,
      pci: 1.0,
    });
    expect(r.raw).toBeNull();
  });
});

describe("verified company sign-off", () => {
  const signOff = {
    status: "signed_off",
    teamId: "team-a",
    assignmentId: "workflow-assignment",
    recordedBy: "instructor-1",
    evidenceS3Key: "signoffs/team-a/verified.pdf",
  };

  it("accepts only evidenced, staff-recorded sign-off bound to the selected workflow", () => {
    expect(
      verifiedSignOffStatus({
        signOff,
        selectedAssignmentId: "workflow-assignment",
        recorderRole: "instructor",
      }),
    ).toBe("signed_off");
  });

  it("fails closed for absent evidence, non-staff recorders, and assignment mismatch", () => {
    expect(
      verifiedSignOffStatus({
        signOff: { ...signOff, evidenceS3Key: null },
        selectedAssignmentId: "workflow-assignment",
        recorderRole: "instructor",
      }),
    ).toBe("none");
    expect(
      verifiedSignOffStatus({
        signOff,
        selectedAssignmentId: "workflow-assignment",
        recorderRole: "student",
      }),
    ).toBe("none");
    expect(
      verifiedSignOffStatus({
        signOff,
        selectedAssignmentId: "another-assignment",
        recorderRole: "admin",
      }),
    ).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// §4 AI interview — four categories × 25, summed
// ---------------------------------------------------------------------------

describe("aiInterview", () => {
  it("sums the four 25-point categories: 22+19+21+17 = 79 (the seeded iv_001)", () => {
    expect(
      aiInterview({
        rubricScores: {
          industry_command: 22,
          defence_of_submissions: 19,
          operators_loop: 21,
          transfer: 17,
        },
      }).raw,
    ).toBe(79);
  });

  it("null rubric (not graded / escalated) → null (pending)", () => {
    expect(aiInterview({ rubricScores: null }).raw).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §5 Peer contribution (standalone 10%) — mean of all 1–5 ratings across
// raters and checkpoints, normalized to 0–100 (mean × 20) so the line item
// sits on the same 0–100 scale as every other component pre-weight.
// ---------------------------------------------------------------------------

describe("peerContribution", () => {
  it("mean of all ratings × 20: [{5,4,3},{4,4,4}] → mean 4 → 80", () => {
    expect(
      peerContribution({
        ratings: [
          { reliability: 5, communication: 4, helpfulness: 3 },
          { reliability: 4, communication: 4, helpfulness: 4 },
        ],
      }).raw,
    ).toBeCloseTo(80, 10);
  });

  it("all 5s → 100; all 1s → 20 (a 1–5 scale never reaches 0)", () => {
    expect(
      peerContribution({ ratings: [{ reliability: 5, communication: 5, helpfulness: 5 }] }).raw,
    ).toBe(100);
    expect(
      peerContribution({ ratings: [{ reliability: 1, communication: 1, helpfulness: 1 }] }).raw,
    ).toBe(20);
  });

  it("no ratings yet → null (pending)", () => {
    expect(peerContribution({ ratings: [] }).raw).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §6 Quizzes — passthrough of the best-of-three average (the ONLY quiz feed)
// ---------------------------------------------------------------------------

describe("quizzes", () => {
  it("passes the best-of-three average through", () => {
    expect(quizzes({ bestOfThreeAvg: 76.5 }).raw).toBe(76.5);
  });
  it("null (no counting attempts) → null (pending)", () => {
    expect(quizzes({ bestOfThreeAvg: null }).raw).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §7 Portfolio — five parts summed (20+25+25+15+15 = 100)
// ---------------------------------------------------------------------------

describe("portfolio", () => {
  it("sums the five parts: 20+20+15+10+15 = 80", () => {
    expect(
      portfolio({
        completeness0to20: 20,
        narrative0to25: 20,
        external0to25: 15,
        peer0to15: 10,
        evidenceIntegrity0to15: 15,
      }).raw,
    ).toBe(80);
  });

  it("missing crawl (evidenceIntegrity null) → scored as 0 with a 'no crawl yet' detail", () => {
    const r = portfolio({
      completeness0to20: 20,
      narrative0to25: 25,
      external0to25: 25,
      peer0to15: 15,
      evidenceIntegrity0to15: null,
    });
    expect(r.raw).toBe(85); // 20+25+25+15+0
    expect(r.detail.toLowerCase()).toContain("no crawl");
  });
});

// ---------------------------------------------------------------------------
// §8 The final formula — weights and a full hand-computed fixture
// ---------------------------------------------------------------------------

describe("finalGrade", () => {
  it("weights sum to exactly 1.0", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("computes the hand-worked full fixture", () => {
    // Hand arithmetic:
    //   vcm       90 × 0.15 = 13.50
    //   artifact  80 × 0.15 = 12.00
    //   workflow  70 × 0.15 = 10.50
    //   interview 79 × 0.15 = 11.85
    //   peer      84 × 0.10 =  8.40
    //   quizzes   90 × 0.05 =  4.50
    //   portfolio 60 × 0.25 = 15.00
    //   total               = 75.75
    const result = finalGrade({
      vcm: { raw: 90, detail: "", pciApplied: 1.1 },
      artifact: { raw: 80, detail: "" },
      workflow: { raw: 70, detail: "", pciApplied: 1.1 },
      interview: { raw: 79, detail: "" },
      peer: { raw: 84, detail: "" },
      quizzes: { raw: 90, detail: "" },
      portfolio: { raw: 60, detail: "" },
    });
    expect(result.total).toBeCloseTo(75.75, 10);
    expect(result.lines).toHaveLength(7);
    const vcm = result.lines.find((l) => l.key === "vcm")!;
    expect(vcm.weighted).toBeCloseTo(13.5, 10);
    expect(vcm.pciApplied).toBe(1.1);
    expect(vcm.pending).toBe(false);
  });

  it("null components contribute 0 but stay itemized as pending — the line always renders all 7", () => {
    const result = finalGrade({
      vcm: { raw: null, detail: "" },
      artifact: { raw: 80, detail: "" },
      workflow: { raw: null, detail: "" },
      interview: { raw: null, detail: "" },
      peer: { raw: null, detail: "" },
      quizzes: { raw: null, detail: "" },
      portfolio: { raw: null, detail: "" },
    });
    // Only artifact contributes: 80 × 0.15 = 12
    expect(result.total).toBeCloseTo(12, 10);
    expect(result.lines).toHaveLength(7);
    expect(result.lines.filter((l) => l.pending)).toHaveLength(6);
    for (const line of result.lines.filter((l) => l.pending)) {
      expect(line.weighted).toBe(0);
      expect(line.raw).toBeNull();
    }
  });

  it("carries provisional flags through to the lines", () => {
    const result = finalGrade({
      vcm: { raw: 90, detail: "", provisional: true },
      artifact: { raw: 80, detail: "", provisional: false },
      workflow: { raw: null, detail: "" },
      interview: { raw: 79, detail: "" },
      peer: { raw: 84, detail: "" },
      quizzes: { raw: 90, detail: "" },
      portfolio: { raw: 60, detail: "" },
    });
    expect(result.lines.find((l) => l.key === "vcm")!.provisional).toBe(true);
    expect(result.lines.find((l) => l.key === "artifact")!.provisional).toBe(false);
  });
});
