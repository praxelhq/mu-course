import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ eventCreate: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: { productEvent: { create: mocks.eventCreate } } }));

import { POST } from "@/app/api/events/route";
import { opportunities } from "@/lib/opportunities";
import { resetRateLimitsForTests } from "@/lib/request-rate-limit";

const request = (body: unknown) => new Request("https://vibesclone.com/api/events", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.40" }, body: JSON.stringify(body) });

describe("product events route", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    mocks.eventCreate.mockReset().mockResolvedValue({});
  });

  it("records activity for teardowns and earning-product pages", async () => {
    expect((await POST(request({ event: "blueprint_view", blueprintSlug: "linear" }))).status).toBe(204);
    expect((await POST(request({ event: "blueprint_remix", blueprintSlug: opportunities[0].slug }))).status).toBe(204);
    expect(mocks.eventCreate).toHaveBeenCalledTimes(2);
  });

  it("rejects slugs that match neither registry", async () => {
    expect((await POST(request({ event: "blueprint_view", blueprintSlug: "definitely-not-listed" }))).status).toBe(400);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });
});
