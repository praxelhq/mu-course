import { describe, expect, it } from "vitest";
import { chooseAppReviews, reviewSchema, wordCount, normalizeAppUrl, APP_REVIEW_RUBRIC } from "../lib/app-reviews/policy";
import { parseAppReviewCsv } from "../lib/app-reviews/import";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppReviews } from "../app/(student)/app-reviews/review-form";

const comment = "I tested the main search flow and the results loaded correctly. The small navigation labels need better contrast on mobile screens.";

describe("app review contract", () => {
  it("renders a clear blocked state instead of an inert assignment action", () => {
    const html = renderToStaticMarkup(createElement(AppReviews, { initial: { ready: true, open: true, required: 5, completed: 0, blocked: 1, reviews: [] } }));
    expect(html).toContain("Contact your instructor before requesting remaining apps.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Get my five apps<\/button>/u);
    expect(html).toContain("You must complete all 5 peer reviews to receive your own app grade.");
  });
  it("parses real Forms headers with quoted newlines without importing names or briefs", () => {
    const rows = parseAppReviewCsv('Timestamp,Name,Email ID:-,Section:-,"Hosted Web App Link:-\n(public URL)",Brief\nnow,Private Name,a@example.org,Section A,https://demo.lovable.app,"private\nbrief"\n');
    expect(rows).toEqual([{ email: "a@example.org", section: "Section A", appUrl: "https://demo.lovable.app", sourceRef: "artifacts-csv:record-2", recordNumber: 1 }]);
    expect(() => parseAppReviewCsv('email,section,appUrl\n"unclosed')).toThrow();
    expect(() => parseAppReviewCsv("name,link\nA,B")).toThrow();
    expect(parseAppReviewCsv("email,section,appUrl\n,,\na@example.org,A,https://demo.lovable.app")[0]).toMatchObject({ sourceRef: "artifacts-csv:record-3", recordNumber: 2 });
  });
  it("requires all three integer ratings and at least twenty actual words", () => {
    const body = { visual: 3, functionality: 4, overall: 5, comment };
    expect(reviewSchema.safeParse(body).success).toBe(true);
    for (const change of [{ visual: 0 }, { functionality: 6 }, { overall: 2.5 }, { comment: "word ".repeat(19) }, { comment: "! ".repeat(20) }, { overall: undefined }]) {
      expect(reviewSchema.safeParse({ ...body, ...change }).success).toBe(false);
    }
    expect(wordCount("  Good\nwork\twith   clear labels. ")).toBe(5);
    expect(reviewSchema.safeParse({ ...body, comment: "word ".repeat(20) }).success).toBe(true);
    expect(reviewSchema.parse({ ...body, comment: "word\u00a0".repeat(20) }).comment).toBe("word ".repeat(20).trim());
  });
  it("defines distinct 1, 3, 5 anchors for every dimension", () => {
    expect(APP_REVIEW_RUBRIC.map((r) => r.key)).toEqual(["visual", "functionality", "overall"]);
    for (const rubric of APP_REVIEW_RUBRIC) expect(Object.keys(rubric.anchors)).toEqual(["1", "3", "5"]);
  });
  it("accepts public HTTPS app hosts, not docs, credentials or private addresses", () => {
    expect(normalizeAppUrl("https://demo.lovable.app/?tracking=student")).toBe("https://demo.lovable.app/");
    expect(normalizeAppUrl("https://project.vercel.app/")).toBe("https://project.vercel.app/");
    expect(normalizeAppUrl("https://company.example.com/app")).toBe("https://company.example.com/app");
    for (const url of ["javascript:alert(1)", "https://docs.google.com/document/d/secret", "https://127.0.0.1", "https://localhost", "https://host.internal", "http://demo.lovable.app", "https://user:pass@demo.lovable.app", "https://demo.lovable.app:444", "https://demo.lovable.app/?token=private", "https://demo.lovable.app/#/dashboard", "https://demo.lovable.app/#token=private"]) {
      expect(() => normalizeAppUrl(url)).toThrow();
    }
  });
  it("assigns five distinct other authors and URLs in the same section, least-loaded first", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, authorId: `u${i}`, sectionId: "A", appUrl: `https://app${i}.lovable.app/`, load: i }));
    const choices = chooseAppReviews(entries, { userId: "u0", sectionId: "A" }, []);
    expect(choices.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(chooseAppReviews(entries, { userId: "u0", sectionId: "B" }, [])).toEqual([]);
    expect(chooseAppReviews(entries.slice(0, 5), { userId: "u0", sectionId: "A" }, [])).toHaveLength(4);
    expect(chooseAppReviews(entries, { userId: "u0", sectionId: "A" }, [entries[1]]).map((e) => e.id)).toEqual(["e2", "e3", "e4", "e5"]);
    const duplicate = { ...entries[1], id: "dup", authorId: "other", appUrl: entries[0].appUrl };
    expect(chooseAppReviews([duplicate, ...entries], { userId: "u0", sectionId: "A" }, []).map((e) => e.id)).not.toContain("dup");
  });
});
