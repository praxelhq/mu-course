import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  assignmentFindUnique: vi.fn(),
  submissionFindUnique: vi.fn(),
  submissionFindFirst: vi.fn(),
  submissionCreate: vi.fn(),
  submissionUpdateMany: vi.fn(),
  evidenceFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: db.userFindUnique },
    assignment: { findUnique: db.assignmentFindUnique },
    submission: {
      findUnique: db.submissionFindUnique,
      findFirst: db.submissionFindFirst,
      create: db.submissionCreate,
      updateMany: db.submissionUpdateMany,
    },
    submissionEvidence: { findMany: db.evidenceFindMany },
  },
}));

vi.mock("@/lib/gates", () => ({
  parentSessionPageIdFor: vi.fn(async () => "session-page"),
  resolveGate: vi.fn(async () => true),
}));

import {
  DraftAccessError,
  loadSubmissionDraft,
  saveSubmissionDraft,
} from "../lib/submission-drafts";

const formerTeamDraft = {
  id: "draft-old-team",
  assignmentId: "assignment-team",
  userId: "creator-user",
  ownerKind: "team",
  ownerId: "team-old",
  status: "draft",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.userFindUnique.mockResolvedValue({
    id: "creator-user",
    role: "student",
    sectionId: "section-a",
    teamId: "team-new",
  });
  db.assignmentFindUnique.mockResolvedValue({
    id: "assignment-team",
    contractMode: "legacy",
    assignmentType: {
      teamBased: true,
      submissionSchema: { fields: [] },
    },
    activeAssessmentVersion: null,
  });
  db.submissionFindUnique.mockResolvedValue(formerTeamDraft);
  db.submissionFindFirst.mockResolvedValue(null);
  db.evidenceFindMany.mockResolvedValue([]);
});

describe("submission draft access service", () => {
  it("does not include creator userId when resuming a draft implicitly", async () => {
    await expect(
      loadSubmissionDraft({
        userId: "creator-user",
        assignmentId: "assignment-team",
      }),
    ).resolves.toBeNull();

    expect(db.submissionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assignmentId: "assignment-team",
          status: "draft",
          OR: [
            { ownerKind: "individual", ownerId: "creator-user" },
            { ownerKind: "team", ownerId: "team-new" },
          ],
        },
      }),
    );
  });

  it("fails closed if an implicit lookup ever returns a non-owned draft", async () => {
    db.submissionFindFirst.mockResolvedValue(formerTeamDraft);

    await expect(
      loadSubmissionDraft({
        userId: "creator-user",
        assignmentId: "assignment-team",
      }),
    ).rejects.toBeInstanceOf(DraftAccessError);
    expect(db.evidenceFindMany).not.toHaveBeenCalled();
  });

  it("blocks writes to an explicit former-team draft before mutation", async () => {
    await expect(
      saveSubmissionDraft({
        userId: "creator-user",
        assignmentId: "assignment-team",
        draftId: "draft-old-team",
        fields: {},
      }),
    ).rejects.toBeInstanceOf(DraftAccessError);

    expect(db.submissionCreate).not.toHaveBeenCalled();
    expect(db.submissionUpdateMany).not.toHaveBeenCalled();
  });
});
