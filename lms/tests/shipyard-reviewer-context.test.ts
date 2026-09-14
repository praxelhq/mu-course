// assembleReviewContext is the one place the pieces meet, so this file mostly
// asserts the joins: extraction feeds anonymisation, anonymisation feeds the
// prompt, images are capped and labelled, and nothing identifying survives the
// trip.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkpointDefinition } from "@/lib/shipyard/checkpoints";
import { emptySignals } from "@/lib/tracker/types";
import {
  assembleReviewContext,
  IMAGE_BYTE_CAP,
  MAX_IMAGES,
  toDataUrl,
  type ContextCheckpoint,
} from "@/lib/shipyard/reviewer/context";

const FIXTURES = resolve(__dirname, "..", "fixtures", "shipyard-reviewer");
const SKETCH = readFileSync(resolve(FIXTURES, "images", "sketch-flow-legible.png"));

function checkpoint(key: "idea" | "design" | "working" | "money"): ContextCheckpoint {
  const def = checkpointDefinition(key);
  return {
    key: def.key,
    title: def.title,
    barMarkdown: def.barMarkdown,
    rubric: def.rubric,
    acceptsImages: def.acceptsImages,
    fieldSchema: def.fieldSchema,
  };
}

const STUDENT = {
  name: "Ananya Raghunathan",
  email: "ananya.raghunathan@mastersunion.org",
  sectionCode: "C",
};

const userText = (ctx: Awaited<ReturnType<typeof assembleReviewContext>>) => {
  const part = ctx.prompt.user[0];
  return part.type === "text" ? part.text : "";
};

describe("assembleReviewContext", () => {
  it("builds a prompt with the bar in the system half and the answers in the user half", async () => {
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("design"),
      submission: {
        fields: { flowNotes: "Screen 1 is the landing page; screen 2 picks a plan.", sketches: [] },
        files: [],
      },
      fetchFile: async () => Buffer.alloc(0),
      attempt: 1,
    });
    expect(ctx.prompt.system).toContain(checkpointDefinition("design").barMarkdown);
    expect(userText(ctx)).toContain("Screen 1 is the landing page");
    expect(ctx.imageCount).toBe(0);
    expect(ctx.redactions).toBe(0);
  });

  it("strips the student out of every field, the product and the extracted text", async () => {
    const pdf = "Wireframes by Ananya Raghunathan, Section C — ananya.raghunathan@mastersunion.org";
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("design"),
      submission: {
        fields: { flowNotes: "Drawn by Ananya over the weekend. Call me on 98765 43210." },
        files: [{ key: "uploads/notes.txt", contentType: "text/plain", bytes: pdf.length }],
      },
      product: { name: "Ananya's DabbaRoute", oneLiner: "By Ananya Raghunathan" },
      student: STUDENT,
      fetchFile: async () => Buffer.from(pdf, "utf8"),
      attempt: 1,
    });
    const text = userText(ctx);
    expect(text).not.toMatch(/Ananya|Raghunathan|mastersunion|98765/i);
    expect(ctx.redactions).toBeGreaterThan(3);
    expect(ctx.preflight.extractedText).not.toMatch(/Ananya/i);
  });

  it("pulls text out of an attachment and hands the same text to pre-flight", async () => {
    const body = "The launch ran from 1 September to 6 September across three channels.";
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("idea"),
      submission: {
        fields: { productName: "DabbaRoute" },
        files: [{ key: "uploads/notes.txt", contentType: "text/plain", bytes: body.length }],
      },
      fetchFile: async () => Buffer.from(body, "utf8"),
      attempt: 1,
    });
    expect(ctx.preflight.extractedText).toContain(body);
    expect(userText(ctx)).toContain("<extracted_text_from_attachments>");
  });

  it("sends images as data URIs, in order, with labels", async () => {
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("design"),
      submission: {
        fields: { flowNotes: "…" },
        files: [
          { key: "uploads/s1.png", contentType: "image/png", bytes: SKETCH.length },
          { key: "uploads/s2.png", contentType: "image/png", bytes: SKETCH.length },
        ],
      },
      fetchFile: async () => SKETCH,
      attempt: 1,
    });
    expect(ctx.imageCount).toBe(2);
    const images = ctx.prompt.user.filter((p) => p.type === "image_url");
    expect(images).toHaveLength(2);
    expect(images[0].type === "image_url" && images[0].image_url.url).toBe(
      toDataUrl(SKETCH, "image/png"),
    );
    expect(userText(ctx)).toContain("image 1 of 2 (s1.png); image 2 of 2 (s2.png)");
  });

  it("caps at five images and says how many were left out", async () => {
    const files = Array.from({ length: 9 }, (_, i) => ({
      key: `uploads/s${i}.png`,
      contentType: "image/png",
      bytes: SKETCH.length,
    }));
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("design"),
      submission: { fields: { flowNotes: "…" }, files },
      fetchFile: async () => SKETCH,
      attempt: 1,
    });
    expect(ctx.imageCount).toBe(MAX_IMAGES);
    expect(ctx.preflight.notes.join(" ")).toMatch(/4 further images were not sent/);
  });

  it("sends no images at all on a checkpoint that does not accept them", async () => {
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("money"),
      submission: {
        fields: { pricingNote: "₹299 per kitchen per month.", checkoutUrl: "https://x.example.com" },
        files: [{ key: "uploads/s1.png", contentType: "image/png", bytes: SKETCH.length }],
      },
      fetchFile: async () => SKETCH,
      attempt: 1,
    });
    expect(ctx.imageCount).toBe(0);
  });

  it("tells the student to re-upload a HEIC rather than failing", async () => {
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("design"),
      submission: {
        fields: { flowNotes: "…" },
        files: [{ key: "uploads/IMG_4021.HEIC", contentType: "image/heic", bytes: 900_000 }],
      },
      fetchFile: async () => {
        throw new Error("should not be read");
      },
      attempt: 1,
    });
    expect(ctx.imageCount).toBe(0);
    expect(ctx.preflight.notes.join(" ")).toMatch(/HEIC is not supported/);
  });

  it("skips an oversized image loudly rather than sending it", async () => {
    const huge = Buffer.alloc(IMAGE_BYTE_CAP + 1);
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("design"),
      submission: {
        fields: { flowNotes: "…" },
        files: [{ key: "uploads/big.png", contentType: "image/png", bytes: huge.length }],
      },
      fetchFile: async () => huge,
      attempt: 1,
    });
    // Without sharp installed this must skip, not throw, and must say why.
    if (ctx.imageCount === 0) {
      expect(ctx.preflight.notes.join(" ")).toMatch(/over the 1\.5MB cap/);
      expect(ctx.preflight.notes.join(" ")).toMatch(/do not hold its absence against the student/);
    } else {
      expect(ctx.imageCount).toBe(1);
    }
  });

  it("survives a file it cannot read", async () => {
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("design"),
      submission: {
        fields: { flowNotes: "…" },
        files: [{ key: "uploads/gone.png", contentType: "image/png", bytes: 10 }],
      },
      fetchFile: async () => {
        throw new Error("NoSuchKey");
      },
      attempt: 1,
    });
    expect(ctx.imageCount).toBe(0);
    expect(ctx.preflight.notes.join(" ")).toMatch(/NoSuchKey/);
  });

  it("puts the render screenshot first on the working checkpoint", async () => {
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("working"),
      submission: {
        fields: { liveUrl: "https://dabbaroute.vercel.app", corePath: "…", knownGaps: "…" },
        files: [{ key: "uploads/extra.png", contentType: "image/png", bytes: SKETCH.length }],
      },
      render: {
        domText: "Plan tomorrow's route. Add a kitchen. Import today's list.",
        screenshotNote: "a full-page capture of the dashboard",
        screenshotPng: SKETCH,
      },
      fetchFile: async () => SKETCH,
      attempt: 1,
    });
    expect(ctx.imageCount).toBe(2);
    expect(userText(ctx)).toContain("the rendered screenshot of the live product");
    expect(userText(ctx)).toContain("<headless_render>");
  });

  it("passes the attempt, the previous reasons and the tracker signals through", async () => {
    const ctx = await assembleReviewContext({
      checkpoint: checkpoint("money"),
      submission: {
        fields: { pricingNote: "₹299 a month.", checkoutUrl: "https://x.example.com" },
        files: [],
      },
      signals: { ...emptySignals(new Date("2026-09-15")), paymentsLive: true, grossTotal: 1500 },
      attempt: 3,
      previousReasons: [{ criterion: "price-reasoned", met: false, note: "cost-plus only" }],
      fetchFile: async () => Buffer.alloc(0),
    });
    const text = userText(ctx);
    expect(text).toContain("This is attempt 3");
    expect(text).toContain("price-reasoned: cost-plus only");
    expect(text).toContain("payments live: yes");
    expect(text).toContain("gross payments: 15.00 USD");
  });

  it("never reads a file it was not given", async () => {
    const fetchFile = vi.fn(async () => Buffer.alloc(0));
    await assembleReviewContext({
      checkpoint: checkpoint("money"),
      submission: { fields: { pricingNote: "₹299." }, files: [] },
      fetchFile,
      attempt: 1,
    });
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
