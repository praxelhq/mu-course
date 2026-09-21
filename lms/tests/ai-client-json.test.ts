import { describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create: sdk.create }; },
}));
import { anthropicModelClient, extractJsonObject } from "@/lib/ai/client";

it("sends the latest student request after historical user and assistant turns", async () => {
  sdk.create.mockResolvedValue({ content: [{ type: "text", text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } });
  const history = [
    { role: "user" as const, content: "A compliance calendar" },
    { role: "assistant" as const, content: "Verify data access" },
  ];
  await anthropicModelClient("fixture").complete({
    system: "Coach", user: "I choose Chatnama instead.", history,
    model: "claude-haiku-4-5-20251001", maxTokens: 100, temperature: 0.2,
  });
  expect(sdk.create.mock.lastCall![0].messages).toEqual([
    ...history, { role: "user", content: [{ type: "text", text: "I choose Chatnama instead." }] },
  ]);
});

describe("extractJsonObject", () => {
  it("parses a clean object, fences and all", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers an object whose string field carries a real newline", () => {
    // What a vision transcription actually returns: line breaks left unescaped
    // inside the string, which JSON.parse rejects outright.
    const raw = '{"transcript": "Layer one: Suppliers\nLayer two: OEMs"}';
    expect(extractJsonObject(raw)).toEqual({
      transcript: "Layer one: Suppliers\nLayer two: OEMs",
    });
  });

  it("leaves already-escaped content and structural whitespace alone", () => {
    const raw = '{\n  "a": "one\\ntwo",\n  "b": 2\n}';
    expect(extractJsonObject(raw)).toEqual({ a: "one\ntwo", b: 2 });
  });

  it("still throws on genuinely malformed JSON", () => {
    expect(() => extractJsonObject('{"a": }')).toThrow();
    expect(() => extractJsonObject("no object here")).toThrow();
  });
});
