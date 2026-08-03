import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  hasProjectEntitlement: vi.fn(),
  availableLicenseCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSessionIdentity: vi.fn().mockResolvedValue({ clerkUserId: "clerk_test" }),
  ensureUser: vi.fn().mockResolvedValue({ id: "user_test" }),
  authErrorResponse: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/billing", () => ({
  hasProjectEntitlement: mocks.hasProjectEntitlement,
  availableLicenseCount: mocks.availableLicenseCount,
}));

vi.mock("@/lib/db", () => ({
  prisma: { project: { findFirst: mocks.projectFindFirst, update: vi.fn(), delete: vi.fn() } },
}));

import { GET } from "@/app/api/projects/[id]/route";

const context = { params: Promise.resolve({ id: "project_test" }) };
const promptContent = {
  base: { order: 0, title: "Build the foundation", purpose: "Ship the core", prompt: "A useful base prompt with enough concrete implementation detail to satisfy the production prompt contract.", completionChecks: ["App runs"], mappedFeatures: ["Core workflow"] },
  followUps: [
    { order: 1, title: "Add billing", purpose: "Monetize", prompt: "Paid prompt one with enough implementation detail to satisfy the production prompt validation contract.", completionChecks: ["Checkout works"], mappedFeatures: ["Billing"] },
    { order: 2, title: "Polish", purpose: "Refine", prompt: "Paid prompt two with enough implementation detail to satisfy the production prompt validation contract.", completionChecks: ["UI is polished"], mappedFeatures: ["Polish"] },
  ],
};

describe("project prompt paywall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availableLicenseCount.mockResolvedValue(3);
    mocks.projectFindFirst.mockResolvedValue({
      id: "project_test",
      userId: "user_test",
      promptSets: [{ id: "prompts_test", content: promptContent }],
      understandings: [],
      jobs: [],
    });
  });

  it("returns the complete base prompt but never serializes paid follow-ups for a free project", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(false);

    const response = await GET(new Request("https://vibesclone.com/api/projects/project_test"), context);
    const body = await response.json();

    expect(body.project.promptSets[0].content.base.prompt).toContain("A useful base prompt");
    expect(body.project.promptSets[0].content.followUps).toEqual([]);
    expect(body.lockedPromptCount).toBe(2);
    expect(body.availableLicenses).toBe(3);
  });

  it("filters completedOrders to the base order for an unlicensed project", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(false);
    mocks.projectFindFirst.mockResolvedValue({
      id: "project_test",
      userId: "user_test",
      promptSets: [{ id: "prompts_test", content: promptContent, completedOrders: [0, 1, 2] }],
      understandings: [],
      jobs: [],
    });

    const response = await GET(new Request("https://vibesclone.com/api/projects/project_test"), context);
    const body = await response.json();

    expect(body.project.promptSets[0].completedOrders).toEqual([0]);
  });

  it("returns the full sequence only after this project is licensed", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(true);

    const response = await GET(new Request("https://vibesclone.com/api/projects/project_test"), context);
    const body = await response.json();

    expect(body.project.promptSets[0].content.followUps).toHaveLength(2);
    expect(body.lockedPromptCount).toBe(0);
  });

  it("fails closed when stored prompt content is malformed", async () => {
    mocks.hasProjectEntitlement.mockResolvedValue(false);
    mocks.projectFindFirst.mockResolvedValue({ id: "project_test", userId: "user_test", promptSets: [{ id: "prompts_test", content: { base: "bad", followUps: ["secret"] } }], understandings: [], jobs: [] });

    const response = await GET(new Request("https://vibesclone.com/api/projects/project_test"), context);
    const body = await response.json();

    expect(body.project.promptSets).toEqual([]);
    expect(body.lockedPromptCount).toBe(0);
  });
});
