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

export function MeetingView({
  interviewId,
  budgetMinutes,
  onFallback,
  onCompleted,
}: {
  interviewId: string;
  budgetMinutes: number;
  onFallback: (reason: string) => void;
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
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoLost, setVideoLost] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const endedRef = useRef(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  const isConnected = connectionState === ConnectionState.Connected;

  useEffect(() => {
    if (!room) return;
    const onConnected = () => setConnectedAt((prev) => prev ?? Date.now());
    room.on(RoomEvent.Connected, onConnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room]);

  useEffect(() => {
    if (connectedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);

  const elapsed = useMemo(
    () => (connectedAt === null ? 0 : Math.max(0, Math.floor((now - connectedAt) / 1000))),
    [connectedAt, now],
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
      onFallback("disconnected");
    };
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, onFallback]);

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

  const cameraTrack = useTracks([Track.Source.Camera], { onlySubscribed: false }).find(
    (t) => t.participant.identity === localParticipant?.identity,
  );
  const agentAudio = useTracks([Track.Source.Microphone], { onlySubscribed: true }).find(
    (t) => t.participant.identity !== localParticipant?.identity,
  );

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
        {videoLost ? (
          <p className={styles.notice} role="status">
            {VIDEO_LOST_NOTICE}
          </p>
        ) : (
          <span className={styles.footerHint}>Ends on its own — there is nothing to click.</span>
        )}
      </footer>
    </>
  );
}
