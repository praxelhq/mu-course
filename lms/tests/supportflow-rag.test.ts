import { describe, expect, it } from "vitest";
import {
  SUPPORTFLOW_ARTICLES,
  chunkSupportFlowArticles,
  groundedSupportFlowDraft,
  retrieveSupportFlowChunks,
} from "@/lib/supportflow-rag";

describe("SupportFlow classroom retrieval engine", () => {
  it("makes chunking strategy an observable product decision", () => {
    const fixed = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "fixed", 220);
    const paragraph = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "paragraph", 220);
    const semantic = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 220);

    expect(new Set([fixed.length, paragraph.length, semantic.length]).size).toBeGreaterThan(1);
    expect(semantic.some((chunk) => chunk.heading === "Human review boundary")).toBe(true);
    expect(fixed.every((chunk) => chunk.text.length <= 220)).toBe(true);
  });

  it("returns the AI Suggestions evidence for a grounded support query", () => {
    const chunks = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    const results = retrieveSupportFlowChunks(chunks, "Can the assistant send a suggested reply automatically?", {
      topK: 3,
      hybridSearch: true,
    });

    expect(results).toHaveLength(3);
    expect(results[0].title).toBe("AI Suggestions");
    expect(results[0].text).toContain("never sent automatically");
  });

  it("honours Top-K and exposes concept-expanded evidence under hybrid search", () => {
    const semantic = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    const query = "How do I add live chat to my website and handle messages when nobody is online?";

    const narrow = retrieveSupportFlowChunks(semantic, query, { topK: 2, hybridSearch: false });
    const keywordOnly = retrieveSupportFlowChunks(semantic, query, { topK: 5, hybridSearch: false });
    const hybrid = retrieveSupportFlowChunks(semantic, query, { topK: 5, hybridSearch: true });

    expect(narrow).toHaveLength(2);
    expect(hybrid).toHaveLength(5);
    expect(hybrid[0].text).toContain("Offline messages automatically create tickets");
    expect(hybrid[0].score).toBeGreaterThan(keywordOnly[0].score);
    expect(hybrid[4].title).toBe("AI Suggestions");
    expect(hybrid[4].score).toBeGreaterThan(keywordOnly[4].score);
  });

  it("removes common words before stemming so they cannot create false matches", () => {
    const chunks = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    const results = retrieveSupportFlowChunks(chunks, "does this", { topK: 3, hybridSearch: false });

    expect(results).toEqual([]);
  });

  it("refuses weak evidence and cites at most two useful passages", () => {
    const chunks = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    const query = "Can the assistant send a suggested reply automatically?";
    const results = retrieveSupportFlowChunks(chunks, query, { topK: 5, hybridSearch: true });

    expect(groundedSupportFlowDraft("unknown policy", [])).toContain("could not find enough SupportFlow evidence");
    const draft = groundedSupportFlowDraft(query, results);
    expect(draft).toContain("[AI Suggestions · Human review boundary]");
    expect((draft.match(/\[[^\]]+\]/g) ?? [])).toHaveLength(2);
  });

  it("uses concepts to rank but refuses concept-only evidence", () => {
    const chunks = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    const query = "Is this powered by machine learning?";
    const results = retrieveSupportFlowChunks(chunks, query, { topK: 3, hybridSearch: true });

    expect(results[0].conceptScore).toBe(1);
    expect(results[0].keywordScore).toBe(0);
    expect(groundedSupportFlowDraft(query, results)).toContain("could not find enough SupportFlow evidence");
  });

  it("returns an empty evidence set when the corpus has no overlap", () => {
    const chunks = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    expect(retrieveSupportFlowChunks(chunks, "Where is the pricing page?", { topK: 3, hybridSearch: true })).toEqual([]);
  });

  it("matches related surface forms while displaying the words the learner typed", () => {
    const chunks = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    const results = retrieveSupportFlowChunks(chunks, "Can the assistant send a suggested reply automatically?", { topK: 3, hybridSearch: false });

    expect(results[0].title).toBe("AI Suggestions");
    expect(results[0].matchedTerms).toContain("suggested");
  });
});
