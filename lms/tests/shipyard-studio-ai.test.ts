import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import sharp from "sharp";
const fake = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  anthropicModelClient: () => ({ complete: fake.complete }),
}));
import { callStudio } from "@/lib/ai/studio";
import { coachConversation } from "@/lib/shipyard/studio/coach-context";
afterEach(() => {
  vi.unstubAllEnvs();
  fake.complete.mockReset();
});
describe("Shipyard direct Claude boundary", () => {
  it("places the saved draft before the discussion and keeps the follow-up last", () => {
    const history = [
      { role: "user" as const, content: "I choose Chatnama instead." },
      { role: "assistant" as const, content: "Start with local WhatsApp parsing." },
    ];
    const turns = coachConversation({ idea: { title: "Neartrust" } }, history, "Which APIs do I need?");
    expect(turns.history[0].content).toContain("Neartrust");
    expect(turns.history.slice(1)).toEqual(history);
    expect(JSON.parse(turns.currentMessage.text)).toEqual({ currentStudentMessage: "Which APIs do I need?" });
  });
  it("keeps previous turns separate from the latest idea switch, including on JSON retry", async () => {
    vi.stubEnv("SHIPYARD_ANTHROPIC_API_KEY", "test-only");
    fake.complete
      .mockResolvedValueOnce({ text: "invalid", usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ text: '{"ok":true}', usage: { inputTokens: 1, outputTokens: 1 } });
    const history = [
      { role: "user" as const, content: "Review my compliance calendar." },
      { role: "assistant" as const, content: "Check deadline data access first." },
    ];
    await callStudio({
      task: "verdict", system: "test", history,
      user: "New idea: Chatnama. Review this WhatsApp story tool instead.",
      schema: z.object({ ok: z.boolean() }),
    });
    for (const [args] of fake.complete.mock.calls) {
      expect(args.history).toEqual(history);
      expect(args.user).toContain("New idea: Chatnama");
      expect(args.user).not.toContain("compliance calendar");
    }
  });
  it("fails closed without the dedicated key even if a shared key exists", async () => {
    vi.stubEnv("SHIPYARD_ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "unrelated-course-key");
    await expect(
      callStudio({
        task: "verdict",
        system: "test",
        user: "test",
        schema: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toThrow("temporarily unavailable");
    expect(fake.complete).not.toHaveBeenCalled();
  });
  it("uses Haiku, resizes large screenshots, validates JSON and accounts for retry usage", async () => {
    vi.stubEnv("SHIPYARD_ANTHROPIC_API_KEY", "test-only");
    fake.complete
      .mockResolvedValueOnce({
        text: '{"ok":"invalid"}',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        text: '{"ok":true}',
        usage: { inputTokens: 20, outputTokens: 10 },
      });
    const png = await sharp({
      create: { width: 2400, height: 4000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const result = await callStudio({
      task: "verdict",
      system: "test",
      user: [
        { type: "text", text: "Inspect this design" },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
        },
      ],
      schema: z.object({ ok: z.boolean() }),
    });
    expect(result.modelUsed).toBe("claude-haiku-4-5-20251001");
    expect(result.data.ok).toBe(true);
    expect(result.tokensIn).toBe(30);
    expect(result.costUsd).toBe(0.000105);
    const args = fake.complete.mock.calls[0][0];
    const metadata = await sharp(
      Buffer.from(args.images[0].dataBase64, "base64"),
    ).metadata();
    expect(metadata.height).toBeLessThanOrEqual(1568);
    expect(args.images[0].mediaType).toBe("image/jpeg");
  });
  it("does not fetch arbitrary model image URLs", async () => {
    vi.stubEnv("SHIPYARD_ANTHROPIC_API_KEY", "test-only");
    await expect(
      callStudio({
        task: "verdict",
        system: "test",
        user: [
          { type: "image_url", image_url: { url: "http://127.0.0.1/private" } },
        ],
        schema: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toThrow("verified inline");
    expect(fake.complete).not.toHaveBeenCalled();
  });
});
