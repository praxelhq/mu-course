import DodoPayments from "dodopayments";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const licensePackSizes = [1, 3, 10] as const;
export type LicensePackSize = (typeof licensePackSizes)[number];

export function hasDodoConfig(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PAYMENTS_WEBHOOK_KEY && licensePackSizes.every((pack) => productIdForPack(pack)));
}

export function dodoClient(): DodoPayments {
  const token = process.env.DODO_PAYMENTS_API_KEY;
  if (!token) throw new Error("Dodo Payments is not configured.");
  return new DodoPayments({
    bearerToken: token,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    environment: process.env.DODO_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode",
    timeout: 20_000,
    maxRetries: 2,
  });
}

export async function hasProjectEntitlement(userId: string, projectId: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.FIXTURE_MODE === "true") return true;
  return Boolean(await prisma.licenseCredit.findFirst({ where: { userId, projectId, status: "redeemed", purchase: { status: "active" } }, select: { id: true } }));
}

export async function availableLicenseCount(userId: string): Promise<number> {
  return prisma.licenseCredit.count({ where: { userId, status: "available", purchase: { status: "active" } } });
}

export function productIdForPack(pack: LicensePackSize): string | undefined {
  if (pack === 1) return process.env.DODO_PRODUCT_ID;
  if (pack === 3) return process.env.DODO_PRODUCT_ID_3;
  return process.env.DODO_PRODUCT_ID_10;
}

export function packForProductId(productId: string | undefined): LicensePackSize | undefined {
  return licensePackSizes.find((pack) => productIdForPack(pack) === productId);
}

export async function redeemAvailableLicense(tx: Prisma.TransactionClient, userId: string, projectId: string, purchaseId?: string): Promise<boolean> {
  const existing = await tx.licenseCredit.findUnique({ where: { projectId }, select: { id: true, status: true, purchase: { select: { status: true } } } });
  if (existing?.status === "redeemed" && existing.purchase.status === "active") return true;
  if (existing) await tx.licenseCredit.update({ where: { id: existing.id }, data: { projectId: null } });
  const credit = await tx.licenseCredit.findFirst({ where: { userId, purchaseId, status: "available", purchase: { status: "active" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!credit) return false;
  const updated = await tx.licenseCredit.updateMany({ where: { id: credit.id, status: "available", projectId: null }, data: { status: "redeemed", projectId, redeemedAt: new Date() } });
  return updated.count === 1;
}

export function shouldApplyEntitlementEvent(currentEffectiveAt: Date | null, incomingEffectiveAt: Date): boolean {
  return !currentEffectiveAt || incomingEffectiveAt >= currentEffectiveAt;
}

export class InvalidStudentCodeError extends Error {}

export function resolveStudentDiscountCode(submitted: unknown, configured = process.env.DODO_STUDENT_DISCOUNT_CODE): string | undefined {
  const submittedCode = typeof submitted === "string" ? submitted.trim().toUpperCase() : "";
  if (!submittedCode) return undefined;
  const configuredCode = configured?.trim().toUpperCase();
  if (!configuredCode || submittedCode !== configuredCode) throw new InvalidStudentCodeError("That student code is not valid.");
  return configuredCode;
}
