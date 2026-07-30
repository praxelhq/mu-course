import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { redeemAvailableLicense, resolveStudentDiscountCode, shouldApplyEntitlementEvent } from "@/lib/billing";

describe("entitlement event ordering", () => {
  it("ignores stale events and accepts equal or newer events", () => {
    const current = new Date("2026-07-31T10:00:00Z");
    expect(shouldApplyEntitlementEvent(current, new Date("2026-07-31T09:59:59Z"))).toBe(false);
    expect(shouldApplyEntitlementEvent(current, new Date("2026-07-31T10:00:00Z"))).toBe(true);
    expect(shouldApplyEntitlementEvent(current, new Date("2026-07-31T10:00:01Z"))).toBe(true);
  });
});

describe("student discount codes", () => {
  it("applies only the configured code and normalizes casing", () => {
    expect(resolveStudentDiscountCode(" mu480free ", "MU480FREE")).toBe("MU480FREE");
    expect(resolveStudentDiscountCode(undefined, "MU480FREE")).toBeUndefined();
    expect(() => resolveStudentDiscountCode("FREEFORALL", "MU480FREE")).toThrow("not valid");
  });
});

describe("project license redemption", () => {
  it("does not spend a second credit for an already licensed project", async () => {
    const tx = {
      licenseCredit: {
        findUnique: vi.fn().mockResolvedValue({ id: "credit_1", status: "redeemed", purchase: { status: "active" } }),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(redeemAvailableLicense(tx, "user_1", "project_1")).resolves.toBe(true);
    expect(tx.licenseCredit.findFirst).not.toHaveBeenCalled();
  });

  it("replaces a revoked project credit with one available active credit", async () => {
    const tx = {
      licenseCredit: {
        findUnique: vi.fn().mockResolvedValue({ id: "credit_revoked", status: "revoked", purchase: { status: "inactive" } }),
        findFirst: vi.fn().mockResolvedValue({ id: "credit_available" }),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(redeemAvailableLicense(tx, "user_1", "project_1")).resolves.toBe(true);
    expect(tx.licenseCredit.update).toHaveBeenCalledWith({ where: { id: "credit_revoked" }, data: { projectId: null } });
    expect(tx.licenseCredit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "credit_available", status: "available", projectId: null },
      data: expect.objectContaining({ status: "redeemed", projectId: "project_1" }),
    }));
  });
});
