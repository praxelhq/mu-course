import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../lib/auth";
import {
  AssessmentResultFinalisationError,
  finaliseAssessmentResult,
  type AssessmentResultFinalisationContext,
  type AssessmentResultFinalisationStore,
} from "../lib/assessment-result-finalisation";

const initialUpdatedAt = new Date("2026-08-01T10:00:00.000Z");

const publicPolicy = {
  wall: "app",
  consentField: "publishConsent",
  captionField: "caption",
  publicTextFields: ["summary"],
  previewRole: "screenshot",
  actions: [],
};

function finalisationContext(
  patch: {
    result?: Partial<AssessmentResultFinalisationContext["result"]>;
    submission?: Partial<AssessmentResultFinalisationContext["submission"]>;
    assessmentVersion?: Partial<
      NonNullable<AssessmentResultFinalisationContext["assessmentVersion"]>
    > | null;
    hasFinalGrade?: boolean;
    hasOpenHold?: boolean;
    hasOpenAppeal?: boolean;
  } = {},
): AssessmentResultFinalisationContext {
  const base: AssessmentResultFinalisationContext = {
    result: {
      id: "result-1",
      submissionId: "submission-1",
      assessmentVersionId: "assessment-v2",
      ownerKind: "individual",
      ownerId: "student-1",
      version: 2,
      attempt: 1,
      purpose: "graded",
      status: "completed",
      scoreable: false,
      publishable: false,
      completedAt: new Date("2026-08-01T09:00:00.000Z"),
      updatedAt: initialUpdatedAt,
    },
    submission: {
      id: "submission-1",
      status: "finalised",
      assessmentVersionId: "assessment-v2",
      ownerKind: "individual",
      ownerId: "student-1",
      version: 2,
      attempt: 1,
      contractMode: "versioned",
    },
    assessmentVersion: {
      id: "assessment-v2",
      purpose: "graded",
      publishedAt: new Date("2026-07-30T00:00:00.000Z"),
      publicationPolicy: publicPolicy,
    },
    hasFinalGrade: true,
    hasOpenHold: false,
    hasOpenAppeal: false,
  };
  return {
    ...base,
    result: { ...base.result, ...patch.result },
    submission: { ...base.submission, ...patch.submission },
    assessmentVersion:
      patch.assessmentVersion === null
        ? null
        : { ...base.assessmentVersion!, ...patch.assessmentVersion },
    hasFinalGrade: patch.hasFinalGrade ?? base.hasFinalGrade,
    hasOpenHold: patch.hasOpenHold ?? base.hasOpenHold,
    hasOpenAppeal: patch.hasOpenAppeal ?? base.hasOpenAppeal,
  };
}

function harness(initial = finalisationContext()) {
  const context = structuredClone(initial);
  const audits: Parameters<AssessmentResultFinalisationStore["createAudit"]>[0][] = [];
  const reconcilePublication = vi.fn().mockResolvedValue(undefined);
  const store: AssessmentResultFinalisationStore = {
    getContext: async (id) => (id === context.result.id ? structuredClone(context) : null),
    compareAndSetResult: async (input) => {
      if (
        context.result.id !== input.id ||
        context.result.updatedAt.getTime() !== input.expectedUpdatedAt.getTime() ||
        context.result.status !== input.expectedStatus ||
        context.result.scoreable !== input.expectedScoreable ||
        context.result.publishable !== input.expectedPublishable
      ) {
        return null;
      }
      context.result = {
        ...context.result,
        scoreable: input.scoreable,
        publishable: input.publishable,
        updatedAt: new Date(context.result.updatedAt.getTime() + 1_000),
      };
      return structuredClone(context.result);
    },
    createAudit: async (entry) => {
      audits.push(entry);
    },
  };
  const deps = {
    transaction: async <T>(work: (tx: AssessmentResultFinalisationStore) => Promise<T>) =>
      work(store),
    reconcilePublication,
  };
  return {
    audits,
    deps,
    reconcilePublication,
    current: () => structuredClone(context),
  };
}

const instructor = {
  userId: "instructor-1",
  role: "instructor" as const,
};

function requestInput() {
  return {
    resultId: "result-1",
    expectedUpdatedAt: initialUpdatedAt,
    reason: "All holds were reviewed against the final grade.",
    actor: instructor,
  };
}

describe("assessment result finalisation", () => {
  it("atomically enables scoring and policy eligibility, audits, then reconciles publication", async () => {
    const h = harness();
    const outcome = await finaliseAssessmentResult(requestInput(), h.deps);

    expect(outcome).toMatchObject({
      changed: true,
      result: { scoreable: true, publishable: true, status: "completed" },
    });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      actorId: "instructor-1",
      action: "assessment-result.finalise",
      targetId: "result-1",
    });
    expect(h.audits[0].after).toMatchObject({
      submissionId: "submission-1",
      assessmentVersionId: "assessment-v2",
      version: 2,
      attempt: 1,
    });
    expect(h.reconcilePublication).toHaveBeenCalledOnce();
    expect(h.reconcilePublication).toHaveBeenCalledWith("submission-1");
  });

  it("makes a deliberately private result scoreable but not publishable", async () => {
    const h = harness(finalisationContext({ assessmentVersion: { publicationPolicy: {} } }));
    const outcome = await finaliseAssessmentResult(requestInput(), h.deps);

    expect(outcome.result).toMatchObject({ scoreable: true, publishable: false });
  });

  it.each([
    ["binding mismatch", finalisationContext({ result: { version: 1 } })],
    ["incomplete result", finalisationContext({ result: { status: "provider_pending" } })],
    [
      "repair-required result",
      finalisationContext({ result: { status: "repair_required" } }),
    ],
    [
      "formative result",
      finalisationContext({
        result: { purpose: "formative" },
        assessmentVersion: { purpose: "formative" },
      }),
    ],
    ["unpublished contract", finalisationContext({ assessmentVersion: { publishedAt: null } })],
    ["non-final submission", finalisationContext({ submission: { status: "graded" } })],
    ["no final grade", finalisationContext({ hasFinalGrade: false })],
    ["open hold", finalisationContext({ hasOpenHold: true })],
    ["open appeal", finalisationContext({ hasOpenAppeal: true })],
  ])("rejects %s", async (_label, context) => {
    const h = harness(context);
    await expect(finaliseAssessmentResult(requestInput(), h.deps)).rejects.toMatchObject({
      status: 409,
    });
    expect(h.audits).toHaveLength(0);
    expect(h.reconcilePublication).not.toHaveBeenCalled();
  });

  it("rejects student callers and stale optimistic timestamps", async () => {
    const h = harness();
    await expect(
      finaliseAssessmentResult(
        { ...requestInput(), actor: { userId: "student-1", role: "student" } },
        h.deps,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      finaliseAssessmentResult(
        { ...requestInput(), expectedUpdatedAt: new Date("2026-08-01T09:59:00.000Z") },
        h.deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("is idempotent with a stale repeat and does not duplicate audit or reconciliation", async () => {
    const h = harness();
    expect((await finaliseAssessmentResult(requestInput(), h.deps)).changed).toBe(true);
    expect((await finaliseAssessmentResult(requestInput(), h.deps)).changed).toBe(false);
    expect(h.audits).toHaveLength(1);
    expect(h.reconcilePublication).toHaveBeenCalledOnce();
  });

  it("collapses concurrent identical requests into one transition", async () => {
    const h = harness();
    const outcomes = await Promise.all([
      finaliseAssessmentResult(requestInput(), h.deps),
      finaliseAssessmentResult(requestInput(), h.deps),
    ]);
    expect(outcomes.map((outcome) => outcome.changed).sort()).toEqual([false, true]);
    expect(h.audits).toHaveLength(1);
    expect(h.current().result).toMatchObject({ scoreable: true, publishable: true });
  });

  it("keeps reconciliation failure best-effort after the committed transition", async () => {
    const h = harness();
    h.reconcilePublication.mockRejectedValueOnce(new Error("projection unavailable"));
    await expect(finaliseAssessmentResult(requestInput(), h.deps)).resolves.toMatchObject({
      changed: true,
    });
    expect(h.current().result.scoreable).toBe(true);
  });
});

function apiRequest(body: unknown): Request {
  return new Request("http://test.local/api/instructor/assessment-results/finalise", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const studentSession: SessionUser = {
  userId: "student-1",
  email: "student@example.edu",
  role: "student",
  sectionId: "section-a",
  teamId: null,
};

const instructorSession: SessionUser = {
  userId: "instructor-1",
  email: "instructor@example.edu",
  role: "instructor",
  sectionId: null,
  teamId: null,
};

describe("assessment result finalisation route", () => {
  it("requires staff and rejects unknown body keys", async () => {
    const { createAssessmentResultFinalisationHandler } = await import(
      "../app/api/instructor/assessment-results/finalise/route"
    );
    const finalise = vi.fn();
    const body = {
      resultId: "result-1",
      expectedUpdatedAt: initialUpdatedAt.toISOString(),
      reason: "Reviewed.",
    };
    const studentHandler = createAssessmentResultFinalisationHandler({
      getUser: async () => studentSession,
      finalise,
    });
    expect((await studentHandler(apiRequest(body))).status).toBe(403);

    const instructorHandler = createAssessmentResultFinalisationHandler({
      getUser: async () => instructorSession,
      finalise,
    });
    expect((await instructorHandler(apiRequest({ ...body, publishable: true }))).status).toBe(400);
    expect(finalise).not.toHaveBeenCalled();
  });

  it("derives the actor and maps domain conflicts", async () => {
    const { createAssessmentResultFinalisationHandler } = await import(
      "../app/api/instructor/assessment-results/finalise/route"
    );
    const finalise = vi.fn().mockResolvedValue({ changed: true, result: { id: "result-1" } });
    const handler = createAssessmentResultFinalisationHandler({
      getUser: async () => instructorSession,
      finalise,
    });
    const body = {
      resultId: "result-1",
      expectedUpdatedAt: initialUpdatedAt.toISOString(),
      reason: "Reviewed.",
    };
    expect((await handler(apiRequest(body))).status).toBe(200);
    expect(finalise).toHaveBeenCalledWith({
      resultId: "result-1",
      expectedUpdatedAt: initialUpdatedAt,
      reason: "Reviewed.",
      actor: instructor,
    });

    finalise.mockRejectedValueOnce(
      new AssessmentResultFinalisationError(409, "Assessment result changed"),
    );
    expect((await handler(apiRequest(body))).status).toBe(409);
  });
});
