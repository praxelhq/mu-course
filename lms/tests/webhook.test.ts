import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import {
  handleClerkUserEvent,
  primaryEmail,
  type ClerkUserEventData,
  type ClerkWebhookDeps,
} from "../lib/auth/webhook";

// ---------------------------------------------------------------------------
// Hermetic route tests: mock the DB and the Clerk wrapper so the route can be
// exercised end to end (including real Svix signature verification) without a
// live database or Clerk account.
// ---------------------------------------------------------------------------

const dbCalls: { op: string; args: unknown }[] = [];
let rosterByEmail: Record<
  string,
  { id: string; role: "student" | "instructor" | "admin"; sectionId: string | null }
> = {};

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async (args: { where: { email?: string } }) => {
        dbCalls.push({ op: "user.findUnique", args });
        return args.where.email ? (rosterByEmail[args.where.email] ?? null) : null;
      },
      update: async (args: unknown) => {
        dbCalls.push({ op: "user.update", args });
        return {};
      },
    },
    auditLog: {
      create: async (args: unknown) => {
        dbCalls.push({ op: "auditLog.create", args });
        return {};
      },
    },
  },
}));

const metadataCalls: { clerkUserId: string; patch: unknown }[] = [];
vi.mock("@/lib/auth/clerk", () => ({
  hasClerkKeys: () => true,
  updateClerkUserMetadata: async (clerkUserId: string, patch: unknown) => {
    metadataCalls.push({ clerkUserId, patch });
  },
}));

const SECRET = "whsec_" + Buffer.from("test-secret-32-bytes-long!!").toString("base64");

function signedRequest(payload: string, opts: { tamper?: boolean } = {}): Request {
  const wh = new Webhook(SECRET);
  const id = "msg_test_1";
  const now = new Date();
  const signature = wh.sign(id, now, payload);
  return new Request("http://test.local/api/webhooks/clerk", {
    method: "POST",
    body: opts.tamper ? payload + " " : payload,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": Math.floor(now.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
  });
}

function clerkUserPayload(overrides: Partial<ClerkUserEventData> = {}, type = "user.created") {
  return JSON.stringify({
    type,
    data: {
      id: "clerk_abc",
      primary_email_address_id: "em_1",
      email_addresses: [
        { id: "em_2", email_address: "secondary@example.com" },
        { id: "em_1", email_address: "rostered@example.com" },
      ],
      public_metadata: {},
      ...overrides,
    },
  });
}

beforeEach(() => {
  dbCalls.length = 0;
  metadataCalls.length = 0;
  rosterByEmail = {};
  vi.stubEnv("CLERK_WEBHOOK_SECRET", SECRET);
  return () => vi.unstubAllEnvs();
});

describe("primaryEmail", () => {
  it("picks the primary email address by id", () => {
    const data = JSON.parse(clerkUserPayload()).data as ClerkUserEventData;
    expect(primaryEmail(data)).toBe("rostered@example.com");
  });

  it("returns null when there are no email addresses", () => {
    expect(
      primaryEmail({ id: "x", email_addresses: [], primary_email_address_id: null }),
    ).toBeNull();
  });
});

describe("POST /api/webhooks/clerk — signature verification", () => {
  it("rejects an unsigned request with 400 and performs no writes", async () => {
    const { POST } = await import("../app/api/webhooks/clerk/route");
    const res = await POST(
      new Request("http://test.local/api/webhooks/clerk", {
        method: "POST",
        body: clerkUserPayload(),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
    expect(metadataCalls).toHaveLength(0);
  });

  it("rejects a tampered payload with 400 and performs no writes", async () => {
    const { POST } = await import("../app/api/webhooks/clerk/route");
    const res = await POST(signedRequest(clerkUserPayload(), { tamper: true }));
    expect(res.status).toBe(400);
    expect(dbCalls).toHaveLength(0);
    expect(metadataCalls).toHaveLength(0);
  });
});

describe("POST /api/webhooks/clerk — user.created", () => {
  it("links clerkUserId to the roster row and pushes role/section to publicMetadata", async () => {
    rosterByEmail["rostered@example.com"] = {
      id: "u_roster",
      role: "student",
      sectionId: "sec_b",
    };
    const { POST } = await import("../app/api/webhooks/clerk/route");
    const res = await POST(signedRequest(clerkUserPayload()));
    expect(res.status).toBe(200);

    const update = dbCalls.find((c) => c.op === "user.update");
    expect(update?.args).toMatchObject({
      where: { id: "u_roster" },
      data: { clerkUserId: "clerk_abc" },
    });
    expect(metadataCalls).toHaveLength(1);
    expect(metadataCalls[0]).toMatchObject({
      clerkUserId: "clerk_abc",
      patch: { publicMetadata: { role: "student", sectionId: "sec_b" } },
    });
  });

  it("flags an unknown email (no user row created, AuditLog written, Clerk flagged)", async () => {
    const { POST } = await import("../app/api/webhooks/clerk/route");
    const res = await POST(signedRequest(clerkUserPayload()));
    expect(res.status).toBe(200);

    expect(dbCalls.some((c) => c.op === "user.update")).toBe(false);
    const audit = dbCalls.find((c) => c.op === "auditLog.create");
    expect(audit?.args).toMatchObject({
      data: {
        action: "auth.off_roster_rejected",
        targetType: "clerk_user",
        targetId: "clerk_abc",
      },
    });
    expect(metadataCalls[0]).toMatchObject({
      clerkUserId: "clerk_abc",
      patch: { privateMetadata: { flaggedForDeletion: true } },
    });
  });

  it("role/section direction is roster-row -> Clerk, never the reverse", async () => {
    // The Clerk event claims role admin in public_metadata; the roster row says
    // instructor. The roster row must win, and the local row's role must never
    // be written from Clerk data.
    rosterByEmail["rostered@example.com"] = {
      id: "u_teach",
      role: "instructor",
      sectionId: null,
    };
    const { POST } = await import("../app/api/webhooks/clerk/route");
    const res = await POST(
      signedRequest(clerkUserPayload({ public_metadata: { role: "admin" } })),
    );
    expect(res.status).toBe(200);

    expect(metadataCalls[0]).toMatchObject({
      patch: { publicMetadata: { role: "instructor", sectionId: null } },
    });
    // No DB write may touch role: the only user.update sets clerkUserId.
    for (const c of dbCalls.filter((c) => c.op === "user.update")) {
      const data = (c.args as { data: Record<string, unknown> }).data;
      expect(Object.keys(data)).not.toContain("role");
      expect(Object.keys(data)).not.toContain("sectionId");
    }
  });
});

describe("handleClerkUserEvent (core)", () => {
  function makeDeps() {
    const calls: { linked: [string, string][]; audits: unknown[]; metadata: unknown[] } = {
      linked: [],
      audits: [],
      metadata: [],
    };
    const deps: ClerkWebhookDeps = {
      findUserByEmail: async (email) =>
        email === "rostered@example.com"
          ? { id: "u1", role: "student", sectionId: "sec_a" }
          : null,
      linkClerkId: async (userId, clerkUserId) => {
        calls.linked.push([userId, clerkUserId]);
      },
      createAuditLog: async (entry) => {
        calls.audits.push(entry);
      },
      updateClerkMetadata: async (clerkUserId, patch) => {
        calls.metadata.push({ clerkUserId, patch });
      },
    };
    return { deps, calls };
  }

  it("first sign-in with empty publicMetadata gets role/section FROM the roster row", async () => {
    const { deps, calls } = makeDeps();
    const evt = JSON.parse(clerkUserPayload());
    const result = await handleClerkUserEvent(evt, deps);
    expect(result.outcome).toBe("linked");
    expect(calls.linked).toEqual([["u1", "clerk_abc"]]);
    expect(calls.metadata[0]).toMatchObject({
      patch: {
        publicMetadata: { role: "student", sectionId: "sec_a" },
        privateMetadata: { flaggedForDeletion: false },
      },
    });
  });

  it("links a temporary Section F enrollee instead of flagging the account", async () => {
    const { deps, calls } = makeDeps();
    deps.enrollTemporaryUser = async (email, clerkUserId) => {
      expect(email).toBe("unknown@example.com");
      expect(clerkUserId).toBe("clerk_abc");
      return { id: "u_temp", role: "student", sectionId: "sec_f" };
    };
    const evt = JSON.parse(clerkUserPayload());
    evt.data.email_addresses = [{ id: "em_1", email_address: "unknown@example.com" }];

    const result = await handleClerkUserEvent(evt, deps);

    expect(result.outcome).toBe("linked");
    expect(calls.linked).toEqual([["u_temp", "clerk_abc"]]);
    expect(calls.audits).toHaveLength(0);
    expect(calls.metadata[0]).toMatchObject({
      patch: {
        publicMetadata: { role: "student", sectionId: "sec_f" },
        privateMetadata: { flaggedForDeletion: false },
      },
    });
  });

  it("ignores unrelated event types", async () => {
    const { deps, calls } = makeDeps();
    const result = await handleClerkUserEvent(
      { type: "session.created", data: { id: "sess_1" } },
      deps,
    );
    expect(result.outcome).toBe("ignored");
    expect(calls.linked).toHaveLength(0);
    expect(calls.audits).toHaveLength(0);
    expect(calls.metadata).toHaveLength(0);
  });

  it("flags but does not create a user row for unknown emails", async () => {
    const { deps, calls } = makeDeps();
    const evt = JSON.parse(clerkUserPayload());
    evt.data.email_addresses = [{ id: "em_1", email_address: "unknown@example.com" }];
    const result = await handleClerkUserEvent(evt, deps);
    expect(result.outcome).toBe("flagged");
    expect(calls.linked).toHaveLength(0);
    expect(calls.audits).toHaveLength(1);
    expect(calls.metadata[0]).toMatchObject({
      patch: { privateMetadata: { flaggedForDeletion: true } },
    });
  });
});
