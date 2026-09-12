"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarVisualizer,
  ParticipantTile,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track } from "livekit-client";
import { AGENT_IDENTITY } from "@/lib/interview/identity";
import { VIDEO_LOST_NOTICE } from "@/lib/interview/video";
import styles from "./room.module.css";

// The live interview, rendered full-screen (see room.module.css).
//
// The layout departs from a normal video call on purpose. There is no second
// face to look at — the interviewer is voice-only — so the student's own
// camera is the stage rather than a thumbnail. In a recorded viva their video
// IS the artifact being produced, and seeing themselves framed and lit is the
// feedback that helps. The interviewer gets a presence strip with speaking
// bars instead of an empty avatar box.

type Turn = { turnNo: number; speaker: string; text: string };

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Stand-in bars while the interviewer's audio track is still subscribing. */
function IdleBars({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: active ? 8 + ((i * 7) % 18) : 5,
            background: "var(--sand)",
            opacity: active ? 0.9 : 0.5,
            transition: "height 240ms ease",
          }}
        />
      ))}
    </div>
  );
}

// How long a connected room may sit with no interviewer in it before the
// client remints a token and rejoins. Joining normally produces a greeting
// within a few seconds; a much longer silence means no agent job was ever
// dispatched — which happens if the worker was restarting when the student
// joined. Raised from 30s. The cold path is dispatch -> connect -> agent-context
// (with its S3 reservations) -> egress -> prompt cache (up to 20s) -> VAD ->
// session -> first token, and under a burst of admissions 30s was routinely
// short. A spurious reconnect is not free: the agent greets the empty room,
// that greeting is persisted, and the student rejoins to silence with an
// unheard question already on the record.
const NO_AGENT_GRACE_MS = 75_000;
/** An interviewer that has left the room is not coming back — see below. */
const AGENT_GONE_GRACE_MS = 20_000;
// An interviewer that is PRESENT can still be dead: a quota outage or a
// wedged STT leaves it in the room publishing silence. The turn checks below
// cannot see that — they wait for a student turn to follow the agent's
// question, and if the STT is the thing that died no student turn will ever
// be persisted. Deliberately generous: a student thinking hard about a hard
// question must never trip it, and the cost of firing is only a reconnect,
// which now resumes rather than restarts.
const NO_PROGRESS_MS = 4 * 60_000;
/**
 * When the manual "rejoin" offer appears. Well short of NO_PROGRESS_MS: the
 * automatic recovery stays patient so it never interrupts a thinking student,
 * while a student who KNOWS the interviewer has died can act in seconds
 * instead of losing a fifth of their budget waiting to be rescued.
 */
const MANUAL_REJOIN_AFTER_MS = 25_000;

export function MeetingView({
  interviewId,
  startedAt,
  budgetMinutes,
  onReconnect,
  onCompleted,
}: {
  interviewId: string;
  /** The interview's createdAt — the clock a reconnect must not rewind. */
  startedAt: string | null;
  budgetMinutes: number;
  onReconnect: (reason: string) => void;
  onCompleted: () => void;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();

  // Lazily seeded so state never settles synchronously inside an effect; the
  // RoomEvent below covers mounting before the room connects.
  const [connectedAt, setConnectedAt] = useState<number | null>(() =>
    room?.state === ConnectionState.Connected ? Date.now() : null,
  );
  const [now, setNow] = useState(() => Date.now());

  // Measured from the interview's own start, NOT from room-connect. A student
  // whose browser dropped four times watched this reset to 00:00 four times and
  // reasonably concluded his interview had restarted. connectedAt remains the
  // fallback for when the server did not hand us a start time.
  const interviewStartedAt = useMemo(() => {
    if (!startedAt) return null;
    const parsed = Date.parse(startedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [startedAt]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoLost, setVideoLost] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  /** Interviewer has been quiet long enough to offer a manual rejoin. */
  const [stalled, setStalled] = useState(false);
  const endedRef = useRef(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const agentPresentRef = useRef(false);
  // When the interviewer last actually SPOKE — a published track is not speech.
  const lastAgentAtRef = useRef(0);
  // When the interviewer was last actually IN the room. Seeded on the first
  // watchdog tick rather than at render, which must stay pure.
  const agentLastSeenRef = useRef(0);
  const turnsRef = useRef<Turn[]>([]);

  const isConnected = connectionState === ConnectionState.Connected;


  useEffect(() => {
    if (!room) return;
    const onConnected = () => setConnectedAt((prev) => prev ?? Date.now());
    room.on(RoomEvent.Connected, onConnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room]);

  const elapsedFrom = interviewStartedAt ?? connectedAt;

  useEffect(() => {
    if (elapsedFrom === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [elapsedFrom]);

  const elapsed = useMemo(
    () => (elapsedFrom === null ? 0 : Math.max(0, Math.floor((now - elapsedFrom) / 1000))),
    [elapsedFrom, now],
  );

  // Losing the camera mid-interview is NOT terminal: the conversation carries
  // on over audio and the interview is flagged, so a device failure never
  // costs the student their single attempt.
  useEffect(() => {
    if (!localParticipant) return;
    const onUnpublished = (pub: { kind: string }) => {
      if (pub.kind !== "video" || endedRef.current) return;
      setVideoLost(true);
      void fetch("/api/interview/video-lost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId }),
      }).catch(() => {});
    };
    localParticipant.on("localTrackUnpublished", onUnpublished as never);
    return () => {
      localParticipant.off("localTrackUnpublished", onUnpublished as never);
    };
  }, [localParticipant, interviewId]);

  useEffect(() => {
    if (!room) return;
    const onDisconnected = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      onReconnect("disconnected");
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, onReconnect]);

  // Transcript poll doubles as the server-side room heartbeat.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/interview/state?id=${encodeURIComponent(interviewId)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const { state } = (await res.json()) as { state: { status: string; turns: Turn[] } };
        setTurns(state.turns);
        if (state.status !== "live" && !endedRef.current) {
          endedRef.current = true;
          void room?.disconnect();
          onCompleted();
        }
      } catch {
        // transient — the next tick retries; a real drop fires Disconnected
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [interviewId, room, onCompleted]);

  useEffect(() => {
    railRef.current?.scrollTo({ top: railRef.current.scrollHeight });
  }, [turns.length]);

  // Watchdog: connected, but nobody ever joined to interview us.
  //
  // The connect timeout upstream only covers failing to reach LiveKit. This
  // covers the opposite and nastier case — the room is fine, the student is
  // live on camera, and no agent job was ever dispatched. Without this they
  // sit watching themselves until the budget expires, and the budget is
  // enforced by the agent that is not there. Reconnect to the same room and
  // preserve the same interview attempt.
  //
  // Two things were wrong with this. It counted a SUBSCRIBED AUDIO TRACK as
  // having heard from the interviewer, so an agent that joined and published
  // silence — a dead dialog loop, which is exactly what a quota outage
  // produces — passed forever while the student sat watching themselves. And
  // it was one-shot, so an agent that spoke once and then died was never
  // noticed at all. Only an actual agent TURN counts now, and the check
  // repeats: if the student has spoken and no agent turn has followed within
  // the grace period, the interviewer is gone whatever its track says.
  useEffect(() => {
    if (connectedAt === null) return;
    const interval = setInterval(() => {
      if (endedRef.current) return;
      const turns = turnsRef.current;
      const agentTurns = turns.filter((t) => t.speaker === "agent");

      // Presence first, because the turn-based checks below cannot see the
      // case that actually stranded a student. Matched on the interviewer's own
      // identity rather than "any remote participant": the two happen to be the
      // same thing today, and a stranded student is too expensive to spend on
      // that assumption holding. When the interviewer leaves, no agent will
      // ever rejoin that room — dispatch is automatic and
      // fires once, at room creation. The old logic returned early whenever the
      // last turn was the agent's, which is precisely the state a dead
      // interviewer leaves behind (its question is the last thing persisted,
      // and no student turn can follow because the STT died with it), so it
      // never fired at all. Reconnecting re-mints a token, which clears the
      // stranded room and gets a fresh agent that resumes the transcript.
      const agentPresent = room
        ? Array.from(room.remoteParticipants.values()).some(
            (p) => p.identity === AGENT_IDENTITY,
          )
        : false;
      if (agentPresent || agentLastSeenRef.current === 0) {
        agentLastSeenRef.current = Date.now();
      }
      if (
        !agentPresent &&
        agentTurns.length > 0 &&
        Date.now() - agentLastSeenRef.current > AGENT_GONE_GRACE_MS
      ) {
        endedRef.current = true;
        onReconnect("interviewer-left");
        return;
      }

      const lastAgentAt = agentTurns.length && lastAgentAtRef.current ? lastAgentAtRef.current : connectedAt;

      // The watchdog below is deliberately patient — NO_PROGRESS_MS is four
      // minutes, because a student thinking hard must never be cut off. But a
      // student staring at a dead interviewer has no way of knowing which of
      // the two is happening, and four minutes of a twenty-minute budget is a
      // fifth of their interview. So once the interviewer has been quiet for
      // much less than that, offer them the same recovery by hand.
      setStalled(Date.now() - lastAgentAt > MANUAL_REJOIN_AFTER_MS);

      // Present, but nothing has come out of it for minutes.
      if (agentPresent && agentTurns.length > 0 && Date.now() - lastAgentAt > NO_PROGRESS_MS) {
        endedRef.current = true;
        onReconnect("interviewer-silent");
        return;
      }

      const waitedTooLong = Date.now() - lastAgentAt > NO_AGENT_GRACE_MS;
      if (!waitedTooLong) return;
      // Before the first question, silence alone is enough. After it, only
      // treat it as dead if the student is actually waiting on a reply.
      const studentSpokeLast = turns.length > 0 && turns[turns.length - 1].speaker === "student";
      if (agentTurns.length > 0 && !studentSpokeLast) return;
      endedRef.current = true;
      onReconnect(agentTurns.length === 0 ? "no-interviewer" : "interviewer-stopped");
    }, 5_000);
    return () => clearInterval(interval);
  }, [connectedAt, room, onReconnect]);

  const cameraTrack = useTracks([Track.Source.Camera], { onlySubscribed: false }).find(
    (t) => t.participant.identity === localParticipant?.identity,
  );
  const agentAudio = useTracks([Track.Source.Microphone], { onlySubscribed: true }).find(
    (t) => t.participant.identity !== localParticipant?.identity,
  );

  // Read by the watchdog without making it re-arm on every render.
  useEffect(() => {
    agentPresentRef.current = Boolean(agentAudio);
  }, [agentAudio]);
  useEffect(() => {
    const hadAgentTurns = turnsRef.current.filter((t) => t.speaker === "agent").length;
    const hasAgentTurns = turns.filter((t) => t.speaker === "agent").length;
    if (hasAgentTurns > hadAgentTurns) lastAgentAtRef.current = Date.now();
    turnsRef.current = turns;
  }, [turns]);

  async function toggleMic() {
    if (!localParticipant) return;
    const next = !micEnabled;
    await localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }

  const overBudget = elapsed > budgetMinutes * 60;

  return (
    <>
      <RoomAudioRenderer />

      <header className={styles.header}>
        <span className={styles.wordmark}>
          Pra<span className={styles.wordmarkAccent}>x</span>el
          <span className={styles.wordmarkSuffix}>Interview</span>
        </span>
        <span className={styles.headerRight}>
          <span className={`${styles.badge} ${isConnected ? styles.badgeLive : styles.badgeIdle}`}>
            <span className={styles.dot} aria-hidden />
            {isConnected ? "Live" : "Connecting"}
          </span>
          <span
            className={`${styles.clock} ${overBudget ? styles.clockOver : ""}`}
            aria-label="Time elapsed"
          >
            {formatTime(elapsed)} / {budgetMinutes}:00
          </span>
        </span>
      </header>

      <div className={styles.body}>
        <div className={styles.stage}>
          <div className={styles.video}>
            {cameraTrack && !videoLost ? (
              <ParticipantTile
                trackRef={cameraTrack}
                disableSpeakingIndicator
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <div className={styles.videoPlaceholder}>
                <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.6875rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {videoLost ? "Camera stopped" : "Starting camera…"}
                </span>
                {videoLost && (
                  <span style={{ fontSize: "0.8125rem", maxWidth: "26rem", lineHeight: 1.5 }}>
                    The conversation is continuing on audio. Nothing is lost.
                  </span>
                )}
              </div>
            )}
            <span className={styles.videoLabel}>You · recorded</span>
          </div>

          <div className={styles.interviewer}>
            <span className={styles.interviewerLabel}>Interviewer</span>
            {agentAudio ? (
              <BarVisualizer trackRef={agentAudio} barCount={9} style={{ height: 40, flex: "0 0 auto" }} />
            ) : (
              <IdleBars active={isConnected} />
            )}
            <p className={styles.interviewerHint}>
              {isConnected
                ? "Just talk naturally — one question at a time."
                : "Setting up your connection…"}
            </p>
          </div>
        </div>

        <aside className={styles.rail}>
          <div className={styles.railHead}>Transcript</div>
          <div className={styles.railBody} ref={railRef}>
            {turns.length === 0 && (
              <p className={styles.railEmpty}>Your conversation will appear here as it happens.</p>
            )}
            {turns.map((t) => (
              <div key={t.turnNo} className={styles.turn}>
                <span
                  className={`${styles.turnWho} ${t.speaker === "agent" ? styles.turnAgent : styles.turnStudent}`}
                >
                  {t.speaker === "agent" ? "Interviewer" : "You"}
                </span>
                <p className={styles.turnText}>{t.text}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          onClick={() => void toggleMic()}
          aria-pressed={!micEnabled}
          className={`${styles.mic} ${micEnabled ? "" : styles.micOff}`}
        >
          {micEnabled ? "Mic on" : "Mic off"}
        </button>
        {/* Recovery the student can reach themselves. Four students in one
            evening sat in a room whose interviewer had died, not knowing that
            rejoining resumes the transcript rather than restarting it. */}
        {stalled && (
          <button
            type="button"
            onClick={() => {
              if (endedRef.current) return;
              endedRef.current = true;
              onReconnect("student-requested");
            }}
            className={styles.mic}
          >
            Interviewer not responding? Rejoin
          </button>
        )}
        {videoLost ? (
          <p className={styles.notice} role="status">
            {VIDEO_LOST_NOTICE}
          </p>
        ) : stalled ? (
          <span className={styles.footerHint}>
            Rejoining keeps your answers and picks up where you stopped.
          </span>
        ) : (
          <span className={styles.footerHint}>Ends on its own — there is nothing to click.</span>
        )}
      </footer>
    </>
  );
}
