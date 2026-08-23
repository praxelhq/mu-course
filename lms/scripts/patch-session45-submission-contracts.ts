import { Prisma, PrismaClient } from "@prisma/client";
import { sha256CanonicalJson } from "../lib/canonical-json";

const db = new PrismaClient();

type JsonRecord = Record<string, unknown>;

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

function requiredWriteup(key: string, label: string): JsonRecord {
  return { key, label, kind: "writeup", required: true };
}

function requiredLink(key: string, label: string, helpText: string): JsonRecord {
  return { key, label, kind: "link", required: true, helpText };
}

function withRequiredField(schema: JsonRecord, key: string, field: JsonRecord, beforeKey: string): JsonRecord {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const fieldKey = (candidate: unknown): unknown =>
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>).key
      : undefined;
  if (fields.some((candidate) => fieldKey(candidate) === key)) return schema;
  const index = fields.findIndex((candidate) => fieldKey(candidate) === beforeKey);
  const next = [...fields];
  next.splice(index < 0 ? next.length : index, 0, field);
  return { ...schema, fields: next };
}

function assessmentChecksum(version: JsonRecord): string {
  return sha256CanonicalJson({
    assignmentId: version.assignmentId,
    version: version.version,
    ownerKind: version.ownerKind,
    purpose: version.purpose,
    publicSchema: version.publicSchema,
    rubric: version.rubric,
    materialManifest: version.materialManifest,
    scoringPolicy: version.scoringPolicy,
    portfolioPolicy: version.portfolioPolicy,
    publicationPolicy: version.publicationPolicy,
    exportPolicy: version.exportPolicy,
    previewPolicy: version.previewPolicy,
    datasetReleaseId: version.datasetReleaseId,
    retentionClassKey: "course-private-assessment",
    improvementAllowed: version.improvementAllowed,
    improvementWindowDays: version.improvementWindowDays,
    evaluatorChecksum: version.evaluatorChecksum,
  });
}

async function patchContract(input: {
  client: PrismaClient | Prisma.TransactionClient;
  assignmentId: string;
  typeSlug: string;
  oldVersionId: string;
  newVersionId: string;
  newEvaluatorId: string;
  ownerKind: "individual" | "team";
  schema: JsonRecord;
  description: string;
  brief: string;
  dueAt: Date;
}) {
  const client = input.client;
  const assignment = await client.assignment.findUnique({
    where: { id: input.assignmentId },
    include: { assignmentType: true },
  });
  if (!assignment || assignment.assignmentType.slug !== input.typeSlug) {
    throw new Error(`Missing or mismatched assignment ${input.assignmentId}.`);
  }
  const oldVersion = await client.assessmentVersion.findUnique({
    where: { id: input.oldVersionId },
    include: { evaluatorConfig: true },
  });
  if (!oldVersion || !oldVersion.evaluatorConfig) {
    throw new Error(`Missing published source contract ${input.oldVersionId}.`);
  }

  const currentSchema = input.schema;
  const evaluatorChecksum = sha256CanonicalJson({
    config: oldVersion.evaluatorConfig.config,
    answerKey: oldVersion.evaluatorConfig.answerKey,
    anchors: oldVersion.evaluatorConfig.anchors,
    normalization: oldVersion.evaluatorConfig.normalization,
  });
  const versionNumber = oldVersion.version + 1;
  const nextVersion: JsonRecord = {
    id: input.newVersionId,
    assignmentId: assignment.id,
    version: versionNumber,
    ownerKind: input.ownerKind,
    purpose: oldVersion.purpose,
    publicSchema: currentSchema,
    rubric: oldVersion.rubric,
    materialManifest: oldVersion.materialManifest,
    scoringPolicy: oldVersion.scoringPolicy,
    portfolioPolicy: oldVersion.portfolioPolicy,
    publicationPolicy: oldVersion.publicationPolicy,
    exportPolicy: oldVersion.exportPolicy,
    previewPolicy: oldVersion.previewPolicy,
    datasetReleaseId: oldVersion.datasetReleaseId,
    retentionPolicyId: oldVersion.retentionPolicyId,
    improvementAllowed: oldVersion.improvementAllowed,
    improvementWindowDays: oldVersion.improvementWindowDays,
    supersedesId: oldVersion.id,
    createdBy: "loader:sessions3-5:v1",
    evaluatorChecksum,
  };
  const checksum = assessmentChecksum(nextVersion);
  const existing = await client.assessmentVersion.findUnique({ where: { id: input.newVersionId } });
  if (existing) {
    if (existing.checksumSha256 !== checksum || existing.ownerKind !== input.ownerKind) {
      throw new Error(`Existing ${input.newVersionId} does not match the expected immutable contract.`);
    }
  } else {
    await client.assessmentVersion.create({
      data: {
        id: input.newVersionId,
        assignmentId: assignment.id,
        version: versionNumber,
        ownerKind: input.ownerKind,
        purpose: oldVersion.purpose,
        publicSchema: jsonValue(currentSchema),
        rubric: jsonValue(oldVersion.rubric),
        materialManifest: jsonValue(oldVersion.materialManifest),
        checksumSha256: checksum,
        scoringPolicy: jsonValue(oldVersion.scoringPolicy),
        portfolioPolicy: jsonValue(oldVersion.portfolioPolicy),
        publicationPolicy: jsonValue(oldVersion.publicationPolicy),
        exportPolicy: jsonValue(oldVersion.exportPolicy),
        previewPolicy: jsonValue(oldVersion.previewPolicy),
        datasetReleaseId: oldVersion.datasetReleaseId,
        retentionPolicyId: oldVersion.retentionPolicyId,
        improvementAllowed: oldVersion.improvementAllowed,
        improvementWindowDays: oldVersion.improvementWindowDays,
        supersedesId: oldVersion.id,
        createdBy: "loader:sessions3-5:v1",
      },
    });
    await client.assessmentEvaluatorConfig.create({
      data: {
        id: input.newEvaluatorId,
        assessmentVersionId: input.newVersionId,
        config: jsonValue(oldVersion.evaluatorConfig.config),
        answerKey: oldVersion.evaluatorConfig.answerKey === null ? Prisma.JsonNull : jsonValue(oldVersion.evaluatorConfig.answerKey),
        anchors: oldVersion.evaluatorConfig.anchors === null ? Prisma.JsonNull : jsonValue(oldVersion.evaluatorConfig.anchors),
        normalization: oldVersion.evaluatorConfig.normalization === null ? Prisma.JsonNull : jsonValue(oldVersion.evaluatorConfig.normalization),
        checksumSha256: evaluatorChecksum,
      },
    });
    await client.assessmentVersion.update({
      where: { id: input.newVersionId },
      data: { publishedAt: new Date() },
    });
  }

  await client.assignmentType.update({
    where: { id: assignment.assignmentTypeId },
    data: {
      description: input.description,
      submissionSchema: jsonValue(currentSchema),
      teamBased: input.ownerKind === "team",
      allowSelfReplace: true,
    },
  });
  await client.assignment.update({
    where: { id: assignment.id },
    data: {
      brief: input.brief,
      dueAt: input.dueAt,
      activeAssessmentVersionId: input.newVersionId,
    },
  });
}

async function main() {
  const [app, workflow] = await Promise.all([
    db.assignmentType.findUnique({ where: { slug: "app" }, select: { submissionSchema: true } }),
    db.assignmentType.findUnique({ where: { slug: "workflow" }, select: { submissionSchema: true } }),
  ]);
  if (!app || !workflow) throw new Error("Session 4/5 assignment types are missing.");

  const appSchema = withRequiredField(
    withRequiredField(
      withRequiredField(app.submissionSchema as JsonRecord, "idea", requiredWriteup("idea", "Brief: what is the app idea?"), "githubUrl"),
      "audience", requiredWriteup("audience", "Brief: who is the target audience?"), "githubUrl",
    ),
    "userFlows", requiredWriteup("userFlows", "Brief: what are the key user flows?"), "githubUrl",
  );
  const workflowSchema = withRequiredField(
    workflow.submissionSchema as JsonRecord,
    "recordingUrl",
    requiredLink("recordingUrl", "Loom or live-run screen-recording URL", "Share a recording that explains the workflow and includes a live run proving it works."),
    "runLogFile",
  );

  await db.$transaction(async (tx) => {
    await patchContract({
        client: tx,
        assignmentId: "asg_s4_app",
        typeSlug: "app",
        oldVersionId: "assess_s4_app_v1",
        newVersionId: "assess_s4_app_v2",
        newEvaluatorId: "evalcfg_s4_app_v2",
        ownerKind: "individual",
        schema: appSchema,
        description: "Session 4 hosted web app with an idea, audience, user-flow brief, and evaluator evidence.",
        brief: "By Aug 25, submit your hosted web app URL plus a brief covering the idea, target audience, and key user flows. You may update the submission while the gate is open.",
        dueAt: new Date("2026-08-25T18:29:00Z"),
    });
    await patchContract({
        client: tx,
        assignmentId: "asg_s5_workflow",
        typeSlug: "workflow",
        oldVersionId: "assess_s5_workflow_v1",
        newVersionId: "assess_s5_workflow_v2",
        newEvaluatorId: "evalcfg_s5_workflow_v2",
        ownerKind: "team",
        schema: workflowSchema,
        description: "Session 5 team-owned Make.com workflow with blueprint, evidence, and Loom/live-run proof.",
        brief: "By Aug 30, submit one team-owned Make.com workflow for your sector with the blueprint, existing run evidence, and a Loom/live-run recording that explains the workflow and demonstrates a live run. You may update the team submission while the gate is open.",
        dueAt: new Date("2026-08-30T18:29:00Z"),
    });
  });
  console.log("Session 4/5 submission contracts patched.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
