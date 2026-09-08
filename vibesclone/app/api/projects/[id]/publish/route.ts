import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authErrorResponse, ensureUser, requireSessionIdentity } from "@/lib/auth";
import { prisma } from "@/lib/db";

const inputSchema = z.object({ published: z.boolean() }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await ensureUser(await requireSessionIdentity());
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    const project = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true, approvedVersion: true, publicId: true, isPublic: true } });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (input.published && project.approvedVersion === null) return Response.json({ error: "Approve the Build Understanding before publishing." }, { status: 409 });
    const publicId = project.publicId ?? randomBytes(18).toString("base64url");
    const approvedVersion = project.approvedVersion;
    const updated = await prisma.$transaction(async (tx) => {
      if (!input.published) return tx.project.update({ where: { id }, data: { isPublic: false, publishedAt: null }, select: { publicId: true, isPublic: true, publishedAt: true } });
      const claimed = await tx.project.updateMany({ where: { id, userId: user.id, approvedVersion: { not: null }, OR: [{ isPublic: false }, { publishedVersion: { not: approvedVersion } }] }, data: { isPublic: true, publicId, publishedAt: new Date(), publishedVersion: approvedVersion } });
      const current = await tx.project.findUnique({ where: { id }, select: { publicId: true, isPublic: true, publishedAt: true, publishedVersion: true } });
      if (!current?.isPublic || !current.publicId || current.publishedVersion === null) throw new Error("PROJECT_NOT_APPROVED");
      if (claimed.count === 1) await tx.productEvent.create({ data: { event: "public_report_published", publicId: current.publicId } });
      return { publicId: current.publicId, isPublic: current.isPublic, publishedAt: current.publishedAt };
    });
    return Response.json(updated);
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return Response.json({ error: "Could not update public access." }, { status: 400 });
  }
}
