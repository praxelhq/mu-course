// Whose project is it, and whose workflow (SEC-2)?
//
// A Shipped.money slug and an n8n workflow id are both strings a student types
// into a form, and before this both were taken at face value: paste a
// classmate's slug and their verified revenue cleared your money gate; type a
// classmate's workflow id and their runs cleared your workflow gate.
//
// Three fences, tested here: the unique index, the tracker's owner filter, and
// the n8n tag.

import { describe, expect, it } from "vitest";
import { connectTracker } from "@/lib/shipyard/products";
import { decideWorkflowRuns, shipyardWorkflowTag } from "@/lib/shipyard/tracker-refresh";
import { ShipyardError } from "@/lib/shipyard/errors";
import { createFakeTrackerClient } from "@/lib/tracker/fake";
import { createRealTrackerClient, signSignalsRequest, type FetchLike } from "@/lib/tracker/real";
import { emptySignals, type TrackerSignals } from "@/lib/tracker/types";
import type { TrackerClient } from "@/lib/tracker/client";

const PRODUCT = "syp_001";
const OWNER = "asha@mastersunion.org";
const SLUG = "ledger-desk";

// ---------------------------------------------------------------------------
// The fake tracker honours the same ownership contract as the real one
// ---------------------------------------------------------------------------

function fakeDb(owner: string | null, signals: TrackerSignals | null) {
  return {
    shipyardProduct: {
      findUnique: async () => (owner ? { user: { email: owner } } : null),
    },
    shipyardTrackerOverride: {
      findUnique: async () =>
        signals ? { signals, updatedAt: new Date("2026-09-15T00:00:00.000Z") } : null,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("the fake tracker's ownership contract", () => {
  it("names the product owner on the way out", async () => {
    const client = createFakeTrackerClient(fakeDb(OWNER, { ...emptySignals(), paymentsLive: true }));
    const read = await client.getCheckpointSignals(PRODUCT);
    expect(read?.ownerEmail).toBe(OWNER);
    expect(read?.paymentsLive).toBe(true);
  });

  it("answers null for an ownerEmail that is not the owner's", async () => {
    const client = createFakeTrackerClient(fakeDb(OWNER, emptySignals()));
    await expect(
      client.getCheckpointSignals(PRODUCT, { ownerEmail: "someone.else@mastersunion.org" }),
    ).resolves.toBeNull();
  });

  it("matches the owner past case and whitespace, as the tracker does", async () => {
    const client = createFakeTrackerClient(fakeDb(OWNER, emptySignals()));
    const read = await client.getCheckpointSignals(PRODUCT, {
      ownerEmail: "  Asha@MastersUnion.org ",
    });
    expect(read).not.toBeNull();
  });

  it("names the owner even on a product with no override row yet", async () => {
    const client = createFakeTrackerClient(fakeDb(OWNER, null));
    const read = await client.getCheckpointSignals(PRODUCT);
    expect(read?.ownerEmail).toBe(OWNER);
    expect(read?.payingCustomers).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The real client sends the filter as a query param, NOT in the signature
// ---------------------------------------------------------------------------

describe("the real tracker client's owner filter", () => {
  const env = {
    SHIPPED_MONEY_BASE_URL: "https://shipped.example.com",
    SHIPPED_MONEY_SERVICE_TOKEN: "tok",
  };
  const body = {
    paymentsLive: true,
    trackerConnected: true,
    hasPayingCustomer: false,
    payingCustomers: 0,
    grossTotal: 0,
    netTotal: 0,
    currency: "USD",
    workflowTenRuns: false,
    blockingFlags: [] as string[],
    ownerEmail: OWNER,
  };

  function spyFetch(status = 200, payload: unknown = body) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const impl: FetchLike = async (url, init) => {
      calls.push({ url, headers: init?.headers ?? {} });
      return { ok: status < 400, status, json: async () => payload };
    };
    return { calls, impl };
  }

  it("adds ownerEmail to the query and leaves the HMAC over timestamp:projectId", async () => {
    const spy = spyFetch();
    await createRealTrackerClient(env, spy.impl).getCheckpointSignals(SLUG, {
      ownerEmail: " Asha@MastersUnion.org ",
    });
    const call = spy.calls[0];
    const url = new URL(call.url);
    expect(url.searchParams.get("projectId")).toBe(SLUG);
    expect(url.searchParams.get("ownerEmail")).toBe(OWNER);
    // The signature is unchanged by the filter — it is not in the signed string.
    const timestamp = call.headers["X-Shipyard-Timestamp"];
    expect(call.headers["X-Shipyard-Signature"]).toBe(
      signSignalsRequest("tok", timestamp, SLUG),
    );
  });

  it("omits the param entirely when no owner is given", async () => {
    const spy = spyFetch();
    await createRealTrackerClient(env, spy.impl).getCheckpointSignals(SLUG);
    expect(new URL(spy.calls[0].url).searchParams.has("ownerEmail")).toBe(false);
  });

  it("carries ownerEmail through to the portal's own signal shape", async () => {
    const spy = spyFetch();
    const read = await createRealTrackerClient(env, spy.impl).getCheckpointSignals(SLUG);
    expect(read?.ownerEmail).toBe(OWNER);
  });

  it("reads a tracker that does not send the field yet as null, not as a refusal", async () => {
    const { ownerEmail: _dropped, ...older } = body;
    const spy = spyFetch(200, older);
    const read = await createRealTrackerClient(env, spy.impl).getCheckpointSignals(SLUG);
    expect(read).not.toBeNull();
    expect(read?.ownerEmail).toBeNull();
  });

  it("reads the tracker's owner-filtered not-found as null", async () => {
    const spy = spyFetch(404, { error: "not-found" });
    await expect(
      createRealTrackerClient(env, spy.impl).getCheckpointSignals(SLUG, { ownerEmail: OWNER }),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// connectTracker's two refusals
// ---------------------------------------------------------------------------

type ConnectDbOptions = {
  /** Another product in this course already holding the slug. */
  takenBy?: string | null;
  emails?: string[];
};

function connectDb(options: ConnectDbOptions = {}) {
  const updates: unknown[] = [];
  const audits: Record<string, unknown>[] = [];
  return {
    updates,
    audits,
    db: {
      shipyardProduct: {
        findUnique: async () => ({ id: PRODUCT, userId: "usr_1" }),
        findFirst: async () =>
          options.takenBy ? { id: options.takenBy } : null,
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
      user: {
        findUnique: async () => ({
          email: options.emails?.[0] ?? OWNER,
          emailAliases: (options.emails ?? [OWNER]).slice(1).map((email) => ({ email })),
        }),
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data);
          return data;
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

/** A tracker that answers for `answers[ownerEmail ?? ""]` and null otherwise. */
function ownerAwareTracker(answers: Record<string, TrackerSignals | null>): TrackerClient {
  return {
    async getCheckpointSignals(_id, options) {
      const key = options?.ownerEmail?.trim().toLowerCase() ?? "";
      return answers[key] ?? null;
    },
  };
}

describe("connectTracker", () => {
  it("refuses a slug another student has already connected", async () => {
    const { db } = connectDb({ takenBy: "syp_other" });
    await expect(
      connectTracker(PRODUCT, `https://shipped.money/p/${SLUG}`, {
        db,
        tracker: ownerAwareTracker({}),
      }),
    ).rejects.toMatchObject({
      status: 409,
      body: { error: "That Shipped.money project is already connected to another student" },
    });
  });

  it("refuses a project the tracker says belongs to another account", async () => {
    const { db, updates } = connectDb();
    // The filtered read finds nothing for this student; the unfiltered one
    // finds the project, so it exists and is simply not theirs.
    const tracker = ownerAwareTracker({ "": { ...emptySignals(), ownerEmail: "rival@x.org" } });
    const err = await connectTracker(PRODUCT, SLUG, { db, tracker }).catch((e) => e);
    expect(err).toBeInstanceOf(ShipyardError);
    expect(err.status).toBe(403);
    expect(err.body.error).toBe("That project belongs to a different Shipped.money account");
    // Nothing was written: the student is not connected to someone else's numbers.
    expect(updates).toHaveLength(0);
  });

  it("checks every address the student owns, not only the canonical one", async () => {
    const { db, audits } = connectDb({ emails: [OWNER, "asha.personal@gmail.com"] });
    const tracker = ownerAwareTracker({
      "asha.personal@gmail.com": { ...emptySignals(), ownerEmail: "asha.personal@gmail.com" },
    });
    // recomputeGates needs a real database, so the assertion stops at the
    // audit row the connect writes just before it.
    await connectTracker(PRODUCT, SLUG, { db, tracker }).catch(() => undefined);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("shipyard.tracker.connect");
    expect(audits[0].after).toMatchObject({ ownerVerified: true });
  });

  it("records ownerVerified: false when the tracker cannot answer at all", async () => {
    const { db, audits } = connectDb();
    await connectTracker(PRODUCT, SLUG, { db, tracker: ownerAwareTracker({}) }).catch(
      () => undefined,
    );
    expect(audits[0].after).toMatchObject({ ownerVerified: false, ownerEmailSeen: null });
  });
});

// ---------------------------------------------------------------------------
// refreshTrackerForProduct disconnects a project it learns is someone else's
// ---------------------------------------------------------------------------

function refreshDb(ownerEmail: string, aliases: string[] = []) {
  const updates: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  return {
    updates,
    audits,
    db: {
      shipyardProduct: {
        findUnique: async () => ({
          id: PRODUCT,
          trackerProductId: SLUG,
          userId: "usr_1",
          user: { email: ownerEmail, emailAliases: aliases.map((email) => ({ email })) },
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return {};
        },
      },
      shipyardCheckpointState: { findMany: async () => [] },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data);
          return data;
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

const signalsOwnedBy = (email: string | null): TrackerSignals => ({
  ...emptySignals(),
  paymentsLive: true,
  hasPayingCustomer: true,
  payingCustomers: 4,
  ownerEmail: email,
});

const fixedTracker = (signals: TrackerSignals | null): TrackerClient => ({
  async getCheckpointSignals() {
    return signals;
  },
});

describe("refreshTrackerForProduct and a project that is not the student's", () => {
  it("disconnects, changes no gate, and writes the audit row", async () => {
    const { refreshTrackerForProduct } = await import("@/lib/shipyard/tracker-refresh");
    const { db, updates, audits } = refreshDb(OWNER);
    const result = await refreshTrackerForProduct(PRODUCT, {
      db,
      tracker: fixedTracker(signalsOwnedBy("rival@x.org")),
      recomputeGrade: false,
    });

    expect(result.ownerMismatch).toBe(true);
    // Not the rival's numbers: nothing was handed to the gate resolver at all.
    expect(result.signals).toBeNull();
    expect(updates).toEqual([{ trackerProductId: null }]);
    expect(audits[0].action).toBe("shipyard.tracker.owner-mismatch");
    expect(audits[0].after).toMatchObject({ trackerProductId: null, ownerEmailSeen: "rival@x.org" });
    expect(result.notes?.join(" ")).toMatch(/different account/);
  });

  it("accepts an owner who is one of the student's aliases", async () => {
    const { refreshTrackerForProduct } = await import("@/lib/shipyard/tracker-refresh");
    const { db, updates } = refreshDb(OWNER, ["asha.personal@gmail.com"]);
    await refreshTrackerForProduct(PRODUCT, {
      db,
      tracker: fixedTracker(signalsOwnedBy("Asha.Personal@Gmail.com")),
      recomputeGrade: false,
    }).catch(() => undefined);
    // No disconnect was written; the run continued on into recomputeGates.
    expect(updates).toEqual([]);
  });

  it("does not disconnect a tracker that simply does not name an owner", async () => {
    const { refreshTrackerForProduct } = await import("@/lib/shipyard/tracker-refresh");
    const { db, updates, audits } = refreshDb(OWNER);
    await refreshTrackerForProduct(PRODUCT, {
      db,
      tracker: fixedTracker(signalsOwnedBy(null)),
      recomputeGrade: false,
    }).catch(() => undefined);
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("does not disconnect on a tracker outage", async () => {
    const { refreshTrackerForProduct } = await import("@/lib/shipyard/tracker-refresh");
    const { db, updates, audits } = refreshDb(OWNER);
    const result = await refreshTrackerForProduct(PRODUCT, {
      db,
      tracker: fixedTracker(null),
      recomputeGrade: false,
    });
    expect(result.signals).toBeNull();
    expect(result.ownerMismatch).toBeUndefined();
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The n8n tag
// ---------------------------------------------------------------------------

describe("decideWorkflowRuns", () => {
  const WORKFLOW = "wf_88";

  it("counts a workflow carrying this product's tag", () => {
    const decision = decideWorkflowRuns(WORKFLOW, PRODUCT, {
      known: true,
      tags: ["ops", shipyardWorkflowTag(PRODUCT)],
    });
    expect(decision.count).toBe(true);
  });

  it("refuses a classmate's workflow — right id, wrong tag", () => {
    const decision = decideWorkflowRuns(WORKFLOW, PRODUCT, {
      known: true,
      tags: [shipyardWorkflowTag("syp_someone_else")],
    });
    expect(decision.count).toBe(false);
    if (!decision.count) expect(decision.note).toContain(shipyardWorkflowTag(PRODUCT));
  });

  it("refuses an untagged workflow and says what to add", () => {
    const decision = decideWorkflowRuns(WORKFLOW, PRODUCT, { known: true, tags: [] });
    expect(decision.count).toBe(false);
    if (!decision.count) expect(decision.note).toMatch(/Add that tag in n8n/);
  });

  it("fails closed when n8n will not say what the tags are", () => {
    const decision = decideWorkflowRuns(WORKFLOW, PRODUCT, { known: false, tags: [] });
    expect(decision.count).toBe(false);
    if (!decision.count) expect(decision.note).toMatch(/could not confirm/);
  });
});
