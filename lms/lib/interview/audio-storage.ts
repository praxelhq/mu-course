import { randomUUID } from "node:crypto";
import { Prisma, type GeneratedObjectReservation } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  GeneratedObjectReservationError,
  compensateGeneratedObjectVersion,
  consumeGeneratedObjectReservation,
  inspectGeneratedObjectUpload,
  reserveGeneratedObject,
  reserveGeneratedObjectUpload,
  writeGeneratedObject,
  type GeneratedObjectReservationDeps,
} from "@/lib/generated-object-reservations";
import {
  keyForInterviewRecording,
  keyForReservedInterviewAudio,
  type PresignedPut,
} from "@/lib/s3";

export async function storeInterviewQuestionAudio(
  args: {
    interviewId: string;
    turnId: string;
    turnNo: number;
    bytes: Uint8Array;
    contentType: string;
  },
  deps: GeneratedObjectReservationDeps = {},
): Promise<{ s3Key: string; s3VersionId: string }> {
  const written = await writeGeneratedObject(
    {
      reservation: {
        purpose: "interview_turn_audio",
        interviewId: args.interviewId,
        targetId: args.turnId,
        s3Key: (reservationId) =>
          keyForReservedInterviewAudio(
            args.interviewId,
            "q",
            args.turnNo,
            reservationId,
            "mp3",
          ),
        declaredContentType: args.contentType,
        declaredBytes: args.bytes.byteLength,
      },
      body: args.bytes,
      contentType: args.contentType,
      attach: async (tx, coordinates) => {
        const attached = await tx.interviewTurn.updateMany({
          where: { id: args.turnId, interviewId: args.interviewId },
          data: {
            audioS3Key: coordinates.s3Key,
            audioS3VersionId: coordinates.s3VersionId,
          },
        });
        if (attached.count !== 1) throw new Error("Interview question is no longer attachable");
        return coordinates;
      },
    },
    deps,
  );
  return {
    s3Key: written.reservation.s3Key,
    s3VersionId: written.receipt.versionId,
  };
}

export async function reserveInterviewAnswerUpload(
  args: {
    interviewId: string;
    turnNo: number;
    contentType: string;
    sizeBytes: number;
    extension: string;
  },
  deps: GeneratedObjectReservationDeps = {},
): Promise<{
  reservation: GeneratedObjectReservation;
  upload: PresignedPut;
}> {
  const targetId = randomUUID();
  return reserveGeneratedObjectUpload(
    {
      purpose: "interview_turn_audio",
      interviewId: args.interviewId,
      targetId,
      s3Key: (reservationId) =>
        keyForReservedInterviewAudio(
          args.interviewId,
          "a",
          args.turnNo,
          reservationId,
          args.extension,
        ),
      declaredContentType: args.contentType,
      declaredBytes: args.sizeBytes,
    },
    deps,
  );
}

export async function inspectInterviewAnswerUpload(
  args: { interviewId: string; reservationId: string },
  deps: GeneratedObjectReservationDeps = {},
) {
  return inspectGeneratedObjectUpload(
    {
      reservationId: args.reservationId,
      expected: {
        purpose: "interview_turn_audio",
        interviewId: args.interviewId,
      },
    },
    deps,
  );
}

const RECORDING_RESERVATION_PREFIX = "interview-recording:";

/** Idempotently reserve the room recording before LiveKit Egress can start. */
export async function reserveInterviewRecording(
  interviewId: string,
  deps: GeneratedObjectReservationDeps = {},
): Promise<GeneratedObjectReservation> {
  const reservationId = `${RECORDING_RESERVATION_PREFIX}${interviewId}`;
  try {
    return await reserveGeneratedObject(
      {
        id: reservationId,
        purpose: "interview_recording",
        interviewId,
        targetId: interviewId,
        s3Key: keyForInterviewRecording(interviewId, reservationId),
      },
      deps,
    );
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const existing = await prisma.generatedObjectReservation.findUnique({
      where: { id: reservationId },
    });
    if (
      !existing ||
      existing.purpose !== "interview_recording" ||
      existing.interviewId !== interviewId ||
      existing.targetId !== interviewId ||
      existing.cancelledAt
    ) {
      throw new GeneratedObjectReservationError(409, "Interview recording reservation is unavailable.");
    }
    return existing;
  }
}

/** HEAD the Egress object and atomically attach its exact immutable version. */
export async function commitInterviewRecording(
  args: { interviewId: string; reservationId: string; s3Key: string },
  deps: GeneratedObjectReservationDeps = {},
): Promise<{ s3Key: string; s3VersionId: string }> {
  const existing = await prisma.generatedObjectReservation.findUnique({
    where: { id: args.reservationId },
  });
  if (existing?.consumedAt && existing.s3VersionId) {
    const interview = await prisma.interview.findUnique({
      where: { id: args.interviewId },
      select: { audioS3Key: true, audioS3VersionId: true },
    });
    if (
      interview?.audioS3Key === args.s3Key &&
      interview.audioS3VersionId === existing.s3VersionId
    ) {
      return { s3Key: args.s3Key, s3VersionId: existing.s3VersionId };
    }
  }

  const inspected = await inspectGeneratedObjectUpload(
    {
      reservationId: args.reservationId,
      expected: {
        purpose: "interview_recording",
        interviewId: args.interviewId,
        targetId: args.interviewId,
        s3Key: args.s3Key,
      },
    },
    deps,
  );
  try {
    await consumeGeneratedObjectReservation(
      {
        reservation: inspected.reservation,
        expected: {
          purpose: "interview_recording",
          interviewId: args.interviewId,
          targetId: args.interviewId,
          s3Key: args.s3Key,
          s3VersionId: inspected.metadata.versionId,
        },
        attach: async (tx) => {
          const attached = await tx.interview.updateMany({
            where: { id: args.interviewId },
            data: {
              audioS3Key: args.s3Key,
              audioS3VersionId: inspected.metadata.versionId,
            },
          });
          if (attached.count !== 1) throw new Error("Interview recording target disappeared");
        },
      },
      deps,
    );
  } catch (error) {
    await compensateGeneratedObjectVersion(
      inspected.reservation.id,
      { versionId: inspected.metadata.versionId, etag: inspected.metadata.etag },
      deps,
    ).catch(() => undefined);
    throw error;
  }
  return { s3Key: args.s3Key, s3VersionId: inspected.metadata.versionId };
}
