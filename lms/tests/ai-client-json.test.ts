import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/ai/client";

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
