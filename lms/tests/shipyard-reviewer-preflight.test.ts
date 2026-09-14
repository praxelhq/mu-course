// Pre-flight is the step that decides whether a model is asked anything at
// all, so the point of these tests is the CHEAP path: an ordinary submission
// must come out of here fully decided, with `ambiguous` false and no call.

import { describe, expect, it, vi } from "vitest";
import { checkpointDefinition } from "@/lib/shipyard/checkpoints";
import {
  blankFields,
  classifyWithModel,
  findNearDuplicate,
  isBlankSubmission,
  jaccard,
  runPreflight,
  shingles,
  spamSignal,
  submissionText,
} from "@/lib/shipyard/reviewer/preflight";

const IDEA = checkpointDefinition("idea");
const aliveProbe = vi.fn(async () => ({ alive: true, status: 200 }));

const goodIdeaFields = {
  productName: "DabbaRoute",
  oneLiner: "Plans the day's tiffin deliveries for a single-kitchen dabba service in Pune.",
  jobStory:
    "When three customers cancel by 9pm and I am re-sorting tomorrow's drops in a notebook, I want the route to redraw itself, so I can stop losing an hour every night to arithmetic.",
  waitlistUrl: "https://dabbaroute.carrd.co",
  signupCount: 41,
  trafficTestNotes:
    "Two Instagram reels aimed at Pune food-business accounts, 11,300 impressions, 268 visits, 41 signups, ₹1,400 spent.",
  signupScreenshot: ["uploads/tally.png"],
};

describe("the pure pieces", () => {
  it("joins every text and number field", () => {
    expect(submissionText({ a: "one", b: 2, c: ["x"] })).toBe("one\n2");
    expect(submissionText({ a: "one" }, "from a PDF")).toContain("from a PDF");
  });

  it("shingles on five-word windows", () => {
    expect(shingles("a b c d e f")).toEqual(new Set(["a b c d e", "b c d e f"]));
    expect(shingles("short one")).toEqual(new Set(["short one"]));
    expect(shingles("")).toEqual(new Set());
  });

  it("scores Jaccard the way sets do", () => {
    expect(jaccard(new Set(["a"]), new Set(["a"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(jaccard(new Set(), new Set())).toBe(1);
    expect(jaccard(new Set(["a", "b"]), new Set(["a"]))).toBeCloseTo(0.5);
  });

  it("finds a near-duplicate and ignores an unrelated submission", () => {
    const text = goodIdeaFields.jobStory + " " + goodIdeaFields.trafficTestNotes;
    const nudged = `${text} Thanks.`;
    expect(findNearDuplicate(text, [{ id: "sub_1", text: nudged }])?.id).toBe("sub_1");
    expect(findNearDuplicate(text, [{ id: "sub_2", text: "Something else entirely, about gyms." }])).toBeNull();
  });

  it("names the required text fields that are effectively empty", () => {
    // "DabbaRoute" is a legitimate ten-character product name.
    expect(blankFields(goodIdeaFields, IDEA.fieldSchema)).toEqual(["productName"]);
    expect(
      blankFields({ ...goodIdeaFields, jobStory: "tbd", oneLiner: "" }, IDEA.fieldSchema),
    ).toEqual(["productName", "oneLiner", "jobStory"]);
  });

  it("calls a submission blank only when EVERY required text field is short", () => {
    expect(isBlankSubmission(goodIdeaFields, IDEA.fieldSchema)).toBe(false);
    expect(
      isBlankSubmission({ ...goodIdeaFields, jobStory: "tbd" }, IDEA.fieldSchema),
    ).toBe(false);
    expect(
      isBlankSubmission(
        { productName: "x", oneLiner: "tbd", jobStory: "tbd", trafficTestNotes: "" },
        IDEA.fieldSchema,
      ),
    ).toBe(true);
  });

  it("calls obvious spam obvious, and ordinary prose not spam", () => {
    expect(spamSignal("buy followers now, limited time offer for everyone").spam).toBe(true);
    const links = Array.from({ length: 6 }, (_, i) => `https://x${i}.example.com`).join(" ");
    expect(spamSignal(links).spam).toBe(true);
    const ordinary = spamSignal(goodIdeaFields.jobStory);
    expect(ordinary.spam).toBe(false);
    expect(ordinary.confident).toBe(true);
  });

  it("is unsure about one marketing phrase inside ordinary prose", () => {
    const signal = spamSignal(`${goodIdeaFields.jobStory} I ran a limited time offer in August.`);
    expect(signal.spam).toBe(false);
    expect(signal.confident).toBe(false);
  });
});

describe("runPreflight", () => {
  it("clears an ordinary submission with no model call needed", async () => {
    const probe = vi.fn(async () => ({ alive: true, status: 200 }));
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: goodIdeaFields,
      fieldSpecs: IDEA.fieldSchema,
      probe,
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith("https://dabbaroute.carrd.co");
    expect(run.preflight.linkStatuses).toEqual([
      { url: "https://dabbaroute.carrd.co", alive: true, status: 200 },
    ]);
    expect(run.preflight.isBlank).toBe(false);
    expect(run.preflight.isSpam).toBe(false);
    expect(run.preflight.nearDuplicateOf).toBeUndefined();
    expect(run.ambiguous).toBe(false);
  });

  it("records a dead link without throwing", async () => {
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: goodIdeaFields,
      fieldSpecs: IDEA.fieldSchema,
      probe: async () => ({ alive: false, status: 404 }),
    });
    expect(run.preflight.linkStatuses[0].alive).toBe(false);
    expect(run.preflight.notes.join(" ")).toMatch(/did not respond \(404\)/);
  });

  it("survives a probe that throws", async () => {
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: goodIdeaFields,
      fieldSpecs: IDEA.fieldSchema,
      probe: async () => {
        throw new Error("blocked by the SSRF guard");
      },
    });
    expect(run.preflight.linkStatuses[0].alive).toBe(false);
    expect(run.preflight.notes.join(" ")).toMatch(/SSRF guard/);
  });

  it("calls a submission blank when nothing was answered", async () => {
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: { productName: "x", oneLiner: "tbd", jobStory: "tbd", trafficTestNotes: "-" },
      fieldSpecs: IDEA.fieldSchema,
      probe: aliveProbe,
    });
    expect(run.preflight.isBlank).toBe(true);
    expect(run.preflight.notes.join(" ")).toContain("jobStory");
  });

  it("flags a near-duplicate of another student's submission", async () => {
    const text = submissionText(goodIdeaFields);
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: goodIdeaFields,
      fieldSpecs: IDEA.fieldSchema,
      priorSubmissions: [{ id: "sy_sub_77", text }],
      probe: aliveProbe,
    });
    expect(run.preflight.nearDuplicateOf).toBe("sy_sub_77");
  });

  it("asks for a model only when a heuristic could not decide", async () => {
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: {
        ...goodIdeaFields,
        trafficTestNotes: `${goodIdeaFields.trafficTestNotes} It was a limited time offer.`,
      },
      fieldSpecs: IDEA.fieldSchema,
      probe: aliveProbe,
    });
    expect(run.ambiguous).toBe(true);
    expect(run.ambiguityNotes.join(" ")).toMatch(/spam heuristic/);
  });
});

describe("classifyWithModel", () => {
  const unambiguous = () =>
    runPreflight({
      checkpointKey: "idea",
      fields: goodIdeaFields,
      fieldSpecs: IDEA.fieldSchema,
      probe: aliveProbe,
    });

  it("does not call the model when the heuristics decided", async () => {
    const call = vi.fn();
    const out = await classifyWithModel(await unambiguous(), {
      checkpointKey: "idea",
      call,
    });
    expect(call).not.toHaveBeenCalled();
    expect(out.isSpam).toBe(false);
  });

  it("merges the model's answer when it is asked", async () => {
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: { ...goodIdeaFields, oneLiner: `${goodIdeaFields.oneLiner} Limited time offer.` },
      fieldSpecs: IDEA.fieldSchema,
      probe: aliveProbe,
    });
    const call = vi.fn(async () => ({ isBlank: false, isSpam: true, note: "an advert" }));
    const out = await classifyWithModel(run, { checkpointKey: "idea", call });
    expect(call).toHaveBeenCalledTimes(1);
    expect(out.isSpam).toBe(true);
    expect(out.notes.join(" ")).toContain("an advert");
  });

  it("never lets the model talk the heuristics out of a finding", async () => {
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: { productName: "x", oneLiner: "tbd", jobStory: "Limited time offer.", trafficTestNotes: "-" },
      fieldSpecs: IDEA.fieldSchema,
      probe: aliveProbe,
    });
    const out = await classifyWithModel(run, {
      checkpointKey: "idea",
      call: async () => ({ isBlank: false, isSpam: false, note: "looks fine to me" }),
    });
    expect(out.isBlank).toBe(true);
  });

  it("degrades to the heuristics when the call fails", async () => {
    const run = await runPreflight({
      checkpointKey: "idea",
      fields: { ...goodIdeaFields, oneLiner: `${goodIdeaFields.oneLiner} Limited time offer.` },
      fieldSpecs: IDEA.fieldSchema,
      probe: aliveProbe,
    });
    const out = await classifyWithModel(run, {
      checkpointKey: "idea",
      call: async () => {
        throw new Error("502 from the provider");
      },
    });
    expect(out.isSpam).toBe(false);
    expect(out.notes.join(" ")).toMatch(/classifier unavailable/);
  });
});
