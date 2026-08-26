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
    expect(keywordOnly[4].title).toBe("Automation Rules");
  });

  it("removes common words before stemming so they cannot create false matches", () => {
    const chunks = chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, "semantic", 320);
    const results = retrieveSupportFlowChunks(chunks, "does this", { topK: 3, hybridSearch: false });

    expect(results.every((result) => result.score === 0)).toBe(true);
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
});
