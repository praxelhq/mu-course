import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  eventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    newsletterSubscriber: { findUnique: mocks.findUnique, update: mocks.update, create: mocks.create },
    productEvent: { create: mocks.eventCreate },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/newsletter/route";
import { resetRateLimitsForTests } from "@/lib/request-rate-limit";

const request = () => new Request("https://vibesclone.com/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.20" }, body: JSON.stringify({ email: "builder@example.com", source: "blueprint:linear", website: "" }) });

describe("newsletter route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    process.env.RESEND_API_KEY = "test_resend";
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
    mocks.update.mockResolvedValue({ unsubscribeToken: "token_abcdefghijklmnopqrstuvwxyz" });
    mocks.create.mockResolvedValue({ unsubscribeToken: "token_abcdefghijklmnopqrstuvwxyz" });
    mocks.eventCreate.mockResolvedValue({ id: "event_test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it("acknowledges an active subscriber without sending another email", async () => {
    mocks.findUnique.mockResolvedValue({ id: "subscriber_test", active: true, unsubscribeToken: "token_abcdefghijklmnopqrstuvwxyz", reactivationRequestedAt: null });
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ subscribed: true, confirmation: "existing" });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires an intentional email confirmation before reactivating", async () => {
    mocks.findUnique.mockResolvedValue({ id: "subscriber_test", active: false, unsubscribeToken: "token_abcdefghijklmnopqrstuvwxyz", reactivationRequestedAt: null });
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ subscribed: false, confirmation: "reactivation-sent" });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ active: true }) }));
    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ body: expect.stringContaining("/resubscribe?token=") }));
  });

  it("creates one new subscriber and records one signup event", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ subscribed: true, confirmation: "sent" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.eventCreate).toHaveBeenCalledWith({ data: { event: "newsletter_signup", blueprintSlug: "linear" } });
  });
});
