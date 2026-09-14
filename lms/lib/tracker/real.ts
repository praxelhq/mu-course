// Shipped.money's `checkpoint-signals` read API, service to service.
//
// CONTRACT (agreed with the shipped-money owner, 2026-09-14; the endpoint is
// being added there in parallel):
//   GET {SHIPPED_MONEY_BASE_URL}/api/v1/checkpoint-signals?projectId=<slug>
//   Authorization:        Bearer {SHIPPED_MONEY_SERVICE_TOKEN}
//   X-Shipyard-Timestamp: unix SECONDS
//   X-Shipyard-Signature: lowercase hex HMAC-SHA256, keyed with the service
//                         token, over the string `${timestamp}:${projectId}`
//   200 -> the wire shape below; 404 -> the project is not on the tracker;
//   401/403 -> our credentials are wrong.
//
// `trackerProductId` is the project's Shipped.money SLUG — the last segment of
// the https://…/p/<slug> URL a student pastes in to connect.
//
// The token alone is not enough: the signature means a leaked bearer token
// replayed from elsewhere still fails the tracker's own check.
//
// This module never throws at its callers. A tracker outage on a deadline
// night must leave every gate exactly where it was, not crash the spine.

import { createHmac } from "node:crypto";
import { z } from "zod";
import type { TrackerSignals } from "./types";
import type { TrackerClient } from "./client";

const REQUEST_TIMEOUT_MS = 8_000;

/** `${unixSeconds}:${projectId}`, HMAC-SHA256 with the service token, hex. */
export function signSignalsRequest(
  token: string,
  timestamp: string,
  projectId: string,
): string {
  return createHmac("sha256", token).update(`${timestamp}:${projectId}`).digest("hex");
}

/**
 * The wire shape. Deliberately tolerant of extra fields: the tracker is a
 * separate service on its own release cadence, and a new field there must not
 * turn every gate read in this portal into a null.
 */
export const checkpointSignalsResponseSchema = z
  .object({
    projectId: z.string().optional(),
    slug: z.string().optional(),
    paymentsLive: z.boolean(),
    trackerConnected: z.boolean(),
    hasPayingCustomer: z.boolean(),
    payingCustomers: z.number().int().nonnegative(),
    /** USD minor units (cents). */
    grossTotal: z.number().nonnegative(),
    netTotal: z.number().nonnegative(),
    currency: z.string().min(1).default("USD"),
    workflowTenRuns: z.boolean(),
    workflowRuns: z.number().int().nonnegative().nullable().optional(),
    blockingFlags: z.array(z.string()),
    flags: z
      .array(
        z
          .object({ code: z.string(), blocking: z.boolean(), detail: z.string().optional() })
          .loose(),
      )
      .optional(),
    asOf: z.string().optional(),
  })
  .loose();

export type CheckpointSignalsResponse = z.infer<typeof checkpointSignalsResponseSchema>;

/** Wire shape -> the portal's internal signal type. Verified data only. */
export function toTrackerSignals(wire: CheckpointSignalsResponse): TrackerSignals {
  return {
    paymentsLive: wire.paymentsLive,
    trackerConnected: wire.trackerConnected,
    workflowTenRuns: wire.workflowTenRuns,
    hasPayingCustomer: wire.hasPayingCustomer,
    payingCustomers: wire.payingCustomers,
    grossTotal: wire.grossTotal,
    netTotal: wire.netTotal,
    currency: wire.currency,
    workflowRuns: wire.workflowRuns ?? undefined,
    blockingFlags: wire.blockingFlags,
    fetchedAt: wire.asOf ?? new Date().toISOString(),
    source: "verified",
  };
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export function createRealTrackerClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl?: FetchLike,
): TrackerClient {
  const baseUrl = env.SHIPPED_MONEY_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const token = env.SHIPPED_MONEY_SERVICE_TOKEN?.trim() ?? "";
  const doFetch = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  // Our own credentials being wrong is one incident, not one per student.
  let authErrorLogged = false;

  return {
    async getCheckpointSignals(trackerProductId) {
      if (!trackerProductId) return null;
      if (!baseUrl || !token) {
        console.error("[tracker] real mode needs SHIPPED_MONEY_BASE_URL and _SERVICE_TOKEN");
        return null;
      }

      const timestamp = String(Math.floor(Date.now() / 1000));
      const url = `${baseUrl}/api/v1/checkpoint-signals?projectId=${encodeURIComponent(trackerProductId)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await doFetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Shipyard-Timestamp": timestamp,
            "X-Shipyard-Signature": signSignalsRequest(token, timestamp, trackerProductId),
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        if (res.status === 404) return null; // not a project on the tracker
        if (res.status === 401 || res.status === 403) {
          if (!authErrorLogged) {
            authErrorLogged = true;
            console.error(`[tracker] service token rejected (HTTP ${res.status})`);
          }
          return null;
        }
        if (!res.ok) {
          console.error(`[tracker] ${trackerProductId}: HTTP ${res.status}`);
          return null;
        }
        const parsed = checkpointSignalsResponseSchema.safeParse(await res.json());
        if (!parsed.success) {
          console.error(`[tracker] ${trackerProductId}: malformed signals`, parsed.error.message);
          return null;
        }
        return toTrackerSignals(parsed.data);
      } catch (err) {
        console.error(
          `[tracker] ${trackerProductId}: unreachable —`,
          err instanceof Error ? err.message : err,
        );
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
