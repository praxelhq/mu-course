import type { GeneratedObjectReservation, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  inspectGeneratedObjectUpload,
  reserveGeneratedObjectUpload,
  writeGeneratedObject,
  type GeneratedObjectReservationDeps,
} from "../lib/generated-object-reservations";

const NOW = new Date("2026-07-30T12:00:00.000Z");

function reservation(
  patch: Partial<GeneratedObjectReservation> = {},
): GeneratedObjectReservation {
  return {
    id: "generated-reservation-1",
    purpose: "interview_turn_audio",
    submissionId: null,
    interviewId: "interview-1",
    targetId: "turn-1",
    s3Key: "interviews/interview-1/q1-reservation.mp3",
    declaredContentType: "audio/mpeg",
    declaredBytes: 3,
    s3VersionId: null,
    expiresAt: new Date("2026-07-30T12:30:00.000Z"),
    consumedAt: null,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function fakeTx(): Prisma.TransactionClient {
  return {} as Prisma.TransactionClient;
}

describe("server-generated object lifecycle", () => {
  it("reserves before PUT, persists the exact version, then atomically consumes and attaches", async () => {
    const events: string[] = [];
    let state = reservation();
    const deps: GeneratedObjectReservationDeps = {
      now: () => NOW,
      createReservation: async (input) => {
        events.push("reserve");
        state = reservation(input);
        return state;
      },
      put: async () => {
        events.push("put");
        return { versionId: "version-1", etag: "etag-1" };
      },
      persistVersion: async (_id, versionId) => {
        events.push(`persist:${versionId}`);
        state = reservation({ ...state, s3VersionId: versionId });
        return state;
      },
      consumeReservation: async (_args, attach) => {
        events.push("consume");
        const value = await attach(fakeTx());
        state = reservation({ ...state, consumedAt: NOW });
        return value;
      },
      findReservation: async () => state,
      deleteVersion: vi.fn(),
    };

    const written = await writeGeneratedObject(
      {
        reservation: {
          id: state.id,
          purpose: state.purpose,
          interviewId: state.interviewId,
          targetId: state.targetId,
          s3Key: state.s3Key,
          declaredContentType: state.declaredContentType,
          declaredBytes: state.declaredBytes,
        },
        body: new Uint8Array([1, 2, 3]),
        contentType: "audio/mpeg",
        attach: async (_tx, coordinates) => {
          events.push(`attach:${coordinates.s3VersionId}`);
          return coordinates;
        },
      },
      deps,
    );

    expect(events).toEqual(["reserve", "put", "persist:version-1", "consume", "attach:version-1"]);
    expect(written.receipt.versionId).toBe("version-1");
    expect(deps.deleteVersion).not.toHaveBeenCalled();
  });

  it("deletes exactly the unconsumed version when the atomic target attach fails", async () => {
    const events: string[] = [];
    let state = reservation();
    const deps: GeneratedObjectReservationDeps = {
      now: () => NOW,
      createReservation: async (input) => {
        events.push("reserve");
        state = reservation(input);
        return state;
      },
      put: async () => {
        events.push("put");
        return { versionId: "version-fenced", etag: null };
      },
      persistVersion: async (_id, versionId) => {
        events.push("persist");
        state = reservation({ ...state, s3VersionId: versionId });
        return state;
      },
      consumeReservation: async (_args, attach) => {
        events.push("consume");
        return attach(fakeTx());
      },
      findReservation: async () => state,
      deleteVersion: async (key, versionId) => {
        events.push(`delete:${key}:${versionId}`);
        return { verified: true, providerReceipt: "delete-request" };
      },
      cancelReservation: async (_id, _now, versionId) => {
        events.push(`cancel:${versionId}`);
        state = reservation({ ...state, cancelledAt: NOW });
        return true;
      },
    };

    await expect(
      writeGeneratedObject(
        {
          reservation: {
            id: state.id,
            purpose: state.purpose,
            interviewId: state.interviewId,
            targetId: state.targetId,
            s3Key: state.s3Key,
          },
          body: new Uint8Array([1, 2, 3]),
          contentType: "audio/mpeg",
          attach: async () => {
            events.push("attach");
            throw new Error("erasure fence");
          },
        },
        deps,
      ),
    ).rejects.toThrow("erasure fence");

    expect(events).toEqual([
      "reserve",
      "put",
      "persist",
      "consume",
      "attach",
      `delete:${state.s3Key}:version-fenced`,
      "cancel:version-fenced",
    ]);
  });

  it("never compensates when a follow-up read proves the reservation was consumed", async () => {
    let state = reservation();
    const deleteVersion = vi.fn();
    const deps: GeneratedObjectReservationDeps = {
      now: () => NOW,
      createReservation: async (input) => {
        state = reservation(input);
        return state;
      },
      put: async () => ({ versionId: "version-committed", etag: null }),
      persistVersion: async (_id, versionId) => {
        state = reservation({ ...state, s3VersionId: versionId });
        return state;
      },
      consumeReservation: async (_args, attach) => {
        await attach(fakeTx());
        state = reservation({ ...state, consumedAt: NOW });
        throw new Error("connection lost after commit");
      },
      findReservation: async () => state,
      deleteVersion,
    };

    await expect(
      writeGeneratedObject(
        {
          reservation: {
            id: state.id,
            purpose: state.purpose,
            interviewId: state.interviewId,
            targetId: state.targetId,
            s3Key: state.s3Key,
          },
          body: new Uint8Array([1]),
          contentType: "audio/mpeg",
          attach: async () => null,
        },
        deps,
      ),
    ).rejects.toThrow("connection lost after commit");
    expect(deleteVersion).not.toHaveBeenCalled();
  });
});

describe("browser-generated object lifecycle", () => {
  it("persists a reservation before issuing a one-time presigned PUT", async () => {
    const events: string[] = [];
    const deps: GeneratedObjectReservationDeps = {
      now: () => NOW,
      createReservation: async (input) => {
        events.push("reserve");
        return reservation(input);
      },
      presign: async (input) => {
        events.push(`presign:${input.oneTime}`);
        return { url: "https://s3.test/upload", key: input.key, headers: {} };
      },
    };

    const result = await reserveGeneratedObjectUpload(
      {
        id: "generated-reservation-1",
        purpose: "interview_turn_audio",
        interviewId: "interview-1",
        targetId: "turn-1",
        s3Key: reservation().s3Key,
        declaredContentType: "audio/mpeg",
        declaredBytes: 3,
      },
      deps,
    );

    expect(events).toEqual(["reserve", "presign:true"]);
    expect(result.reservation.id).toBe("generated-reservation-1");
  });

  it("HEADs and durably records the exact browser-upload VersionId before attach", async () => {
    let state = reservation();
    const deps: GeneratedObjectReservationDeps = {
      now: () => NOW,
      findReservation: async () => state,
      head: async () => ({
        contentLength: 3,
        contentType: "audio/mpeg",
        etag: "etag-browser",
        versionId: "version-browser",
      }),
      persistVersion: async (_id, versionId) => {
        state = reservation({ ...state, s3VersionId: versionId });
        return state;
      },
    };

    const result = await inspectGeneratedObjectUpload(
      {
        reservationId: state.id,
        expected: {
          purpose: "interview_turn_audio",
          interviewId: state.interviewId,
          targetId: state.targetId,
          s3Key: state.s3Key,
        },
      },
      deps,
    );

    expect(result.metadata.versionId).toBe("version-browser");
    expect(result.reservation.s3VersionId).toBe("version-browser");
  });
});
