import { ensureUser, requireSessionIdentity, authErrorResponse } from "@/lib/auth";
import { dodoClient, InvalidStudentCodeError, licensePackSizes, productIdForPack, resolveStudentDiscountCode, type LicensePackSize } from "@/lib/billing";
import { prisma } from "@/lib/db";

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireSessionIdentity();
    const user = await ensureUser(identity);
    const body = (await request.json().catch(() => ({}))) as { projectId?: unknown; pack?: unknown; discountCode?: unknown };
    if (typeof body.projectId !== "string") return Response.json({ error: "Choose a project to unlock." }, { status: 400 });
    const project = await prisma.project.findFirst({ where: { id: body.projectId, userId: user.id }, select: { id: true, status: true } });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.status !== "complete") return Response.json({ error: "Generate the free base prompt before unlocking the sequence." }, { status: 409 });
    if (body.pack !== undefined && (typeof body.pack !== "number" || !licensePackSizes.includes(body.pack as LicensePackSize))) {
      return Response.json({ error: "Choose a valid project license pack." }, { status: 400 });
    }
    const pack = (body.pack ?? 1) as LicensePackSize;
    const productId = productIdForPack(pack);
    if (!productId) throw new Error(`The ${pack}-project license pack is not configured.`);
    const studentCode = resolveStudentDiscountCode(body.discountCode);
    if (studentCode && pack !== 1) return Response.json({ error: "The student code applies to one project license only." }, { status: 400 });
    if (studentCode && await prisma.licensePurchase.findFirst({ where: { userId: user.id, studentGrant: true }, select: { id: true } })) {
      return Response.json({ error: "Your free student project license has already been used." }, { status: 409 });
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const session = await dodoClient().checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${appUrl}/workspace?project=${project.id}&checkout=return`,
      cancel_url: `${appUrl}/workspace?project=${project.id}&checkout=cancelled`,
      discount_codes: studentCode ? [studentCode] : undefined,
      metadata: { user_id: user.id, clerk_user_id: identity.clerkUserId, project_id: project.id, license_count: String(pack), student_grant: studentCode ? "true" : "false" },
      customer: identity.email ? { email: identity.email, name: identity.email.split("@")[0] } : undefined,
    });
    if (!session.checkout_url) throw new Error("Dodo did not return a checkout URL.");
    return Response.json({ url: session.checkout_url });
  } catch (error) {
    if (error instanceof InvalidStudentCodeError) return Response.json({ error: error.message }, { status: 400 });
    return authErrorResponse(error) ?? Response.json({ error: error instanceof Error ? error.message : "Checkout could not be created." }, { status: 500 });
  }
}
