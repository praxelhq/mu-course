import { createHash } from "node:crypto";
import { dodoClient, packForProductId, redeemAvailableLicense, shouldApplyEntitlementEvent } from "@/lib/billing";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type DodoPayload = { type?: string; timestamp?: string; data?: { metadata?: Record<string, string>; product_cart?: { product_id?: string }[]; payment_id?: string; subscription_id?: string; id?: string; is_partial?: boolean } };
const activeEvents = new Set(["payment.succeeded", "subscription.active", "subscription.renewed"]);
const inactiveEvents = new Set(["refund.succeeded", "subscription.cancelled", "subscription.expired", "dispute.opened", "dispute.lost"]);

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
  };
  if (!headers["webhook-id"] || !headers["webhook-signature"] || !headers["webhook-timestamp"]) return Response.json({ error: "Missing signature headers." }, { status: 401 });
  let payload: DodoPayload;
  try {
    payload = (await dodoClient().webhooks.unwrap(raw, { headers })) as DodoPayload;
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }
  const eventId = headers["webhook-id"];
  const already = await prisma.webhookReceipt.findUnique({ where: { id: eventId } });
  if (already) return Response.json({ ok: true, duplicate: true });
  const eventType = payload.type ?? "unknown";
  const userId = payload.data?.metadata?.user_id;
  const productId = payload.data?.product_cart?.[0]?.product_id ?? process.env.DODO_PRODUCT_ID;
  const pack = packForProductId(productId);
  const externalId = payload.data?.payment_id ?? payload.data?.subscription_id ?? payload.data?.id;
  const projectId = payload.data?.metadata?.project_id;
  try {
    await prisma.$transaction(async (tx) => {
      let result = "ignored";
      const effectiveAt = new Date(payload.timestamp ?? Date.now());
      if (activeEvents.has(eventType) && userId && productId && pack && externalId) {
        const current = await tx.licensePurchase.findUnique({ where: { externalId } });
        if (!shouldApplyEntitlementEvent(current?.effectiveAt ?? null, effectiveAt)) result = "stale";
        else {
          const purchase = current ?? await tx.licensePurchase.create({
            data: {
              userId,
              externalId,
              productId,
              status: "active",
              licenseCount: pack,
              studentGrant: payload.data?.metadata?.student_grant === "true",
              effectiveAt,
              credits: { create: Array.from({ length: pack }, () => ({ userId })) },
            },
          });
          if (current) await tx.licensePurchase.update({ where: { id: current.id }, data: { status: "active", effectiveAt } });
          if (projectId) {
            const owned = await tx.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
            if (owned) await redeemAvailableLicense(tx, userId, projectId, purchase.id);
          }
          result = "active";
        }
      } else if (inactiveEvents.has(eventType) && externalId && !(eventType === "refund.succeeded" && payload.data?.is_partial)) {
        const current = await tx.licensePurchase.findUnique({ where: { externalId } });
        if (current && shouldApplyEntitlementEvent(current.effectiveAt, effectiveAt)) {
          await tx.licensePurchase.update({ where: { id: current.id }, data: { status: "inactive", effectiveAt } });
          await tx.licenseCredit.updateMany({ where: { purchaseId: current.id }, data: { status: "revoked" } });
          result = "inactive";
        } else if (current) result = "stale";
      }
      await tx.webhookReceipt.create({ data: { id: eventId, eventType, eventTime: payload.timestamp ? new Date(payload.timestamp) : null, payloadHash: createHash("sha256").update(raw).digest("hex"), result } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const receipt = await prisma.webhookReceipt.findUnique({ where: { id: eventId }, select: { id: true } });
      if (receipt) return Response.json({ ok: true, duplicate: true });
    }
    throw error;
  }
  return Response.json({ ok: true });
}
