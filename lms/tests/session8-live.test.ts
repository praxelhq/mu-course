import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("Session 8 live launch contract", () => {
  it("keeps the answer key out of the student client", async () => {
    const source = await readFile(path.join(ROOT, "app/(student)/tools/rag/rag-lab-controls.tsx"), "utf8");
    expect(source).not.toContain("₹4,999/month; yes; no");
    expect(source).not.toContain("Reveal answer gate");
  });

  it("loads the Kodo SupportFlow lab before the PraxelPay challenge", async () => {
    const page = await readFile(path.join(ROOT, "app/(student)/tools/rag/page.tsx"), "utf8");
    expect(page).toContain("SupportFlowRagLab");
    expect(page).toContain("Kōdō Academy");
    expect(page.indexOf("<SupportFlowRagLab />")).toBeLessThan(
      page.indexOf("Open real embedding simulator"),
    );
  });

  it("uses valid instructor asset endpoints in the projector deck", async () => {
    const deck = await readFile(path.join(ROOT, "course/session-08/session-08-rag-mcp-instructor.html"), "utf8");
    for (const asset of ["blueprint", "mcp-test-cases", "package-guide", "source-ledger"]) {
      expect(deck).toContain(`/api/instructor/session-8/assets/${asset}`);
    }
    expect(deck).not.toMatch(/href="(?:make|fixtures)\//);
    const minutes = [...deck.matchAll(/data-minutes="(\d+)"/g)].map((match) => Number(match[1]));
    expect(minutes).toHaveLength(18);
    expect(minutes.reduce((total, value) => total + value, 0)).toBe(120);
    expect(deck).toContain('<span class="count" id="count">01 / 18</span>');
  });

  it("ships every referenced authored asset", async () => {
    for (const file of [
      "make/praxelpay-safe-lead-tool.blueprint.json",
      "fixtures/mcp-tool-test-cases.json",
      "README.md",
      "source-ledger.md",
      "knowledge/praxelpay-current-policy.txt",
      "knowledge/praxelpay-outdated-policy.txt",
      "knowledge/praxelpay-untrusted-note.txt",
    ]) {
      await expect(readFile(path.join(ROOT, "course/session-08", file))).resolves.toBeInstanceOf(Buffer);
    }
  });

  it("keeps public learner evidence identical to the authored pack", async () => {
    for (const file of [
      "praxelpay-current-policy.txt",
      "praxelpay-outdated-policy.txt",
      "praxelpay-untrusted-note.txt",
    ]) {
      const [authored, learner] = await Promise.all([
        readFile(path.join(ROOT, "course/session-08/knowledge", file), "utf8"),
        readFile(path.join(ROOT, "public/session-8/knowledge", file), "utf8"),
      ]);
      expect(learner).toBe(authored);
    }
  });

  it("packages the authored pack in production and staging images", async () => {
    for (const dockerfile of ["Dockerfile.web", "Dockerfile.staging"]) {
      const source = await readFile(path.join(ROOT, dockerfile), "utf8");
      expect(source).toContain("COPY --from=build /app/course/session-08 ./course/session-08");
    }
  });
});
