import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseValidations } from "@/lib/portfolio";
import {
  EXTERNAL_FINGERPRINT_PREFIX,
  SCREENSHOT_BLOCKED,
} from "@/lib/galleries";
import { selectReferencedEvidence } from "@/lib/evidence/referenced-evidence";
import {
  fingerprintPublicationSource,
  parsePublicationPolicy,
} from "@/lib/publication-policy";
import {
  projectSafeScalarFields,
  resolveSafeExportContract,
  sanitizeExportText,
  selectPraxyCandidate,
  type PraxyCandidate,
} from "@/lib/safe-exports";

// Instructor-only Praxy preview. The response is a projection, never a model
// dump: no grade/result relation, evaluator config, upload receipt locator or
// mutable unallowlisted field is selected or serialized.

export const dynamic = "force-dynamic";
export const PRAXY_EXPORT_CONTRACT_VERSION = 2 as const;

const bodySchema = z.object({ userId: z.string().min(1) }).strict();

export const POST = withAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Invalid body: expected { userId }" }, { status: 400 });
    }
    const { userId } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, teamId: true },
    });
    if (!user || user.role !== "student") {
      return Response.json({ error: "Unknown student" }, { status: 404 });
    }

    const [submissions, portfolio, signOff, latestInterview] = await Promise.all([
      prisma.submission.findMany({
        // Read the complete owner chain so a pending V2 can leave V1 visible
        // while an explicit revocation on that newest V2 removes the chain.
        // Lifecycle filtering belongs in selectPraxyCandidate, not this query.
        where: { userId },
        orderBy: [{ version: "desc" }, { attempt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          assignmentId: true,
          assessmentVersionId: true,
          version: true,
          attempt: true,
          status: true,
          submittedAt: true,
          fields: true,
          assessmentResult: { select: { publishable: true } },
          assessmentVersion: {
            select: {
              exportPolicy: true,
              publicationPolicy: true,
              publicSchema: true,
              datasetReleaseId: true,
            },
          },
          publicationDecision: {
            select: {
              ownerConsent: true,
              ownerRevokedAt: true,
              instructorState: true,
              reviewedFingerprint: true,
              previewS3Key: true,
            },
          },
          evidence: {
            select: {
              id: true,
              fieldKey: true,
              fileRole: true,
              sha256: true,
              s3VersionId: true,
              byteCount: true,
            },
          },
          assignment: {
            select: {
              title: true,
              assignmentType: {
                select: {
                  slug: true,
                  submissionSchema: true,
                  galleryEligible: true,
                },
              },
            },
          },
          galleryItem: { select: { featured: true, screenshotS3Key: true } },
        },
      }),
      prisma.portfolioEntry.findUnique({
        where: { userId },
        select: { validations: true },
      }),
      user.teamId
        ? prisma.signOff.findUnique({
            where: { teamId: user.teamId },
            select: {
              status: true,
              evidenceS3Key: true,
              recordedBy: true,
            },
          })
        : null,
      prisma.interview.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      }),
    ]);

    const byAssignment = new Map<string, typeof submissions>();
    for (const submission of submissions) {
      const rows = byAssignment.get(submission.assignmentId) ?? [];
      rows.push(submission);
      byAssignment.set(submission.assignmentId, rows);
    }

    const artifacts: {
      type: string;
      title: string;
      version: number;
      fields: Record<string, string | number | boolean | null>;
      submittedAt: string | null;
      featured: boolean;
    }[] = [];

    for (const rows of byAssignment.values()) {
      const candidates: (PraxyCandidate & { row: (typeof rows)[number] })[] = rows.map((row) => {
        const policy = parsePublicationPolicy(row.assessmentVersion?.publicationPolicy);
        const fields =
          row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)
            ? (row.fields as Record<string, unknown>)
            : {};
        const referencedEvidence = selectReferencedEvidence({
          publicSchema: row.assessmentVersion?.publicSchema,
          fields,
          evidence: row.evidence,
        });
        const previewRef =
          row.publicationDecision?.previewS3Key ??
          row.galleryItem?.screenshotS3Key ??
          null;
        const requiresMarker = Boolean(
          policy &&
            policy.wall !== "app" &&
            policy.actions.some(
              (action) =>
                action.kind === "external-url" && action.requireReviewedFingerprint,
            ),
        );
        const fingerprintReady =
          Boolean(policy) &&
          previewRef !== SCREENSHOT_BLOCKED &&
          (!requiresMarker || Boolean(previewRef?.startsWith(EXTERNAL_FINGERPRINT_PREFIX)));
        const currentFingerprint =
          policy && fingerprintReady
            ? fingerprintPublicationSource({
                policy,
                fields,
                evidence: referencedEvidence.map((item) => ({
                  role: item.fileRole,
                  sha256: item.sha256,
                  s3VersionId: item.s3VersionId,
                  byteCount: item.byteCount,
                })),
                previewRef,
              })
            : null;
        return {
          id: row.id,
          version: row.version,
          attempt: row.attempt,
          contractMode: row.assessmentVersionId ? "versioned" : "legacy",
          exportPolicy: row.assessmentVersion?.exportPolicy ?? null,
          submissionSchema: row.assignment.assignmentType.submissionSchema,
          legacyPraxyEnabled: row.assignment.assignmentType.galleryEligible,
          lifecycle: row.status,
          publishable: row.assessmentResult?.publishable ?? false,
          ownerConsent: row.publicationDecision?.ownerConsent ?? false,
          ownerRevokedAt: row.publicationDecision?.ownerRevokedAt ?? null,
          instructorState: row.publicationDecision?.instructorState ?? null,
          reviewCurrent: Boolean(
            currentFingerprint &&
              row.publicationDecision?.reviewedFingerprint === currentFingerprint,
          ),
          datasetBound: Boolean(row.assessmentVersion?.datasetReleaseId),
          row,
        };
      });
      const selected = selectPraxyCandidate(candidates);
      if (!selected) continue;
      const contract = resolveSafeExportContract(selected);
      if (!contract?.praxy.enabled) continue;

      artifacts.push({
        type:
          sanitizeExportText(selected.row.assignment.assignmentType.slug, "praxy:artifact:type") ??
          "artifact",
        title:
          sanitizeExportText(selected.row.assignment.title, "praxy:artifact:title") ?? "Artifact",
        version: selected.row.version,
        fields: projectSafeScalarFields(selected.row.fields, contract.praxy.fieldKeys),
        submittedAt: selected.row.submittedAt?.toISOString() ?? null,
        featured: selected.row.galleryItem?.featured ?? false,
      });
    }

    const badges: ({ kind: string } & Record<string, unknown>)[] = [];
    if (
      signOff?.status === "signed_off" &&
      Boolean(signOff.evidenceS3Key) &&
      signOff.recordedBy
    ) {
      const recorder = await prisma.user.findUnique({
        where: { id: signOff.recordedBy },
        select: { role: true },
      });
      if (recorder?.role === "instructor" || recorder?.role === "admin") {
        badges.push({ kind: "company-sign-off", verified: true });
      }
    }
    if (latestInterview?.status === "graded") {
      badges.push({ kind: "interview-completed" });
    }
    const externalValidations = parseValidations(portfolio?.validations).filter(
      (validation) => validation.kind === "external",
    );
    if (externalValidations.length > 0) {
      badges.push({ kind: "external-validation", count: externalValidations.length });
    }

    return Response.json({
      contractVersion: PRAXY_EXPORT_CONTRACT_VERSION,
      student: { name: user.name, praxyProfileHint: user.email },
      artifacts,
      badges,
      generatedAt: new Date().toISOString(),
    });
  },
  { role: "instructor" },
);
