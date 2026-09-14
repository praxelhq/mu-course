import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { resolveTrackerMode } from "@/lib/tracker/client";
import {
  checkpointSignalsResponseSchema,
  createRealTrackerClient,
  signSignalsRequest,
  toTrackerSignals,
  type FetchLike,
} from "@/lib/tracker/real";
import {
  createFakeTrackerClient,
  FakeTrackerDisabledError,
  setFakeSignals,
} from "@/lib/tracker/fake";
import { emptySignals, isMetricSignalName, trackerSignalsSchema } from "@/lib/tracker/types";

const WIRE = {
  projectId: "proj_1",
  slug: "ledgerdesk",
  paymentsLive: true,
  trackerConnected: true,
  hasPayingCustomer: true,
  payingCustomers: 3,
  grossTotal: 14_700,
  netTotal: 13_830,
  currency: "USD",
  workflowTenRuns: true,
  workflowRuns: 14,
  blockingFlags: [] as string[],
  flags: [{ code: "high_refund_rate", blocking: false, detail: "2 of 9 refunded" }],
  asOf: "2026-09-14T09:00:00.000Z",
};

function stubFetch(status: number, payload: unknown) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    return { ok: status < 400, status, json: async () => payload };
  };
  return { calls, impl };
}

describe("tracker mode", () => {
  it("defaults to fake unless a base URL is configured", () => {
    expect(resolveTrackerMode({})).toBe("fake");
    expect(resolveTrackerMode({ SHIPPED_MONEY_BASE_URL: "https://x.example.com" })).toBe("real");
    expect(resolveTrackerMode({ TRACKER_MODE: "fake", SHIPPED_MONEY_BASE_URL: "https://x" })).toBe(
      "fake",
    );
    expect(resolveTrackerMode({ TRACKER_MODE: " REAL " })).toBe("real");
    expect(resolveTrackerMode({ TRACKER_MODE: "nonsense" })).toBe("fake");
  });
});

describe("signal names and the empty shape", () => {
  it("knows exactly the five signal names a checkpoint may require", () => {
    for (const name of [
      "paymentsLive",
      "trackerConnected",
      "workflowTenRuns",
      "hasPayingCustomer",
      "noBlockingFlags",
    ]) {
      expect(isMetricSignalName(name), name).toBe(true);
    }
    expect(isMetricSignalName("revenueGrowth")).toBe(false);
  });

  it("an unconnected product reads as all-false and zero, and validates", () => {
    const empty = emptySignals(new Date("2026-09-14T12:00:00Z"));
    expect(trackerSignalsSchema.safeParse(empty).success).toBe(true);
    expect(empty.paymentsLive).toBe(false);
    expect(empty.payingCustomers).toBe(0);
    expect(empty.blockingFlags).toEqual([]);
    expect(empty.source).toBe("verified");
    expect(empty.fetchedAt).toBe("2026-09-14T12:00:00.000Z");
  });

  it("rejects signals from a tier other than verified", () => {
    expect(trackerSignalsSchema.safeParse({ ...emptySignals(), source: "declared" }).success).toBe(
      false,
    );
    expect(trackerSignalsSchema.safeParse({ ...emptySignals(), payingCustomers: -1 }).success).toBe(
      false,
    );
  });
});

describe("the real tracker client", () => {
  const env = {
    SHIPPED_MONEY_BASE_URL: "https://web-production-f46c6.up.railway.app/",
    SHIPPED_MONEY_SERVICE_TOKEN: "svc-token",
  };

  it("signs timestamp and project id with the service token", () => {
    const expected = createHmac("sha256", "svc-token").update("1757851200:ledgerdesk").digest("hex");
    expect(signSignalsRequest("svc-token", "1757851200", "ledgerdesk")).toBe(expected);
    expect(signSignalsRequest("svc-token", "1757851200", "ledgerdesk")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("calls the agreed URL with the bearer, timestamp and signature", async () => {
    const { calls, impl } = stubFetch(200, WIRE);
    const client = createRealTrackerClient(env, impl);
    await client.getCheckpointSignals("ledgerdesk");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://web-production-f46c6.up.railway.app/api/v1/checkpoint-signals?projectId=ledgerdesk",
    );
    expect(calls[0].headers.Authorization).toBe("Bearer svc-token");
    const ts = calls[0].headers["X-Shipyard-Timestamp"];
    expect(Number(ts)).toBeGreaterThan(1_600_000_000);
    expect(Number(ts)).toBeLessThan(100_000_000_000); // seconds, not milliseconds
    expect(calls[0].headers["X-Shipyard-Signature"]).toBe(
      signSignalsRequest("svc-token", ts, "ledgerdesk"),
    );
  });

  it("maps the wire shape onto the portal's verified signals", async () => {
    const { impl } = stubFetch(200, WIRE);
    const signals = await createRealTrackerClient(env, impl).getCheckpointSignals("ledgerdesk");
    expect(signals).toEqual({
      paymentsLive: true,
      trackerConnected: true,
      workflowTenRuns: true,
      hasPayingCustomer: true,
      payingCustomers: 3,
      grossTotal: 14_700,
      netTotal: 13_830,
      currency: "USD",
      workflowRuns: 14,
      blockingFlags: [],
      // A tracker that does not send the owner field yet reads as null, which
      // `refreshTrackerForProduct` treats as "we do not know", never as a
      // mismatch.
      ownerEmail: null,
      fetchedAt: "2026-09-14T09:00:00.000Z",
      source: "verified",
    });
    expect(trackerSignalsSchema.safeParse(signals).success).toBe(true);
  });

  it("carries blocking flag codes through as opaque strings", async () => {
    const { impl } = stubFetch(200, {
      ...WIRE,
      blockingFlags: ["self_payment_suspected", "customer_concentration"],
    });
    const signals = await createRealTrackerClient(env, impl).getCheckpointSignals("x");
    expect(signals?.blockingFlags).toEqual(["self_payment_suspected", "customer_concentration"]);
  });

  it("tolerates fields the tracker adds later and a null workflow count", async () => {
    const { impl } = stubFetch(200, { ...WIRE, workflowRuns: null, mrr: 4_200, tier: "pro" });
    const signals = await createRealTrackerClient(env, impl).getCheckpointSignals("x");
    expect(signals?.workflowRuns).toBeUndefined();
    expect(signals?.paymentsLive).toBe(true);
  });

  it("returns null and never throws on 404, 401, 403, 500 and a malformed body", async () => {
    for (const status of [404, 401, 403, 500, 503]) {
      const { impl } = stubFetch(status, { error: "nope" });
      await expect(
        createRealTrackerClient(env, impl).getCheckpointSignals("x"),
      ).resolves.toBeNull();
    }
    const { impl } = stubFetch(200, { paymentsLive: "yes" });
    await expect(createRealTrackerClient(env, impl).getCheckpointSignals("x")).resolves.toBeNull();
  });

  it("returns null when the transport throws", async () => {
    const impl: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    await expect(createRealTrackerClient(env, impl).getCheckpointSignals("x")).resolves.toBeNull();
  });

  it("returns null without calling out when there is no tracker id or no config", async () => {
    const { calls, impl } = stubFetch(200, WIRE);
    await expect(createRealTrackerClient(env, impl).getCheckpointSignals(null)).resolves.toBeNull();
    await expect(createRealTrackerClient(env, impl).getCheckpointSignals("")).resolves.toBeNull();
    await expect(createRealTrackerClient({}, impl).getCheckpointSignals("x")).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("defaults the currency when the tracker omits it", () => {
    const { currency, ...withoutCurrency } = WIRE;
    void currency;
    const parsed = checkpointSignalsResponseSchema.parse(withoutCurrency);
    expect(toTrackerSignals(parsed).currency).toBe("USD");
  });
});

describe("the fake tracker", () => {
  type Row = { productId: string; signals: unknown; updatedBy: string; updatedAt: Date };

  function memoryDb(rows: Row[] = []) {
    const store = new Map(rows.map((r) => [r.productId, r]));
    return {
      store,
      // The fake tracker names the product's owner, the way the real one does.
      shipyardProduct: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          store.has(where.id) ? { user: { email: `${where.id}@mastersunion.org` } } : null,
      },
      shipyardTrackerOverride: {
        findUnique: async ({ where }: { where: { productId: string } }) =>
          store.get(where.productId) ?? null,
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { productId: string };
          create: { productId: string; signals: unknown; updatedBy: string };
          update: { signals: unknown; updatedBy: string };
        }) => {
          const existing = store.get(where.productId);
          const row = existing
            ? { ...existing, ...update, updatedAt: new Date() }
            : { ...create, updatedAt: new Date() };
          store.set(where.productId, row as Row);
          return row;
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("reads an override row", async () => {
    const signals = { ...emptySignals(), paymentsLive: true, trackerConnected: true };
    const db = memoryDb([
      { productId: "syp_001", signals, updatedBy: "seed", updatedAt: new Date() },
    ]);
    const client = createFakeTrackerClient(db);
    await expect(client.getCheckpointSignals("syp_001")).resolves.toEqual({
      ...signals,
      ownerEmail: "syp_001@mastersunion.org",
    });
  });

  it("treats a missing row as an unconnected product, not an error", async () => {
    const client = createFakeTrackerClient(memoryDb());
    const signals = await client.getCheckpointSignals("syp_999");
    expect(signals?.paymentsLive).toBe(false);
    expect(signals?.payingCustomers).toBe(0);
    expect(signals?.blockingFlags).toEqual([]);
  });

  it("returns null with no tracker id at all", async () => {
    await expect(createFakeTrackerClient(memoryDb()).getCheckpointSignals(null)).resolves.toBeNull();
  });

  it("falls back to empty signals when a row is malformed", async () => {
    const db = memoryDb([
      { productId: "syp_002", signals: { nonsense: true }, updatedBy: "x", updatedAt: new Date() },
    ]);
    const signals = await createFakeTrackerClient(db).getCheckpointSignals("syp_002");
    expect(signals?.paymentsLive).toBe(false);
  });

  it("setFakeSignals merges into what is already there", async () => {
    const db = memoryDb();
    await setFakeSignals("syp_003", { trackerConnected: true }, "admin", {
      db,
      env: { TRACKER_MODE: "fake" },
    });
    const merged = await setFakeSignals(
      "syp_003",
      { paymentsLive: true, payingCustomers: 2, hasPayingCustomer: true },
      "admin",
      { db, env: { TRACKER_MODE: "fake" } },
    );
    expect(merged.trackerConnected).toBe(true);
    expect(merged.paymentsLive).toBe(true);
    expect(merged.payingCustomers).toBe(2);
    expect(merged.source).toBe("verified");
    const read = await createFakeTrackerClient(db).getCheckpointSignals("syp_003");
    expect(read?.paymentsLive).toBe(true);
  });

  it("refuses to write in real mode — a metric gate is never admin-clearable", async () => {
    const db = memoryDb();
    await expect(
      setFakeSignals("syp_004", { paymentsLive: true }, "admin", {
        db,
        env: { TRACKER_MODE: "real", SHIPPED_MONEY_BASE_URL: "https://x.example.com" },
      }),
    ).rejects.toBeInstanceOf(FakeTrackerDisabledError);
    expect(db.store.size).toBe(0);
  });
});
