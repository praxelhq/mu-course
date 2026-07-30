import { describe, expect, it } from "vitest";
import { gateSnapshotVersion } from "../lib/gates";

describe("gate polling version", () => {
  it("changes when a submission grant is created, extended, or consumed", () => {
    const rows = [
      { targetType: "assignment" as const, targetId: "a1", sectionId: "s1", state: "open" as const },
    ];
    const base = {
      id: "g1",
      assignmentId: "a1",
      ownerKind: "individual" as const,
      ownerId: "u1",
      kind: "improvement" as const,
      targetVersion: 2,
      targetAttempt: 1,
      expiresAt: new Date("2026-08-09T12:00:00Z"),
      consumedAt: null,
      extendedAt: null,
    };

    const noGrant = gateSnapshotVersion(rows, []);
    const granted = gateSnapshotVersion(rows, [base]);
    const extended = gateSnapshotVersion(rows, [
      { ...base, expiresAt: new Date("2026-08-12T12:00:00Z"), extendedAt: new Date("2026-08-01") },
    ]);
    const consumed = gateSnapshotVersion(rows, [
      { ...base, consumedAt: new Date("2026-08-02T12:00:00Z") },
    ]);

    expect(new Set([noGrant, granted, extended, consumed]).size).toBe(4);
  });
});
