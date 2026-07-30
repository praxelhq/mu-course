import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { updateClerkUserMetadata } from "@/lib/auth/clerk";
import {
  DpdpErasureError,
  type DpdpErasureInput,
  type DpdpErasureResult,
} from "@/lib/dpdp-erasure";
import { eraseDpdpUser } from "@/lib/dpdp-erasure-prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1),
  confirmEmail: z.string().min(1),
});

type ClerkMetadataPatch = Parameters<typeof updateClerkUserMetadata>[1];

type EraseWithPreCleanup = (
  input: DpdpErasureInput,
  options: {
    beforeDatabaseCleanup: (input: {
      parentReceiptId: string;
      clerkUserId: string;
    }) => Promise<void>;
  },
) => Promise<DpdpErasureResult>;

/**
 * Fence Clerk after exact object-version verification but before local row
 * cleanup. The pending receipt can therefore be retried if Clerk is down, and
 * the completed legal receipt does not retain Clerk's raw provider identifier.
 */
export async function performDpdpDelete(
  input: DpdpErasureInput,
  deps: {
    erase?: EraseWithPreCleanup;
    flagClerk?: (clerkUserId: string, patch: ClerkMetadataPatch) => Promise<void>;
  } = {},
): Promise<DpdpErasureResult> {
  const erase: EraseWithPreCleanup = deps.erase ?? eraseDpdpUser;
  return erase(input, {
    beforeDatabaseCleanup: async ({ clerkUserId, parentReceiptId }) => {
      await (deps.flagClerk ?? updateClerkUserMetadata)(clerkUserId, {
        privateMetadata: {
          flaggedForDeletion: true,
          dpdpDeletedAt: new Date().toISOString(),
          dpdpDeletionReceiptId: parentReceiptId,
        },
      });
    },
  });
}

export const POST = withAuth(
  async (req, { user: admin }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body: expected { userId, confirmEmail }" },
        { status: 400 },
      );
    }

    try {
      const result = await performDpdpDelete({
        ...parsed.data,
        requestedBy: admin.userId,
      });
      return Response.json({
        ok: true,
        receiptId: result.receiptId,
        alreadyCompleted: result.alreadyCompleted,
        deleted: result.deleted,
      });
    } catch (error) {
      if (error instanceof DpdpErasureError) {
        return Response.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      console.error("[dpdp-delete] Erasure failed closed:", error);
      return Response.json(
        { error: "Erasure failed; database data was retained", code: "erasure-failed" },
        { status: 500 },
      );
    }
  },
  { role: "admin" },
);
