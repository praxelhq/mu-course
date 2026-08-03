import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  promptSetUpdate: vi.fn(),
  hasProjectEntitlement: vi.fn(),
  requireSessionIdentity: vi.fn(),
  authErrorResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSessionIdentity: mocks.requireSessionIdentity,
  ensureUser: vi.fn().mockResolvedValue({ id: "user_test" }),
  authErrorResponse: mocks.authErrorResponse,
}));

vi.mock("@/lib/billing", () => ({
  hasProjectEntitlement: mocks.hasProjectEntitlement,
}));

vi.mock("@/lib/db", () => ({
  prisma: { project: { findFirst: mocks.projectFindFirst }, promptSet: { update: mocks.promptSetUpdate } },
}));

import { POST } from "@/app/api/projects/[id]/progress/route";

const context = { params: Promise.resolve({ id: "project_test" }) };
const promptContent = {
  base: { order: 0, title: "Build the foundation", purpose: "Ship the core", prompt: "A useful base prompt with enough concrete implementation detail to satisfy the production prompt contract.", completionChecks: ["App runs"], mappedFeatures: ["Core workflow"] },
  followUps: [
    { order: 1, title: "Add billing", purpose: "Monetize", prompt: "Paid prompt one with enough implementation detail to satisfy the production prompt validation contract.", completionChecks: ["Checkout works"], mappedFeatures: ["Billing"] },
    { order: 2, title: "Polish", purpose: "Refine", prompt: "Paid prompt two with enough implementation detail to satisfy the production prompt validation contract.", completionChecks: ["UI is polished"], mappedFeatures: ["Polish"] },
  ],
};

function post(body: unknown): Promise<Response> {
  return POST(new Request("https://vibesclone.com/api/projects/project_test/progress", { method: "POST", body: JSON.stringify(body) }), context);
}

function seedProject(completedOrders: number[] = []): void {
  mocks.projectFindFirst.mockResolvedValue({
    id: "project_test",
    userId: "user_test",
    promptSets: [{ id: "prompts_test", content: promptContent, completedOrders }],
  });
}

describe("sequence progress toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionIdentity.mockResolvedValue({ clerkUserId: "clerk_test" });
    mocks.authErrorResponse.mockReturnValue(null);
    mocks.promptSetUpdate.mockImplementation(async ({ data }: { data: { completedOrders: number[] } }) => ({ completedOrders: data.completedOrders }));
    seedProject();
  });

  it("marks and unmarks a follow-up order for a licensed project", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(true);

    const marked = await post({ order: 1, completed: true });
    expect(marked.status).toBe(200);
    expect(await marked.json()).toEqual({ completedOrders: [1] });
    expect(mocks.promptSetUpdate).toHaveBeenCalledWith({ where: { id: "prompts_test" }, data: { completedOrders: [1] }, select: { completedOrders: true } });

    seedProject([1, 2]);
    const unmarked = await post({ order: 1, completed: false });
    expect(await unmarked.json()).toEqual({ completedOrders: [2] });
  });

  it("persists the write so the stored row carries the order", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(true);
    seedProject([0]);

    const response = await post({ order: 2, completed: true });

    expect(await response.json()).toEqual({ completedOrders: [0, 2] });
    expect(mocks.promptSetUpdate.mock.calls[0][0].data.completedOrders).toEqual([0, 2]);
  });

  it("allows an unlicensed project to mark only the base prompt", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(false);

    const response = await post({ order: 0, completed: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completedOrders: [0] });
  });

  it("rejects locked orders identically to nonexistent orders, in both directions", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(false);

    const locked = await post({ order: 1, completed: true });
    const lockedUnmark = await post({ order: 2, completed: false });
    mocks.hasProjectEntitlement.mockResolvedValue(true);
    const missing = await post({ order: 99, completed: true });

    const missingBody = await missing.json();
    expect(locked.status).toBe(missing.status);
    expect(lockedUnmark.status).toBe(missing.status);
    expect(await locked.json()).toEqual(missingBody);
    expect(await lockedUnmark.json()).toEqual(missingBody);
    expect(mocks.promptSetUpdate).not.toHaveBeenCalled();
  });

  it("rejects orders outside the stored sequence", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(true);

    const negative = await post({ order: -1, completed: true });
    const beyond = await post({ order: 3, completed: true });

    expect(negative.status).toBeGreaterThanOrEqual(400);
    expect(beyond.status).toBeGreaterThanOrEqual(400);
    expect(mocks.promptSetUpdate).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(true);

    const missingOrder = await post({ completed: true });
    const badCompleted = await post({ order: 1, completed: "yes" });

    expect(missingOrder.status).toBe(400);
    expect(badCompleted.status).toBe(400);
  });

  it("returns 401 through the existing auth error path when unauthenticated", async () => {
    const unauthenticated = new Error("UNAUTHENTICATED");
    mocks.requireSessionIdentity.mockRejectedValue(unauthenticated);
    mocks.authErrorResponse.mockReturnValue(Response.json({ error: "Sign in to continue." }, { status: 401 }));

    const response = await post({ order: 0, completed: true });

    expect(response.status).toBe(401);
  });
});
