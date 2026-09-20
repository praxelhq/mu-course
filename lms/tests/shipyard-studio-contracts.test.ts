import { describe, expect, it } from "vitest";
import {
  allowedEmail,
  checkpointFields,
  gateOpen,
  wordCount,
  documentSchema,
  emptyDocument,
  reviewSchema,
  canPass,
} from "@/lib/shipyard/studio/contracts";

describe("Shipyard studio contract", () => {
  it("admits exact institutional domains, not lookalikes", () => {
    expect(allowedEmail("Student@mastersunion.org")).toBe(true);
    expect(allowedEmail("x@mastersunion.org.evil.com")).toBe(false);
    expect(allowedEmail("x@notmastersunion.org")).toBe(false);
    expect(allowedEmail("x@gmail.com")).toBe(false);
  });
  it("counts only the idea and enforces fewer than 200 words", () => {
    const fields = {
      title: "A useful product",
      description: Array(199).fill("word").join(" "),
      visuals: ["idea-image"],
    };
    expect(wordCount(fields.description)).toBe(199);
    expect(checkpointFields(1).safeParse(fields).success).toBe(true);
    expect(
      checkpointFields(1).safeParse({
        ...fields,
        description: fields.description + " word",
      }).success,
    ).toBe(false);
  });
  it("accepts a visual instead of a landing page for the idea", () => {
    const fields = {
      title: "Invoice helper",
      description: "Simple invoicing software for freelance designers.",
      visuals: ["image"],
    };
    expect(checkpointFields(1).safeParse(fields).success).toBe(true);
    expect(
      checkpointFields(1).safeParse({ ...fields, visuals: [] }).success,
    ).toBe(false);
  });
  it("accepts a plain-text feature list and screen images without a separate sketch", () => {
    expect(
      checkpointFields(2).safeParse({
        job: "When a freelancer finishes a job, they need to send an invoice.",
        featureList:
          "Create an invoice: enter client and amount. Export: download a PDF.",
        designs: ["screen-image"],
      }).success,
    ).toBe(true);
  });
  it("requires design images for the product spec", () => {
    expect(
      checkpointFields(2).safeParse({
        job: "When I need a thing, I want it done so I can work.",
        features: [
          {
            name: "Export",
            description: "Export the work as a file.",
            mlp: true,
          },
        ],
        sketches: [],
        designs: [],
      }).success,
    ).toBe(false);
  });
  it("gates on the most recent submitted version, never an older pass", () => {
    const rows = [
      { checkpoint: 1, version: 1, status: "passed" },
      { checkpoint: 1, version: 2, status: "revise" },
    ];
    expect(gateOpen(1, rows)).toBe(true);
    expect(gateOpen(2, rows)).toBe(false);
    expect(
      gateOpen(3, [
        { checkpoint: 1, version: 1, status: "passed" },
        { checkpoint: 2, version: 1, status: "passed" },
      ]),
    ).toBe(true);
  });
  it("keeps final submission minimal and needs no review", () => {
    expect(
      checkpointFields(3).safeParse({
        liveUrl: "https://example.com",
        notes: "",
      }).success,
    ).toBe(true);
  });
  it("rejects a model's pass when a criterion is unmet or missing", () => {
    const review = reviewSchema.parse({
      decision: "pass",
      summary: "Good",
      criteria: [{ id: "build", met: true, reason: "Small", change: "None" }],
      nextSteps: [],
      sourceIds: [],
    });
    expect(canPass(1, review)).toBe(false);
  });
  it("round trips the empty workspace and requires an active idea to exist", () => {
    expect(documentSchema.safeParse(emptyDocument()).success).toBe(true);
    expect(
      documentSchema.safeParse({ ...emptyDocument(), activeIdeaId: "missing" })
        .success,
    ).toBe(false);
  });
});
