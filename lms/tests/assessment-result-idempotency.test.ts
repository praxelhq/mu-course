import { describe, expect, it } from "vitest";
import {
  EvaluationKeyConflictError,
  STALE_ASSESSMENT_CLAIM_STATUSES,
  claimAssessmentResult,
  type AssessmentClaimRecord,
  type AssessmentClaimStore,
} from "../lib/assessments/claim-result";

type InMemoryClaimRecord = AssessmentClaimRecord & {
  deterministicResult?: unknown;
};

function inMemoryStore(initial: InMemoryClaimRecord[] = []): AssessmentClaimStore {
  const records = new Map(initial.map((record) => [record.evaluationKey, record]));
  return {
    async create(input) {
      await Promise.resolve();
      if (records.has(input.evaluationKey)) throw new EvaluationKeyConflictError();
      const record: AssessmentClaimRecord = {
        id: `result-${records.size + 1}`,
        evaluationKey: input.evaluationKey,
        status: "claimed",
        claimToken: input.claimToken,
        claimedAt: input.claimedAt,
      };
      records.set(input.evaluationKey, record);
      return record;
    },
    async find(evaluationKey) {
      return records.get(evaluationKey) ?? null;
    },
    async reclaim(input) {
      const current = records.get(input.evaluationKey);
      if (!current) return null;
      const reclaimable =
        current.status === "pending" ||
        current.status === "failed" ||
        (STALE_ASSESSMENT_CLAIM_STATUSES.some((status) => status === current.status) &&
          current.claimedAt !== null &&
          current.claimedAt < input.staleBefore);
      if (!reclaimable || current.claimToken !== input.expectedClaimToken) return null;
      const updated = {
        ...current,
        status: "claimed" as const,
        claimToken: input.claimToken,
        claimedAt: input.claimedAt,
      };
      records.set(input.evaluationKey, updated);
      return updated;
    },
    isUniqueConflict(error) {
      return error instanceof EvaluationKeyConflictError;
    },
  };
}

describe("AssessmentResult atomic claims", () => {
  it("allows exactly one concurrent claimant for one immutable evaluation key", async () => {
    const store = inMemoryStore();
    const now = new Date("2026-07-30T10:00:00Z");
    const outcomes = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        claimAssessmentResult(
          {
            evaluationKey: "assessment:sub-1:version-1:attempt-1",
            claimToken: `claim-${index}`,
            now,
            staleAfterMs: 15 * 60_000,
          },
          store,
        ),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.kind === "claimed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "busy")).toHaveLength(24);
  });

  it("does not reclaim terminal results, but reclaims a failed or stale claim atomically", async () => {
    const now = new Date("2026-07-30T10:30:00Z");
    for (const status of ["completed", "repair_required", "dead_lettered"] as const) {
      const record: AssessmentClaimRecord = {
        id: status,
        evaluationKey: `key-${status}`,
        status,
        claimToken: "old",
        claimedAt: new Date("2026-07-30T10:00:00Z"),
      };
      const store: AssessmentClaimStore = {
        create: async () => {
          throw new EvaluationKeyConflictError();
        },
        find: async () => record,
        reclaim: async () => {
          throw new Error("terminal results must never reach reclaim");
        },
        isUniqueConflict: (error) => error instanceof EvaluationKeyConflictError,
      };
      await expect(
        claimAssessmentResult(
          { evaluationKey: record.evaluationKey, claimToken: "new", now, staleAfterMs: 1 },
          store,
        ),
      ).resolves.toEqual({ kind: "completed", resultId: status, status });
    }
  });

  it.each(["deterministic_complete", "provider_pending"] as const)(
    "reclaims a stale %s crash boundary without replacing deterministic evidence",
    async (status) => {
      const deterministicResult = {
        objective: { totalCount: 1, correctCount: 1 },
        dimensions: { functionality: { score: 10, rationale: "checksum-bound" } },
      };
      const record: InMemoryClaimRecord = {
        id: `result-${status}`,
        evaluationKey: `key-${status}`,
        status,
        claimToken: "crashed-worker",
        claimedAt: new Date("2026-07-30T10:00:00Z"),
        deterministicResult,
      };
      const store = inMemoryStore([record]);

      const outcomes = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          claimAssessmentResult(
            {
              evaluationKey: record.evaluationKey,
              claimToken: `replacement-worker-${index}`,
              now: new Date("2026-07-30T10:30:00Z"),
              staleAfterMs: 15 * 60_000,
            },
            store,
          ),
        ),
      );
      const claimed = outcomes.filter((outcome) => outcome.kind === "claimed");
      expect(claimed).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.kind === "busy")).toHaveLength(7);
      const winner = claimed[0];
      expect(winner).toMatchObject({ kind: "claimed", resultId: record.id });
      await expect(store.find(record.evaluationKey)).resolves.toMatchObject({
        id: record.id,
        status: "claimed",
        claimToken: winner?.kind === "claimed" ? winner.claimToken : "unreachable",
        deterministicResult,
      });
    },
  );

  it.each(["deterministic_complete", "provider_pending"] as const)(
    "does not steal a fresh %s claim",
    async (status) => {
      const record: InMemoryClaimRecord = {
        id: `result-${status}`,
        evaluationKey: `key-${status}`,
        status,
        claimToken: "active-worker",
        claimedAt: new Date("2026-07-30T10:20:00Z"),
        deterministicResult: { objective: { totalCount: 1 } },
      };
      const store = inMemoryStore([record]);

      await expect(
        claimAssessmentResult(
          {
            evaluationKey: record.evaluationKey,
            claimToken: "contending-worker",
            now: new Date("2026-07-30T10:30:00Z"),
            staleAfterMs: 15 * 60_000,
          },
          store,
        ),
      ).resolves.toEqual({ kind: "busy", resultId: record.id });
      await expect(store.find(record.evaluationKey)).resolves.toMatchObject({
        status,
        claimToken: "active-worker",
      });
    },
  );
});
