import { describe, expect, it } from "vitest";
import { resolveStudentSubmissionSchemas } from "../lib/submissions";

const legacySchema = {
  fields: [{ key: "legacyNote", label: "Legacy note", kind: "text", required: true }],
};
const v1Schema = {
  fields: [{ key: "v1Evidence", label: "V1 evidence", kind: "file", required: true }],
};
const v2Schema = {
  fields: [{ key: "v2Evidence", label: "V2 evidence", kind: "file", required: true }],
};

const activeV2 = {
  id: "assessment-v2",
  assignmentId: "assignment-1",
  publishedAt: new Date("2026-07-30T00:00:00Z"),
  publicSchema: v2Schema,
};

const boundV1 = {
  assessmentVersionId: "assessment-v1",
  assessmentVersion: {
    id: "assessment-v1",
    assignmentId: "assignment-1",
    publicSchema: v1Schema,
  },
};

describe("student submission render-schema binding", () => {
  it("renders an existing draft and historical receipt from their own immutable versions", () => {
    const resolved = resolveStudentSubmissionSchemas({
      assignmentId: "assignment-1",
      contractMode: "versioned",
      assignmentTypeSchema: legacySchema,
      activeAssessmentVersion: activeV2,
      history: [boundV1],
      latestSubmitted: boundV1,
    });

    expect(resolved.formSchema?.fields.map((field) => field.key)).toEqual(["v1Evidence"]);
    expect(resolved.submittedSchema?.fields.map((field) => field.key)).toEqual(["v1Evidence"]);
  });

  it("uses the active published version only when no bound draft or history exists", () => {
    const resolved = resolveStudentSubmissionSchemas({
      assignmentId: "assignment-1",
      contractMode: "versioned",
      assignmentTypeSchema: legacySchema,
      activeAssessmentVersion: activeV2,
      history: [],
      latestSubmitted: null,
    });

    expect(resolved.formSchema?.fields.map((field) => field.key)).toEqual(["v2Evidence"]);
    expect(resolved.submittedSchema).toBeNull();
  });

  it("keeps a newer draft schema separate from an older submitted receipt schema", () => {
    const boundV2Draft = {
      assessmentVersionId: "assessment-v2",
      assessmentVersion: {
        id: "assessment-v2",
        assignmentId: "assignment-1",
        publicSchema: v2Schema,
      },
    };
    const resolved = resolveStudentSubmissionSchemas({
      assignmentId: "assignment-1",
      contractMode: "versioned",
      assignmentTypeSchema: legacySchema,
      activeAssessmentVersion: activeV2,
      history: [boundV2Draft, boundV1],
      latestSubmitted: boundV1,
    });

    expect(resolved.formSchema?.fields.map((field) => field.key)).toEqual(["v2Evidence"]);
    expect(resolved.submittedSchema?.fields.map((field) => field.key)).toEqual(["v1Evidence"]);
  });

  it("fails closed on a missing or mismatched bound version instead of falling back active", () => {
    for (const existing of [
      { assessmentVersionId: "assessment-v1", assessmentVersion: null },
      {
        assessmentVersionId: "assessment-v1",
        assessmentVersion: {
          id: "assessment-v1",
          assignmentId: "other-assignment",
          publicSchema: v1Schema,
        },
      },
    ]) {
      const resolved = resolveStudentSubmissionSchemas({
        assignmentId: "assignment-1",
        contractMode: "versioned",
        assignmentTypeSchema: legacySchema,
        activeAssessmentVersion: activeV2,
        history: [existing],
        latestSubmitted: existing,
      });
      expect(resolved).toEqual({ formSchema: null, submittedSchema: null });
    }
  });

  it("renders an unbound legacy receipt with its AssignmentType schema after an upgrade", () => {
    const legacyReceipt = { assessmentVersionId: null, assessmentVersion: null };
    const resolved = resolveStudentSubmissionSchemas({
      assignmentId: "assignment-1",
      contractMode: "versioned",
      assignmentTypeSchema: legacySchema,
      activeAssessmentVersion: activeV2,
      history: [legacyReceipt],
      latestSubmitted: legacyReceipt,
    });

    expect(resolved.formSchema?.fields.map((field) => field.key)).toEqual(["legacyNote"]);
    expect(resolved.submittedSchema?.fields.map((field) => field.key)).toEqual(["legacyNote"]);
  });
});
