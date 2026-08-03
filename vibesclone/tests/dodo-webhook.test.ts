import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  unwrap: vi.fn(),
  receiptFindUnique: vi.fn(),
  receiptCreate: vi.fn(),
  purchaseFindUnique: vi.fn(),
  purchaseUpdate: vi.fn(),
  creditUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/billing", () => ({
  dodoClient: () => ({ webhooks: { unwrap: mocks.unwrap } }),
  packForProductId: vi.fn().mockReturnValue(1),
  redeemAvailableLicense: vi.fn(),
  shouldApplyEntitlementEvent: (current: Date | null, incoming: Date) => !current || incoming >= current,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    webhookReceipt: { findUnique: mocks.receiptFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/webhooks/dodo/route";

function webhookRequest(): Request {
  return new Request("https://vibesclone.com/api/webhooks/dodo", {
    method: "POST",
    body: "{}",
    headers: { "webhook-id": "event_1", "webhook-signature": "signed", "webhook-timestamp": "1785441600" },
  });
}

describe("Dodo webhook license state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.receiptFindUnique.mockResolvedValue(null);
    mocks.purchaseFindUnique.mockResolvedValue({ id: "purchase_1", effectiveAt: new Date("2026-07-31T10:00:00Z") });
    mocks.purchaseUpdate.mockResolvedValue({});
    mocks.creditUpdateMany.mockResolvedValue({ count: 1 });
    mocks.receiptCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      licensePurchase: { findUnique: mocks.purchaseFindUnique, update: mocks.purchaseUpdate },
      licenseCredit: { updateMany: mocks.creditUpdateMany },
      webhookReceipt: { create: mocks.receiptCreate },
    }));
  });

  it("revokes a purchase from a full refund payload that has no product cart or user metadata", async () => {
    mocks.unwrap.mockResolvedValue({
      type: "refund.succeeded",
      timestamp: "2026-07-31T11:00:00Z",
      data: { payload_type: "Refund", payment_id: "payment_1", refund_id: "refund_1", is_partial: false, metadata: {} },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.purchaseFindUnique).toHaveBeenCalledWith({ where: { externalId: "payment_1" } });
    expect(mocks.purchaseUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "inactive" }) }));
    expect(mocks.creditUpdateMany).toHaveBeenCalledWith({ where: { purchaseId: "purchase_1" }, data: { status: "revoked" } });
  });

  it("keeps access active after a partial refund", async () => {
    mocks.unwrap.mockResolvedValue({
      type: "refund.succeeded",
      timestamp: "2026-07-31T11:00:00Z",
      data: { payload_type: "Refund", payment_id: "payment_1", refund_id: "refund_1", is_partial: true, metadata: {} },
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.purchaseUpdate).not.toHaveBeenCalled();
    expect(mocks.creditUpdateMany).not.toHaveBeenCalled();
    expect(mocks.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ result: "ignored" }) }));
  });

  it("does not acknowledge an unrelated unique-constraint failure as a duplicate webhook", async () => {
    mocks.unwrap.mockResolvedValue({ type: "payment.succeeded", timestamp: "2026-07-31T11:00:00Z", data: {} });
    const error = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
    mocks.transaction.mockRejectedValue(error);

    await expect(POST(webhookRequest())).rejects.toBe(error);
    expect(mocks.receiptFindUnique).toHaveBeenCalledTimes(2);
  });
});
