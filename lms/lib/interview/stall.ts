// When the interview room should offer — or force — a rejoin.
//
// The decision lives here, out of the component, because it is the rule that
// decides whether a student's interview is interrupted, and it has to be
// testable without a browser or a LiveKit room.
//
// THE THING THIS GETS RIGHT AND THE OLD INLINE VERSION DID NOT: silence from
// the interviewer is not evidence of anything on its own. The interviewer is
// silent for the whole of every answer. Measuring only its silence meant a
// student talking for thirty seconds was shown "Interviewer not responding?
// Rejoin" mid-sentence, and a student talking past the no-reply grace had
// their call torn down and rebuilt under them — reported as the page
// reloading after every question. What matters is whether the ROOM is quiet:
// neither side has done anything. A student who is still speaking is not
// stranded, whatever the interviewer is doing.

/** The interviewer left the room; no agent will ever rejoin it. */
export const AGENT_GONE_GRACE_MS = 20_000;
/**
 * A connected room with no interviewer in it. The cold path is dispatch →
 * connect → agent-context (with its S3 reservations) → egress → prompt cache
 * → VAD → session → first token, and under a burst of admissions this is
 * routinely slow, so it stays generous.
 */
export const NO_AGENT_GRACE_MS = 75_000;
/**
 * An interviewer that is present can still be dead — a quota outage or a
 * wedged STT leaves it in the room publishing silence. Deliberately patient:
 * the cost of firing is a reconnect, which resumes rather than restarts.
 */
export const NO_PROGRESS_MS = 4 * 60_000;
/**
 * When the manual "rejoin" offer appears. Short, because a student who KNOWS
 * the interviewer has died should not spend a fifth of their budget waiting to
 * be rescued — but now measured from the last thing EITHER side did, so it
 * cannot appear while they are still answering.
 */
export const REJOIN_OFFER_AFTER_MS = 25_000;

export type RoomActivity = {
  now: number;
  /** When this room connected. The clock before anyone has spoken. */
  connectedAt: number;
  /** Is the interviewer's participant in the room right now? */
  agentPresent: boolean;
  /** When the interviewer was last seen in the room. */
  agentLastSeenAt: number;
  /** How many interviewer turns are on the record. */
  agentTurns: number;
  /** When the interviewer last SPOKE. Null before its first turn. */
  lastAgentTurnAt: number | null;
  /**
   * When the student last did anything — a persisted turn, or their
   * microphone opening. Null if they have not been heard from yet.
   */
  lastStudentActivityAt: number | null;
  /** Is the last persisted turn the student's, i.e. are they owed a reply? */
  studentSpokeLast: boolean;
};

export type RoomVerdict = {
  /** Non-null means reconnect now, with this reason. */
  reconnect: string | null;
  /** Show the student the manual rejoin button. */
  offerRejoin: boolean;
};

/** How long the room has been quiet on BOTH sides. */
export function quietForMs(activity: RoomActivity): number {
  const lastAnything = Math.max(
    activity.lastAgentTurnAt ?? activity.connectedAt,
    activity.lastStudentActivityAt ?? 0,
  );
  return Math.max(0, activity.now - lastAnything);
}

/**
 * The whole watchdog rule, as one pure decision.
 *
 * Reconnect reasons are ordered by how certain they are: an interviewer that
 * has LEFT is gone whatever anyone is saying, and an interview that never got
 * one at all cannot be rescued by the student talking into the void — that
 * branch alone ignores student activity, because a student saying "hello?
 * can you hear me?" to an empty room is the exact case it exists to catch.
 */
export function assessRoom(activity: RoomActivity): RoomVerdict {
  const quiet = quietForMs(activity);
  const none = { reconnect: null as string | null, offerRejoin: false };

  // The interviewer was here and is not any more.
  if (
    !activity.agentPresent &&
    activity.agentTurns > 0 &&
    activity.now - activity.agentLastSeenAt > AGENT_GONE_GRACE_MS
  ) {
    return { ...none, reconnect: "interviewer-left" };
  }

  // Nobody ever joined to interview us. Student speech does not count here.
  if (
    activity.agentTurns === 0 &&
    activity.now - activity.connectedAt > NO_AGENT_GRACE_MS
  ) {
    return { ...none, reconnect: "no-interviewer" };
  }

  // Present, but nothing has come out of it — and the student is not talking.
  if (activity.agentPresent && activity.agentTurns > 0 && quiet > NO_PROGRESS_MS) {
    return { ...none, reconnect: "interviewer-silent" };
  }

  // The student finished an answer and nothing came back.
  if (activity.agentTurns > 0 && activity.studentSpokeLast && quiet > NO_AGENT_GRACE_MS) {
    return { ...none, reconnect: "interviewer-stopped" };
  }

  return { reconnect: null, offerRejoin: quiet > REJOIN_OFFER_AFTER_MS };
}
