import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  projectUpdate: vi.fn(),
  providerRunCreate: vi.fn(),
  providerRunUpdate: vi.fn(),
  promptSetFindFirst: vi.fn(),
  transaction: vi.fn(),
  enqueueAnalysis: vi.fn(),
  enqueueGeneration: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSessionIdentity: vi.fn().mockResolvedValue({ clerkUserId: "clerk_test" }),
  ensureUser: vi.fn().mockResolvedValue({ id: "user_test" }),
  authErrorResponse: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst, update: mocks.projectUpdate },
    promptSet: { findFirst: mocks.promptSetFindFirst },
    providerRun: { create: mocks.providerRunCreate, update: mocks.providerRunUpdate },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/queue", () => ({
  enqueueAnalysis: mocks.enqueueAnalysis,
  enqueueGeneration: mocks.enqueueGeneration,
}));

import { POST as generate } from "@/app/api/projects/[id]/generate/route";
import { POST as rethink } from "@/app/api/projects/[id]/rethink/route";

const context = { params: Promise.resolve({ id: "project_test" }) };

describe("queue dispatch recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectUpdate.mockReturnValue(Promise.resolve({}));
    mocks.providerRunCreate.mockReturnValue(Promise.resolve({}));
    mocks.providerRunUpdate.mockReturnValue(Promise.resolve({}));
    mocks.transaction.mockResolvedValue([]);
    mocks.promptSetFindFirst.mockResolvedValue(null);
  });

  it("restores an approved project when prompt dispatch fails", async () => {
    mocks.projectFindFirst.mockResolvedValue({
      id: "project_test",
      status: "approved",
      approvedVersion: 2,
      currentUnderstanding: 2,
      buildTarget: "lovable",
      updatedAt: new Date("2026-07-31T12:00:00Z"),
    });
    mocks.enqueueGeneration.mockRejectedValue(new Error("queue down"));

    const response = await generate(new Request("https://vibesclone.com/api/projects/project_test/generate", { method: "POST" }), context);

    expect(response.status).toBe(503);
    expect(mocks.projectUpdate).toHaveBeenLastCalledWith({ where: { id: "project_test" }, data: { status: "approved" } });
    expect(mocks.providerRunUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });

  it("restores the previous review state when rethink dispatch fails", async () => {
    mocks.projectFindFirst.mockResolvedValue({
      id: "project_test",
      status: "review",
      approvedVersion: null,
      currentUnderstanding: 1,
      updatedAt: new Date("2026-07-31T12:00:00Z"),
    });
    mocks.enqueueAnalysis.mockRejectedValue(new Error("queue down"));

    const response = await rethink(new Request("https://vibesclone.com/api/projects/project_test/rethink", { method: "POST" }), context);

    expect(response.status).toBe(503);
    expect(mocks.projectUpdate).toHaveBeenLastCalledWith({ where: { id: "project_test" }, data: { status: "review" } });
    expect(mocks.providerRunUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });
});
