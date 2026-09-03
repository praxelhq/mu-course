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

// The live interview surface.
//
// Layout differs deliberately from a normal video call: there is no second
// face to look at, because the interviewer is voice-only. So the student's own
// camera is the HERO tile rather than a thumbnail — in a recorded viva their
// video is the artifact being produced, and seeing themselves framed and lit
// is the useful feedback. The interviewer gets a presence panel (speaking
// bars + status) instead of an empty avatar box.

type Turn = { turnNo: number; speaker: string; text: string };

const mono = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.6875rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Stand-in bars while the interviewer's audio track is still subscribing. */
function IdleBars({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: active ? 10 + ((i * 7) % 22) : 6,
            background: active ? "var(--sand)" : "var(--sand)",
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

  // Lazily seeded so we never setState synchronously inside an effect; the
  // RoomEvent below covers the case where we mount before the room connects.
  const [connectedAt, setConnectedAt] = useState<number | null>(() =>
    room?.state === ConnectionState.Connected ? Date.now() : null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoLost, setVideoLost] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const endedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

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

  // A real disconnect degrades to the turn-based loop in place.
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
        const res = await fetch(
          `/api/interview/state?id=${encodeURIComponent(interviewId)}`,
          { cache: "no-store" },
        );
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
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
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
    <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }}>
      <RoomAudioRenderer />

      {/* ---------------- main column ---------------- */}
      <section style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            border: "1px solid var(--sand)",
            padding: "0.625rem 0.875rem",
            background: "var(--parchment)",
          }}
        >
          <span
            style={{
              ...mono,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: isConnected ? "var(--parchment)" : "var(--charcoal)",
              background: isConnected ? "var(--pine)" : "transparent",
              border: `1px solid ${isConnected ? "var(--pine)" : "var(--sand)"}`,
              padding: "0.25rem 0.5rem",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                background: isConnected ? "var(--ochre)" : "var(--clay)",
                display: "inline-block",
              }}
            />
            {isConnected ? "Live" : "Connecting"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.9375rem",
              fontVariantNumeric: "tabular-nums",
              color: overBudget ? "var(--ochre)" : "var(--charcoal)",
            }}
            aria-label="Time elapsed"
          >
            {formatTime(elapsed)} <span style={{ color: "var(--clay)" }}>/ {budgetMinutes}:00</span>
          </span>
        </div>

        {/* Student camera: the hero, because it is what gets recorded. */}
        <div
          style={{
            position: "relative",
            border: "1px solid var(--sand)",
            background: "var(--ink)",
            aspectRatio: "16 / 9",
            overflow: "hidden",
          }}
        >
          {cameraTrack && !videoLost ? (
            <ParticipantTile trackRef={cameraTrack} disableSpeakingIndicator style={{ width: "100%", height: "100%" }} />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "var(--parchment)",
              }}
            >
              <span style={{ ...mono, color: "var(--clay)" }}>
                {videoLost ? "Camera stopped" : "Starting camera…"}
              </span>
              {videoLost && (
                <span style={{ fontSize: "0.8125rem", color: "var(--sand)", maxWidth: "28rem", textAlign: "center", lineHeight: 1.5 }}>
                  The conversation is continuing on audio. Nothing is lost.
                </span>
              )}
            </div>
          )}
          <span
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              ...mono,
              color: "var(--parchment)",
              background: "rgba(31,26,20,0.66)",
              padding: "0.25rem 0.5rem",
            }}
          >
            You · recorded
          </span>
        </div>

        {/* Interviewer presence: no face to show, so show that it is speaking. */}
        <div style={{ border: "1px solid var(--sand)", background: "var(--parchment)", padding: "1rem 1.125rem" }}>
          <div style={{ ...mono, color: "var(--clay)", marginBottom: "0.75rem" }}>Interviewer</div>
          {agentAudio ? (
            <BarVisualizer trackRef={agentAudio} barCount={9} style={{ height: 56 }} />
          ) : (
            <IdleBars active={isConnected} />
          )}
          <p style={{ margin: "0.75rem 0 0", color: "var(--charcoal)", lineHeight: 1.55, fontSize: "0.875rem" }}>
            {isConnected
              ? "Just talk naturally — one question at a time. It wraps up on its own."
              : "Setting up your connection. If this takes more than a few seconds we switch you to step-by-step mode."}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <button
            type="button"
            onClick={() => void toggleMic()}
            aria-pressed={!micEnabled}
            style={{
              minHeight: 44,
              padding: "0 1.25rem",
              border: `1px solid ${micEnabled ? "var(--pine)" : "var(--ochre)"}`,
              background: micEnabled ? "var(--pine)" : "var(--ochre)",
              color: "var(--parchment)",
              cursor: "pointer",
              fontSize: "0.9375rem",
            }}
          >
            {micEnabled ? "Mic on" : "Mic off"}
          </button>
          <span style={{ fontSize: "0.8125rem", color: "var(--clay)" }}>
            Ends on its own — there is nothing to click.
          </span>
        </div>

        {videoLost && (
          <p role="status" style={{ margin: 0, color: "var(--ochre)", fontSize: "0.875rem", lineHeight: 1.55 }}>
            {VIDEO_LOST_NOTICE}
          </p>
        )}
      </section>

      {/* ---------------- transcript ---------------- */}
      <aside style={{ minWidth: 0 }}>
        <div
          style={{
            position: "sticky",
            top: "1.5rem",
            border: "1px solid var(--sand)",
            background: "var(--parchment)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 3rem)",
          }}
        >
          <div style={{ ...mono, color: "var(--clay)", padding: "1rem 1.125rem", borderBottom: "1px solid var(--sand)" }}>
            Transcript
          </div>
          <div ref={transcriptRef} style={{ overflowY: "auto", padding: "0.5rem 1.125rem 1.125rem" }}>
            {turns.length === 0 && (
              <p style={{ color: "var(--clay)", fontSize: "0.875rem", marginTop: "1rem" }}>
                Your conversation will appear here as it happens.
              </p>
            )}
            {turns.map((t) => (
              <div key={t.turnNo} style={{ paddingTop: "0.875rem" }}>
                <span style={{ ...mono, color: t.speaker === "agent" ? "var(--pine)" : "var(--ochre)" }}>
                  {t.speaker === "agent" ? "Interviewer" : "You"}
                </span>
                <p style={{ margin: "0.25rem 0 0", lineHeight: 1.55, fontSize: "0.875rem", color: "var(--ink)" }}>
                  {t.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
