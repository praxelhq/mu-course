import { describe, expect, it } from "vitest";
import {
  DeadlineOrderError,
  assertDeadlineOrder,
  assertWindowCloseOrder,
  graceCutoff,
  shownDeadline,
  shownWindowClose,
  windowGraceClose,
} from "@/lib/deadlines";

const soft = new Date("2026-09-10T18:29:00Z");
const hard = new Date("2026-09-15T18:29:00Z");

describe("deadlines", () => {
  it("shows the soft date when one is set and the hard date otherwise", () => {
    expect(shownDeadline({ dueAt: hard, displayDueAt: soft })).toEqual(soft);
    expect(shownDeadline({ dueAt: hard, displayDueAt: null })).toEqual(hard);
    expect(shownDeadline({ dueAt: null, displayDueAt: null })).toBeNull();
  });

  it("offers the hard cutoff to staff only when the two dates actually differ", () => {
    expect(graceCutoff({ dueAt: hard, displayDueAt: soft })).toEqual(hard);
    // Same instant: there is no grace window worth naming.
    expect(graceCutoff({ dueAt: hard, displayDueAt: new Date(hard) })).toBeNull();
    expect(graceCutoff({ dueAt: hard, displayDueAt: null })).toBeNull();
  });

  it("refuses a shown date that outlives the cutoff it is meant to precede", () => {
    expect(() => assertDeadlineOrder({ dueAt: hard, displayDueAt: soft })).not.toThrow();
    expect(() => assertDeadlineOrder({ dueAt: soft, displayDueAt: hard })).toThrow(DeadlineOrderError);
    expect(() => assertDeadlineOrder({ dueAt: null, displayDueAt: soft })).toThrow(DeadlineOrderError);
    expect(() => assertDeadlineOrder({ dueAt: null, displayDueAt: null })).not.toThrow();
  });
});

describe("interview window close", () => {
  it("shows the soft close while the hard one keeps gating", () => {
    expect(shownWindowClose({ closesAt: hard, displayClosesAt: soft })).toEqual(soft);
    // No soft date set: the learner sees the real one, which is the state
    // every window is in until someone deliberately publishes an earlier date.
    expect(shownWindowClose({ closesAt: hard, displayClosesAt: null })).toEqual(hard);
  });

  it("gives staff the real close only when it differs", () => {
    expect(windowGraceClose({ closesAt: hard, displayClosesAt: soft })).toEqual(hard);
    expect(windowGraceClose({ closesAt: hard, displayClosesAt: null })).toBeNull();
    expect(windowGraceClose({ closesAt: hard, displayClosesAt: new Date(hard) })).toBeNull();
  });

  it("refuses a shown close later than the one enforced", () => {
    expect(() => assertWindowCloseOrder({ closesAt: hard, displayClosesAt: soft })).not.toThrow();
    expect(() => assertWindowCloseOrder({ closesAt: soft, displayClosesAt: hard })).toThrow(
      DeadlineOrderError,
    );
  });
});
