import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  projectUpdate: vi.fn(),
  projectUpdateMany: vi.fn(),
  projectFindUnique: vi.fn(),
  productEventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSessionIdentity: vi.fn().mockResolvedValue({ clerkUserId: "clerk_test" }),
  ensureUser: vi.fn().mockResolvedValue({ id: "user_test" }),
  authErrorResponse: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst, update: mocks.projectUpdate, updateMany: mocks.projectUpdateMany, findUnique: mocks.projectFindUnique },
    productEvent: { create: mocks.productEventCreate },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/projects/[id]/publish/route";

const context = { params: Promise.resolve({ id: "project_test" }) };
const request = (published: boolean) => new Request("https://vibesclone.com/api/projects/project_test/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published }) });

describe("project publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((operation: (client: unknown) => Promise<unknown>) => operation({ project: { update: mocks.projectUpdate, updateMany: mocks.projectUpdateMany, findUnique: mocks.projectFindUnique }, productEvent: { create: mocks.productEventCreate } }));
    mocks.projectUpdate.mockResolvedValue({ publicId: "public_existing", isPublic: true, publishedAt: new Date() });
    mocks.projectUpdateMany.mockResolvedValue({ count: 1 });
    mocks.projectFindUnique.mockResolvedValue({ publicId: "public_existing", isPublic: true, publishedAt: new Date(), publishedVersion: 2 });
    mocks.productEventCreate.mockResolvedValue({ id: "event_test" });
  });

  it("requires an owned, approved project", async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: "project_test", approvedVersion: null, publicId: null, isPublic: false });
    const response = await POST(request(true), context);
    expect(response.status).toBe(409);
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "project_test", userId: "user_test" } }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("publishes once with an opaque stable id and publication event", async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: "project_test", approvedVersion: 2, publicId: null, isPublic: false });
    const response = await POST(request(true), context);
    expect(response.status).toBe(200);
    expect(mocks.projectUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "project_test", userId: "user_test", OR: expect.arrayContaining([{ isPublic: false }]) }), data: expect.objectContaining({ isPublic: true, publicId: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/), publishedAt: expect.any(Date), publishedVersion: 2 }) }));
    expect(mocks.productEventCreate).toHaveBeenCalledTimes(1);
  });

  it("does not double-count concurrent publication retries", async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: "project_test", approvedVersion: 2, publicId: "public_existing", isPublic: false });
    mocks.projectUpdateMany.mockResolvedValue({ count: 0 });
    const response = await POST(request(true), context);
    expect(response.status).toBe(200);
    expect(mocks.productEventCreate).not.toHaveBeenCalled();
  });

  it("makes a report private without deleting its stable public id", async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: "project_test", approvedVersion: 2, publicId: "public_existing", isPublic: true });
    mocks.projectUpdate.mockResolvedValue({ publicId: "public_existing", isPublic: false, publishedAt: null });
    const response = await POST(request(false), context);
    expect(response.status).toBe(200);
    expect(mocks.projectUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { isPublic: false, publishedAt: null } }));
    expect(mocks.productEventCreate).not.toHaveBeenCalled();
  });
});
