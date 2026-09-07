import { describe, expect, it, vi } from "vitest";
import { DpdpErasureError, type DpdpErasureResult } from "../lib/dpdp-erasure";
import { performDpdpDelete } from "../app/api/admin/dpdp/delete/route";

const result: DpdpErasureResult = {
  receiptId: "receipt-user-1",
  alreadyCompleted: false,
  clerkUserId: "clerk-user-1",
  deleted: {
    appeals: 0,
    gradeHolds: 0,
    publicationDecisions: 0,
    workflowSelections: 0,
    workflowNominations: 0,
    galleryItems: 0,
    votes: 0,
    assessmentResults: 0,
    resubmissionGrants: 0,
    evidence: 0,
    uploadReservations: 0,
    generatedObjectReservations: 0,
    grades: 0,
    submissions: 0,
    reassignedTeamSubmissions: 0,
    interviewTurns: 0,
    interviews: 0,
    interviewRetakes: 0,
    interviewPrerequisites: 0,
    quizAttempts: 0,
    dataRaceResponses: 0,
    peerReviews: 0,
    portfolio: 0,
    notifications: 0,
    gateExceptions: 0,
    userVotes: 0,
    user: 1,
  },
};

describe("DPDP deletion route side-effect ordering", () => {
  it("does not flag Clerk when authorization or erasure fails", async () => {
    const erase = vi.fn(async () => {
      throw new DpdpErasureError(
        "retention-hold-active",
        409,
        "An active retention hold blocks erasure",
      );
    });
    const flagClerk = vi.fn(async () => undefined);

    await expect(
      performDpdpDelete(
        {
          userId: "user-1",
          confirmEmail: "student@example.test",
          requestedBy: "admin-1",
        },
        { erase, flagClerk },
      ),
    ).rejects.toMatchObject({ code: "retention-hold-active" });

    expect(flagClerk).not.toHaveBeenCalled();
  });

  it("flags Clerk before verified database cleanup completes", async () => {
    const order: string[] = [];
    const erase = vi.fn(async (_input, options) => {
      await options.beforeDatabaseCleanup({
        parentReceiptId: result.receiptId,
        clerkUserId: result.clerkUserId!,
      });
      order.push("erasure-complete");
      return result;
    });
    const flagClerk = vi.fn(async () => {
      order.push("clerk-flagged");
    });

    const completed = await performDpdpDelete(
      {
        userId: "user-1",
        confirmEmail: "student@example.test",
        requestedBy: "admin-1",
      },
      { erase, flagClerk },
    );

    expect(completed).toBe(result);
    expect(order).toEqual(["clerk-flagged", "erasure-complete"]);
    expect(flagClerk).toHaveBeenCalledWith(
      "clerk-user-1",
      expect.objectContaining({
        privateMetadata: expect.objectContaining({ flaggedForDeletion: true }),
      }),
    );
  });

  it("flags every Clerk identity attached to the canonical LMS user", async () => {
    const erase = vi.fn(async (_input, options) => {
      await options.beforeDatabaseCleanup({
        parentReceiptId: result.receiptId,
        clerkUserId: result.clerkUserId!,
      });
      return result;
    });
    const flagClerk = vi.fn(async () => undefined);
    const getClerkUserIds = vi.fn(async () => ["clerk-user-1", "clerk-user-2"]);

    await performDpdpDelete(
      {
        userId: "user-1",
        confirmEmail: "student@example.test",
        requestedBy: "admin-1",
      },
      { erase, flagClerk, getClerkUserIds },
    );

    expect(flagClerk).toHaveBeenCalledTimes(2);
    expect(flagClerk).toHaveBeenCalledWith("clerk-user-1", expect.any(Object));
    expect(flagClerk).toHaveBeenCalledWith("clerk-user-2", expect.any(Object));
  });

  it("fails closed before local cleanup when Clerk cannot be fenced", async () => {
    let localCleanupRan = false;
    const erase = vi.fn(async (_input, options) => {
      await options.beforeDatabaseCleanup({
        parentReceiptId: result.receiptId,
        clerkUserId: result.clerkUserId!,
      });
      localCleanupRan = true;
      return result;
    });
    const flagClerk = vi.fn(async () => {
      throw new Error("Clerk unavailable");
    });

    await expect(
      performDpdpDelete(
        {
          userId: "user-1",
          confirmEmail: "student@example.test",
          requestedBy: "admin-1",
        },
        { erase, flagClerk },
      ),
    ).rejects.toThrow("Clerk unavailable");

    expect(localCleanupRan).toBe(false);
  });
});
