import { describe, expect, it, vi } from "vitest";
import {
  countSuccessfulExecutions,
  MAX_PAGES,
  n8nConfigured,
  WORKFLOW_RUN_BAR,
  type N8nFetch,
} from "@/lib/n8n/client";
import { mergeWorkflowRuns, mergeWorkflowRunsDetailed } from "@/lib/n8n/merge";
import { emptySignals, type TrackerSignals } from "@/lib/tracker/types";

const ENV = { N8N_BASE_URL: "https://n8n.example.com", N8N_API_KEY: "key-123" };

function respond(pages: { data: unknown[]; nextCursor?: string | null }[]): {
  fetchImpl: N8nFetch;
  calls: string[];
  headers: Record<string, string>[];
} {
  const calls: string[] = [];
  const headers: Record<string, string>[] = [];
  let page = 0;
  const fetchImpl: N8nFetch = async (url, init) => {
    calls.push(url);
    headers.push(init?.headers ?? {});
    const body = pages[Math.min(page, pages.length - 1)];
    page += 1;
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, calls, headers };
}

const execution = (startedAt: string) => ({ id: startedAt, startedAt, status: "success" });

describe("n8nConfigured", () => {
  it("needs both the base URL and the key", () => {
    expect(n8nConfigured(ENV)).toBe(true);
    expect(n8nConfigured({ N8N_BASE_URL: ENV.N8N_BASE_URL })).toBe(false);
    expect(n8nConfigured({ N8N_API_KEY: ENV.N8N_API_KEY })).toBe(false);
    expect(n8nConfigured({})).toBe(false);
  });
});

describe("countSuccessfulExecutions", () => {
  it("asks for successes of one workflow, with the API key in the header", async () => {
    const { fetchImpl, calls, headers } = respond([
      { data: [execution("2026-09-01T10:00:00Z"), execution("2026-09-02T10:00:00Z")] },
    ]);
    const runs = await countSuccessfulExecutions("wf_1", { env: ENV, fetchImpl });

    expect(runs).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("https://n8n.example.com/api/v1/executions?");
    expect(calls[0]).toContain("workflowId=wf_1");
    expect(calls[0]).toContain("status=success");
    expect(headers[0]["X-N8N-API-KEY"]).toBe("key-123");
  });

  it("follows nextCursor and stops when the cursor runs out", async () => {
    const { fetchImpl, calls } = respond([
      { data: [execution("2026-09-01T10:00:00Z")], nextCursor: "c2" },
      { data: [execution("2026-09-02T10:00:00Z")], nextCursor: "c3" },
      { data: [execution("2026-09-03T10:00:00Z")], nextCursor: null },
    ]);
    expect(await countSuccessfulExecutions("wf_1", { env: ENV, fetchImpl })).toBe(3);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("cursor=c2");
  });

  it("stops at ten pages rather than following a cursor forever", async () => {
    const { fetchImpl, calls } = respond([
      { data: Array.from({ length: 100 }, (_, i) => execution(`2026-09-01T10:00:${i}Z`)), nextCursor: "next" },
    ]);
    const runs = await countSuccessfulExecutions("wf_1", { env: ENV, fetchImpl });
    expect(calls).toHaveLength(MAX_PAGES);
    expect(runs).toBe(100 * MAX_PAGES);
  });

  it("filters by `since` when one is given", async () => {
    const { fetchImpl } = respond([
      {
        data: [
          execution("2026-08-01T10:00:00Z"),
          execution("2026-09-10T10:00:00Z"),
          execution("2026-09-11T10:00:00Z"),
        ],
      },
    ]);
    const runs = await countSuccessfulExecutions("wf_1", {
      env: ENV,
      fetchImpl,
      since: new Date("2026-09-01T00:00:00Z"),
    });
    expect(runs).toBe(2);
  });

  it("is null, never zero, when it cannot read", async () => {
    const httpError: N8nFetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const thrown: N8nFetch = async () => {
      throw new Error("ETIMEDOUT");
    };
    const garbage: N8nFetch = async () => ({ ok: true, status: 200, json: async () => "nope" });
    const noData: N8nFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await countSuccessfulExecutions("wf_1", { env: ENV, fetchImpl: httpError })).toBeNull();
    expect(await countSuccessfulExecutions("wf_1", { env: ENV, fetchImpl: thrown })).toBeNull();
    expect(await countSuccessfulExecutions("wf_1", { env: ENV, fetchImpl: garbage })).toBeNull();
    expect(await countSuccessfulExecutions("wf_1", { env: ENV, fetchImpl: noData })).toBeNull();
    vi.restoreAllMocks();
  });

  it("does not call at all when it is not configured, or has no workflow id", async () => {
    const { fetchImpl, calls } = respond([{ data: [] }]);
    expect(await countSuccessfulExecutions("wf_1", { env: {}, fetchImpl })).toBeNull();
    expect(await countSuccessfulExecutions("  ", { env: ENV, fetchImpl })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("mergeWorkflowRuns", () => {
  const withRuns = (workflowRuns: number | undefined): TrackerSignals => ({
    ...emptySignals(new Date("2026-09-01T00:00:00Z")),
    workflowRuns,
    workflowTenRuns: false,
  });

  it("fills the gap when the tracker has no number of its own", () => {
    const merged = mergeWorkflowRunsDetailed(withRuns(undefined), 7);
    expect(merged.merged).toBe(true);
    expect(merged.signals.workflowRuns).toBe(7);
    expect(merged.signals.workflowTenRuns).toBe(false);

    const cleared = mergeWorkflowRuns(withRuns(undefined), WORKFLOW_RUN_BAR);
    expect(cleared.workflowRuns).toBe(10);
    expect(cleared.workflowTenRuns).toBe(true);
  });

  it("lets the tracker win the moment it reports a number", () => {
    const signals = withRuns(3);
    const merged = mergeWorkflowRunsDetailed(signals, 99);
    expect(merged.merged).toBe(false);
    expect(merged.signals).toBe(signals);
    expect(merged.signals.workflowRuns).toBe(3);
    // Even a tracker zero wins: zero is an answer, null is not.
    expect(mergeWorkflowRuns(withRuns(0), 40).workflowRuns).toBe(0);
  });

  it("changes nothing when the local count is unknown or nonsense", () => {
    const signals = withRuns(undefined);
    expect(mergeWorkflowRunsDetailed(signals, null).merged).toBe(false);
    expect(mergeWorkflowRunsDetailed(signals, undefined).merged).toBe(false);
    expect(mergeWorkflowRunsDetailed(signals, -1).merged).toBe(false);
    expect(mergeWorkflowRunsDetailed(signals, Number.NaN).merged).toBe(false);
    expect(mergeWorkflowRuns(signals, null).workflowRuns).toBeUndefined();
  });

  it("never mutates the signals it was handed", () => {
    const signals = withRuns(undefined);
    const merged = mergeWorkflowRuns(signals, 12);
    expect(signals.workflowRuns).toBeUndefined();
    expect(signals.workflowTenRuns).toBe(false);
    expect(merged.workflowTenRuns).toBe(true);
  });
});
