import { describe, expect, it } from "vitest";
import { canonicalJson, sha256CanonicalJson } from "../lib/canonical-json";
import { sha256Json } from "../lib/assessments/s4-app-policy";
import { canonicalJsonHash } from "../scripts/load/private-course-data";

describe("canonical JSON contract", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }, 6] })).toBe(
      '{"a":{"b":3,"y":2},"list":[{"c":5,"d":4},6],"z":1}',
    );
  });

  it("uses one hash implementation across assessment and release contracts", () => {
    const value = { release: "v1", nested: { answer: 42 } };
    expect(sha256Json(value)).toBe(sha256CanonicalJson(value));
    expect(canonicalJsonHash(value)).toBe(sha256CanonicalJson(value));
  });
});
