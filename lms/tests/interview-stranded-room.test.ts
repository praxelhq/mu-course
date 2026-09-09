import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Automatic dispatch fires exactly once, when the room is created. So every way
// an agent job can end while the interview stays live — the rejoin grace
// expiring, an AgentSession that closes itself when every LLM leg fails, a
// deploy — leaves a room that is up, that the student is happily connected to,
// and that no agent will ever join again. The student watches themselves while
// the transcript poll keeps the heartbeat fresh enough that the abandonment
// sweep cannot see them either.

const listRooms = vi.fn();
const listParticipants = vi.fn();
const deleteRoom = vi.fn(async () => {});

vi.mock("livekit-server-sdk", () => ({
  RoomServiceClient: class {
    listRooms = listRooms;
    listParticipants = listParticipants;
    deleteRoom = deleteRoom;
  },
  AccessToken: class {},
}));

import { AGENT_COLD_START_MS, AGENT_IDENTITY, recoverStrandedRoom } from "@/lib/interview/realtime";

const NOW = new Date("2026-09-09T12:00:00Z");
/** creationTime is seconds since the epoch, as LiveKit reports it. */
function roomAgedMs(ms: number) {
  return [{ creationTime: BigInt(Math.floor((NOW.getTime() - ms) / 1000)) }];
}

describe("stranded-room recovery", () => {
  beforeEach(() => {
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "key");
    vi.stubEnv("LIVEKIT_API_SECRET", "secret");
    listRooms.mockReset();
    listParticipants.mockReset();
    deleteRoom.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("deletes a room whose interviewer has gone", async () => {
    listRooms.mockResolvedValue(roomAgedMs(AGENT_COLD_START_MS + 60_000));
    listParticipants.mockResolvedValue([{ identity: "u_student" }]);

    await expect(recoverStrandedRoom("interview-iv_1", NOW)).resolves.toBe(true);
    expect(deleteRoom).toHaveBeenCalledWith("interview-iv_1");
  });

  it("leaves a healthy room alone", async () => {
    listRooms.mockResolvedValue(roomAgedMs(AGENT_COLD_START_MS + 60_000));
    listParticipants.mockResolvedValue([{ identity: "u_student" }, { identity: AGENT_IDENTITY }]);

    await expect(recoverStrandedRoom("interview-iv_1", NOW)).resolves.toBe(false);
    expect(deleteRoom).not.toHaveBeenCalled();
  });

  it("gives a cold-starting agent time to arrive", async () => {
    // Dispatch -> connect -> context -> egress -> prompt cache -> VAD is slow
    // under a burst; killing the room here would restart it forever.
    listRooms.mockResolvedValue(roomAgedMs(5_000));
    listParticipants.mockResolvedValue([]);

    await expect(recoverStrandedRoom("interview-iv_1", NOW)).resolves.toBe(false);
    expect(deleteRoom).not.toHaveBeenCalled();
  });

  it("does nothing when there is no room — joining will create one", async () => {
    listRooms.mockResolvedValue([]);
    await expect(recoverStrandedRoom("interview-iv_1", NOW)).resolves.toBe(false);
    expect(deleteRoom).not.toHaveBeenCalled();
  });

  it("never costs the student their token when LiveKit is unreachable", async () => {
    listRooms.mockRejectedValue(new Error("livekit down"));
    await expect(recoverStrandedRoom("interview-iv_1", NOW)).resolves.toBe(false);
  });

  it("is inert with LiveKit unconfigured, so local dev is unaffected", async () => {
    vi.stubEnv("LIVEKIT_URL", "");
    await expect(recoverStrandedRoom("interview-iv_1", NOW)).resolves.toBe(false);
    expect(listRooms).not.toHaveBeenCalled();
  });
});
