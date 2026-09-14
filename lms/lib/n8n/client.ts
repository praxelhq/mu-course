// The n8n executions API, read directly — the fallback in SPEC §8.5 item 2.
//
// The intended home for the workflow-run count is Shipped.money: one place
// where every gate signal comes from. Shipped has no n8n source yet, so its
// `checkpoint-signals` returns `workflowRuns: null`, and checkpoint 5 would
// never clear. Until that source lands, this portal counts the runs itself.
//
// The split is deliberate and temporary (docs/DECISIONS.md, 2026-09-15): the
// tracker WINS whenever it has a number (`lib/n8n/merge.ts`), so the day
// Shipped ships its source, this adapter falls silent without a deploy.
//
// It never throws. A workflow-run count that cannot be read is `null`, which
// leaves the gate exactly where it was — the same contract `lib/tracker`
// holds, for the same reason.

const REQUEST_TIMEOUT_MS = 8_000;
const PAGE_SIZE = 100;
export const MAX_PAGES = 10;

/** SPEC §5: the workflow gate opens at ten real runs. */
export const WORKFLOW_RUN_BAR = 10;

export type N8nEnv = Readonly<Record<string, string | undefined>>;

export type N8nFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type N8nConfig = { baseUrl: string; apiKey: string };

/**
 * Configured only when BOTH variables are set. A base URL with no key would
 * fail on every call, and a key with no URL has nowhere to go; either way the
 * honest answer is "this portal does not read n8n", not a stream of errors.
 */
export function n8nConfig(env: N8nEnv = process.env): N8nConfig | null {
  const baseUrl = env.N8N_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const apiKey = env.N8N_API_KEY?.trim() ?? "";
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export function n8nConfigured(env: N8nEnv = process.env): boolean {
  return n8nConfig(env) !== null;
}

type ExecutionRow = { startedAt?: unknown; stoppedAt?: unknown; createdAt?: unknown };

function executionStartedAt(row: ExecutionRow): Date | null {
  for (const value of [row.startedAt, row.createdAt, row.stoppedAt]) {
    if (typeof value === "string") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

/**
 * Count successful executions of one workflow, optionally only those since a
 * date. Pages through `nextCursor` up to `MAX_PAGES`, which bounds one student
 * at a thousand runs — well past the bar, and the count past it only moves the
 * score, never the gate.
 *
 * Returns null on any failure (unset config, HTTP error, timeout, malformed
 * body). Null means "we do not know", which is never "zero".
 */
export async function countSuccessfulExecutions(
  workflowId: string,
  options: { since?: Date; env?: N8nEnv; fetchImpl?: N8nFetch } = {},
): Promise<number | null> {
  const config = n8nConfig(options.env ?? process.env);
  if (!config || !workflowId.trim()) return null;

  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as N8nFetch);
  if (typeof doFetch !== "function") return null;

  let cursor: string | null = null;
  let counted = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      workflowId: workflowId.trim(),
      status: "success",
      limit: String(PAGE_SIZE),
    });
    if (cursor) params.set("cursor", cursor);
    const url = `${config.baseUrl}/api/v1/executions?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let body: unknown;
    try {
      const res = await doFetch(url, {
        method: "GET",
        headers: { "X-N8N-API-KEY": config.apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`[n8n] ${workflowId}: HTTP ${res.status}`);
        return null;
      }
      body = await res.json();
    } catch (err) {
      console.error(
        `[n8n] ${workflowId}: unreachable —`,
        err instanceof Error ? err.message : err,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      console.error(`[n8n] ${workflowId}: malformed response`);
      return null;
    }
    const payload = body as { data?: unknown; nextCursor?: unknown };
    if (!Array.isArray(payload.data)) {
      console.error(`[n8n] ${workflowId}: response has no data array`);
      return null;
    }

    for (const row of payload.data as ExecutionRow[]) {
      if (!row || typeof row !== "object") continue;
      if (options.since) {
        const at = executionStartedAt(row);
        // A row with no readable date is counted: an undated execution is
        // still an execution, and dropping it would under-report the student.
        if (at && at < options.since) continue;
      }
      counted += 1;
    }

    cursor = typeof payload.nextCursor === "string" && payload.nextCursor ? payload.nextCursor : null;
    if (!cursor || payload.data.length === 0) break;
  }

  return counted;
}

// ---------------------------------------------------------------------------
// Whose workflow is it?
// ---------------------------------------------------------------------------
//
// The workflow id on checkpoint 5 is a string a student types, and n8n's
// executions API answers for ANY id the shared instance holds — so typing a
// classmate's id, or a course-wide demo workflow's id, borrowed its run count
// (SEC-2). n8n has no notion of "who owns this workflow" we can read, so the
// student proves it the only way the API exposes: by TAGGING the workflow
// `shipyard:<their product id>`. A tag is per-workflow, visible in the n8n UI,
// and cannot be set on a workflow the student cannot edit.
//
// `workflowData.tags[].name` is on each execution row when the client asks for
// it; it does not here, so the tags are read once per refresh from
// `GET /api/v1/workflows/<id>`.

export type WorkflowTagRead =
  /** The workflow was read; `tags` is what n8n says, possibly empty. */
  | { known: true; tags: string[] }
  /** n8n could not be reached or would not answer. "We do not know." */
  | { known: false; tags: never[] };

const TAGS_UNKNOWN: WorkflowTagRead = { known: false, tags: [] };

function tagNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      if (entry.trim()) out.push(entry.trim());
      continue;
    }
    if (entry && typeof entry === "object") {
      const name = (entry as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) out.push(name.trim());
    }
  }
  return out;
}

/**
 * One workflow's tag names. Never throws; `known: false` means we could not
 * read them, which is not the same as "it has none" and must not be treated as
 * a refusal — see `lib/shipyard/tracker-refresh`.
 */
export async function workflowTags(
  workflowId: string,
  options: { env?: N8nEnv; fetchImpl?: N8nFetch } = {},
): Promise<WorkflowTagRead> {
  const config = n8nConfig(options.env ?? process.env);
  if (!config || !workflowId.trim()) return TAGS_UNKNOWN;
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as N8nFetch);
  if (typeof doFetch !== "function") return TAGS_UNKNOWN;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await doFetch(
      `${config.baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId.trim())}`,
      {
        method: "GET",
        headers: { "X-N8N-API-KEY": config.apiKey, Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error(`[n8n] workflow ${workflowId}: HTTP ${res.status}`);
      return TAGS_UNKNOWN;
    }
    const body = await res.json();
    if (!body || typeof body !== "object") return TAGS_UNKNOWN;
    const payload = body as { tags?: unknown; data?: { tags?: unknown } };
    return { known: true, tags: tagNames(payload.tags ?? payload.data?.tags) };
  } catch (err) {
    console.error(
      `[n8n] workflow ${workflowId}: unreachable —`,
      err instanceof Error ? err.message : err,
    );
    return TAGS_UNKNOWN;
  } finally {
    clearTimeout(timer);
  }
}
