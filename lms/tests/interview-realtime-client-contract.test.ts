import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../app/(room)/interview/live/interview-client.tsx", import.meta.url),
  "utf8",
);

describe("realtime interview client contract", () => {
  it("reconnects a disrupted room instead of downgrading a graded interview to a recorder", () => {
    expect(source).toContain('setMode("reconnecting")');
    expect(source).toContain("void requestRealtime(true)");
    expect(source).not.toContain('setMode("turnbased")');
    expect(source).not.toContain("<TurnBasedRoom");
  });
});
