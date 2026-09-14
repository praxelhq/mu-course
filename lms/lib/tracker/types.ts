// The typed shape of everything this portal learns about a student's real
// numbers. It comes from Shipped.money's `checkpoint-signals` endpoint and
// nowhere else — no student-typed field ever becomes a signal.
//
// Provenance: the tracker computes these from its VERIFIED tier only. Its
// Derived and Declared tiers never reach us and never clear a gate.

import { z } from "zod";

export const trackerSignalsSchema = z.object({
  /** A real payment provider is live, not a sandbox key. */
  paymentsLive: z.boolean(),
  /** The product is wired into the tracker, so numbers flow on their own. */
  trackerConnected: z.boolean(),
  /** Ten or more real workflow runs have completed. */
  workflowTenRuns: z.boolean(),
  /** At least one paying customer who is not the builder. */
  hasPayingCustomer: z.boolean(),
  payingCustomers: z.number().int().nonnegative(),
  /** MINOR UNITS (USD cents), as the tracker reports them. Format on display. */
  grossTotal: z.number().nonnegative(),
  /** MINOR UNITS (USD cents). */
  netTotal: z.number().nonnegative(),
  currency: z.string().min(1),
  /** Present once the tracker has a workflow source for this product. */
  workflowRuns: z.number().int().nonnegative().optional(),
  /**
   * Anti-gaming flag CODES the tracker raised. Opaque strings — this portal
   * never interprets them, only counts them.
   * A non-empty list makes EVERY metric signal false — see lib/shipyard/gates.
   * This portal trusts the tracker's integrity checks rather than repeating
   * them.
   */
  blockingFlags: z.array(z.string()),
  fetchedAt: z.string(),
  source: z.literal("verified"),
});

export type TrackerSignals = z.infer<typeof trackerSignalsSchema>;

/** Signal names a checkpoint may require. `noBlockingFlags` is derived. */
export const METRIC_SIGNAL_NAMES = [
  "paymentsLive",
  "trackerConnected",
  "workflowTenRuns",
  "hasPayingCustomer",
  "noBlockingFlags",
] as const;

export type MetricSignalName = (typeof METRIC_SIGNAL_NAMES)[number];

export function isMetricSignalName(value: string): value is MetricSignalName {
  return (METRIC_SIGNAL_NAMES as readonly string[]).includes(value);
}

/** All-false, zero-valued signals: what an unconnected product looks like. */
export function emptySignals(fetchedAt: Date = new Date()): TrackerSignals {
  return {
    paymentsLive: false,
    trackerConnected: false,
    workflowTenRuns: false,
    hasPayingCustomer: false,
    payingCustomers: 0,
    grossTotal: 0,
    netTotal: 0,
    currency: "USD",
    workflowRuns: 0,
    blockingFlags: [],
    fetchedAt: fetchedAt.toISOString(),
    source: "verified",
  };
}
