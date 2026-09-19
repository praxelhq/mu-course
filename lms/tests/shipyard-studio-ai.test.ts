import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import sharp from "sharp";
const fake = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  anthropicModelClient: () => ({ complete: fake.complete }),
}));
import { callStudio } from "@/lib/ai/studio";
afterEach(() => {
  vi.unstubAllEnvs();
  fake.complete.mockReset();
});
describe("Shipyard direct Claude boundary", () => {
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
