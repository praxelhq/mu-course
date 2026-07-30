import { describe, expect, it } from "vitest";
import {
  draftOwnerClausesForUser,
  userCanAccessDraft,
} from "../lib/submission-drafts";

describe("submission draft authorization", () => {
  it("denies a former team creator after they move to another team", () => {
    expect(
      userCanAccessDraft(
        { id: "creator-user", teamId: "team-new" },
        { ownerKind: "team", ownerId: "team-old" },
      ),
    ).toBe(false);
  });

  it("allows a current team member without relying on the creator identity", () => {
    expect(
      userCanAccessDraft(
        { id: "current-teammate", teamId: "team-old" },
        { ownerKind: "team", ownerId: "team-old" },
      ),
    ).toBe(true);
  });

  it("requires the canonical individual owner id", () => {
    expect(
      userCanAccessDraft(
        { id: "individual-owner", teamId: null },
        { ownerKind: "individual", ownerId: "individual-owner" },
      ),
    ).toBe(true);
    expect(
      userCanAccessDraft(
        { id: "former-creator", teamId: null },
        { ownerKind: "individual", ownerId: "different-user" },
      ),
    ).toBe(false);
  });

  it("fails closed for drafts without canonical ownership", () => {
    expect(
      userCanAccessDraft(
        { id: "creator-user", teamId: "team-old" },
        { ownerKind: null, ownerId: null },
      ),
    ).toBe(false);
  });

  it("builds implicit lookup clauses only from current canonical ownership", () => {
    const clauses = draftOwnerClausesForUser({
      id: "creator-user",
      teamId: "team-new",
    });

    expect(clauses).toEqual([
      { ownerKind: "individual", ownerId: "creator-user" },
      { ownerKind: "team", ownerId: "team-new" },
    ]);
    expect(clauses).not.toContainEqual({ ownerKind: "team", ownerId: "team-old" });
    expect(clauses.every((clause) => !("userId" in clause))).toBe(true);
  });

  it("does not invent a team lookup for a user without current membership", () => {
    expect(draftOwnerClausesForUser({ id: "learner", teamId: null })).toEqual([
      { ownerKind: "individual", ownerId: "learner" },
    ]);
  });
});
