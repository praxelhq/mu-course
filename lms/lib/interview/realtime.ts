import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { loadRuntimeIdentity } from "@/lib/operations/runtime-identity";
import { listServiceHeartbeats } from "@/lib/operations/service-heartbeats";

// Realtime (LiveKit) transport glue: room-token minting, the ~30-room
// concurrency guard with heartbeats, and the constant-time agent token check.
//
// Everything here is optional-by-env: with no LIVEKIT_* keys locally,
// livekitConfigured() is false and the token route answers 503 without
// creating an interview. Students only use the real-time transport.

export const TRANSPORT_REALTIME = "realtime";

/**
 * Join-token lifetime. It must stay comfortably ABOVE the agent's
 * MAX_INTERVIEW_SECONDS (15 min): the room outlives the token, so a student who
 * drops near the end of a full-length interview needs a token that is still
 * valid to rejoin. At parity with the interview budget a late reconnect fails on
 * the clock rather than the network and strands an otherwise recoverable room.
 */
export const ROOM_TOKEN_TTL_SECONDS = 25 * 60;

/** A realtime room with no heartbeat for this long no longer counts. */
export const HEARTBEAT_STALE_MS = 90_000;
/** lastSeenAt writes are throttled to this granularity (cheap heartbeat). */
export const HEARTBEAT_THROTTLE_MS = 30_000;

export function maxRealtimeRooms(): number {
  const n = Number(process.env.INTERVIEW_MAX_ROOMS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

export function livekitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  );
}

type AgentHeartbeat = {
  sourceSha: string;
  intervalSeconds: number;
  errorCount: number;
  lastSeenAt: Date;
};

/**
 * A token is an admission to a graded realtime interview, not a connectivity
 * probe. Admit students only when every currently fresh agent replica proves
 * the web build it will call back into and reports no startup errors.
 */
export function hasCurrentRealtimeAgentHeartbeat(
  heartbeats: AgentHeartbeat[],
  sourceSha: string,
  now: Date = new Date(),
): boolean {
  const fresh = heartbeats.filter((heartbeat) => {
    const ageMs = now.getTime() - heartbeat.lastSeenAt.getTime();
    return (
      Number.isInteger(heartbeat.intervalSeconds) &&
      heartbeat.intervalSeconds >= 10 &&
      heartbeat.intervalSeconds <= 300 &&
      ageMs >= 0 &&
      ageMs <= heartbeat.intervalSeconds * 2 * 1_000
    );
  });
  return (
    fresh.length > 0 &&
    fresh.every(
      (heartbeat) => heartbeat.sourceSha === sourceSha && heartbeat.errorCount === 0,
    )
  );
}

export async function realtimeAgentAvailable(
  client: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<boolean> {
  const identity = loadRuntimeIdentity();
  if (!identity.verified) return false;
  const heartbeats = await listServiceHeartbeats(["agent"], {
    findMany: (args) => client.serviceHeartbeat.findMany(args),
  });
  return hasCurrentRealtimeAgentHeartbeat(heartbeats, identity.sourceSha, now);
}

export function roomNameFor(interviewId: string): string {
  return `interview-${interviewId}`;
}

/**
 * Mint a short-lived LiveKit room token for the student's browser. No
 * provider keys ever reach the client — only this JWT plus LIVEKIT_URL.
 */
export async function mintRoomToken(args: {
  interviewId: string;
  identity: string;
}): Promise<{ token: string; roomName: string; url: string }> {
  if (!livekitConfigured()) throw new Error("LiveKit not configured");
  const { AccessToken } = await import("livekit-server-sdk");
  const roomName = roomNameFor(args.interviewId);
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: args.identity,
    ttl: ROOM_TOKEN_TTL_SECONDS, // room outlives the token, not vice versa
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return { token: await at.toJwt(), roomName, url: process.env.LIVEKIT_URL! };
}

/** Live realtime interviews with a fresh heartbeat = occupied rooms. */
export async function countActiveRealtimeRooms(
  client: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<number> {
  return client.interview.count({
    where: {
      status: "live",
      transport: TRANSPORT_REALTIME,
      lastSeenAt: { gte: new Date(now.getTime() - HEARTBEAT_STALE_MS) },
    },
  });
}

/**
 * Refresh the interview heartbeat, throttled to HEARTBEAT_THROTTLE_MS so the
 * 5s state poll costs one UPDATE per ~30s. Never throws — a heartbeat must
 * not break the loop it rides on.
 */
export async function touchHeartbeat(
  interviewId: string,
  client: PrismaClient = defaultPrisma,
  now: Date = new Date(),
): Promise<void> {
  try {
    await client.interview.updateMany({
      where: {
        id: interviewId,
        status: "live",
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: new Date(now.getTime() - HEARTBEAT_THROTTLE_MS) } },
        ],
      },
      data: { lastSeenAt: now },
    });
  } catch (err) {
    console.error(`[interview] heartbeat update failed for ${interviewId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Agent internal token (X-Agent-Token) — constant-time comparison
// ---------------------------------------------------------------------------

/**
 * Constant-time check of the agent's shared secret. Hashing both sides first
 * makes timingSafeEqual applicable regardless of length, and leaks nothing
 * about either value.
 */
export function agentTokenOk(header: string | null): boolean {
  const expected = process.env.AGENT_INTERNAL_TOKEN;
  if (!expected || !header) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** 503 when the token is not configured server-side; 401 on a bad token. */
export function agentAuthResponse(req: Request): Response | null {
  if (!process.env.AGENT_INTERNAL_TOKEN) {
    return Response.json({ error: "Agent endpoint not configured" }, { status: 503 });
  }
  if (!agentTokenOk(req.headers.get("x-agent-token"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stranded-room recovery
// ---------------------------------------------------------------------------

/** The identity the Python worker accepts jobs under (agent/main.py). */
export const AGENT_IDENTITY = "forge-interviewer";

/**
 * How old a room must be before an absent interviewer counts as absent rather
 * than as still starting. The cold path is dispatch -> connect -> agent-context
 * (+ S3 reservations) -> egress -> prompt cache (up to 20s) -> VAD -> session,
 * and under a burst of admissions that is not quick.
 */
export const AGENT_COLD_START_MS = 60_000;

/**
 * Delete a room whose interviewer has gone, so the student's next join creates
 * a fresh one and LiveKit dispatches a new job for it.
 *
 * The worker registers with automatic dispatch, which fires exactly once — when
 * the room is created. Every way an agent job can end while the interview stays
 * live (rejoin grace expiry, an AgentSession that closes itself when every LLM
 * leg fails, a deploy, a worker restart) therefore leaves a room that is up,
 * that the student is happily connected to, and that no agent will ever join
 * again. The student sits watching themselves; the transcript poll keeps the
 * heartbeat fresh, so the abandonment sweep cannot see them either. One student
 * lost his interview to exactly this.
 *
 * Deleting the room is the recovery: the next join re-creates it, dispatch
 * fires, and the new job resumes from the persisted transcript rather than
 * greeting the student again (see restore_session_state in agent/main.py).
 *
 * Safe to call on every token mint: a room with its interviewer present, or one
 * too young to judge, is left alone.
 */
export async function recoverStrandedRoom(
  roomName: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!livekitConfigured()) return false;
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(
      process.env.LIVEKIT_URL!.replace(/^ws/, "http"),
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    const rooms = await svc.listRooms([roomName]);
    const room = rooms[0];
    // No room yet: joining will create one and dispatch will fire normally.
    if (!room) return false;
    const ageMs = now.getTime() - Number(room.creationTime) * 1000;
    if (!Number.isFinite(ageMs) || ageMs < AGENT_COLD_START_MS) return false;

    const participants = await svc.listParticipants(roomName);
    if (participants.some((p) => p.identity === AGENT_IDENTITY)) return false;

    console.warn(
      `[interview] ${roomName} has no interviewer after ${Math.round(ageMs / 1000)}s — ` +
        "deleting the room so a fresh agent job is dispatched",
    );
    await svc.deleteRoom(roomName);
    return true;
  } catch (err) {
    // Recovery is best-effort. Failing it must never cost a student their
    // token: without the delete they are no worse off than before.
    console.error(`[interview] stranded-room recovery failed for ${roomName}:`, err);
    return false;
  }
}
