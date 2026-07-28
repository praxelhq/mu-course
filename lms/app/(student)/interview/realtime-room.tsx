"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";

// U13 — the realtime (LiveKit) interview room. Audio-only: publish the mic,
// play the agent's audio, and show the live transcript by polling the state
// endpoint every 5s (the poll doubles as the server-side heartbeat).
//
// Degradation is this component's whole job: connect failure within ~8s,
// a mid-session disconnect, or sustained poor connection quality all call
// onFallback — the orchestrator flips the interview to the turn-based loop
// in place. The student never loses the session or the transcript.

type Turn = { turnNo: number; speaker: string; text: string };
type State = { id: string; status: string; turns: Turn[] };

const CONNECT_TIMEOUT_MS = 8_000;
const POOR_QUALITY_SUSTAINED_MS = 10_000;
const STATE_POLL_MS = 5_000;

export function RealtimeRoom({
  url,
  token,
  interviewId,
  onFallback,
  onCompleted,
}: {
  url: string;
  token: string;
  interviewId: string;
  onFallback: (reason: string) => void;
  onCompleted: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const endedRef = useRef(false); // completed or fallen back — ignore late events
  const fallbackRef = useRef(onFallback);
  const completedRef = useRef(onCompleted);
  useEffect(() => {
    fallbackRef.current = onFallback;
    completedRef.current = onCompleted;
  }, [onFallback, onCompleted]);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let poorTimer: ReturnType<typeof setTimeout> | undefined;
    let room: import("livekit-client").Room | undefined;

    const end = (fn: () => void) => {
      if (endedRef.current || cancelled) return;
      endedRef.current = true;
      fn();
    };

    async function run() {
      try {
        const { Room, RoomEvent, ConnectionQuality, Track } = await import("livekit-client");
        room = new Room();

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio && audioRef.current) {
            audioRef.current.appendChild(track.attach());
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          end(() => fallbackRef.current("disconnected"));
        });
        room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
          if (participant !== room?.localParticipant) return;
          if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
            poorTimer ??= setTimeout(() => {
              void room?.disconnect();
              end(() => fallbackRef.current("poor-connection"));
            }, POOR_QUALITY_SUSTAINED_MS);
          } else {
            clearTimeout(poorTimer);
            poorTimer = undefined;
          }
        });

        // Connect within the timeout or degrade — no long spinners.
        await Promise.race([
          room.connect(url, token),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("connect timeout")), CONNECT_TIMEOUT_MS),
          ),
        ]);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled) {
          void room.disconnect();
          return;
        }
        setConnected(true);
      } catch {
        void room?.disconnect().catch(() => {});
        end(() => fallbackRef.current("connect-failed"));
        return;
      }

      // Transcript poll (also the server-side heartbeat).
      poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/interview/state?id=${encodeURIComponent(interviewId)}`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const { state } = (await res.json()) as { state: State };
          if (cancelled) return;
          setTurns(state.turns);
          if (state.status !== "live") {
            void room?.disconnect();
            end(() => completedRef.current());
          }
        } catch {
          // transient — the next tick retries; a real drop fires Disconnected
        }
      }, STATE_POLL_MS);
    }

    void run();
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(poorTimer);
      void room?.disconnect().catch(() => {});
    };
  }, [url, token, interviewId]);

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <Card>
        <p style={{ margin: 0, fontFamily: "var(--font-geist-mono)", fontSize: "0.8125rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clay)" }}>
          {connected ? "Live conversation in progress" : "Connecting you to the interviewer…"}
        </p>
        <p style={{ margin: "0.5rem 0 0", color: "var(--charcoal)", lineHeight: 1.6 }}>
          {connected
            ? "Just talk naturally — the interviewer hears you and will ask one question at a time. It wraps up on its own; there is nothing to click."
            : "Setting up your audio connection. If this takes more than a few seconds we switch you to step-by-step mode automatically."}
        </p>
        <div ref={audioRef} />
      </Card>

      {turns.length > 0 && (
        <Card>
          <p style={{ margin: "0 0 1rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
            Transcript so far
          </p>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {turns.map((t) => (
              <div key={t.turnNo} style={{ borderTop: "1px solid var(--sand)", paddingTop: "0.75rem" }}>
                <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: t.speaker === "agent" ? "var(--pine)" : "var(--charcoal)" }}>
                  {t.speaker === "agent" ? "Interviewer" : "You"}
                </span>
                <p style={{ margin: "0.25rem 0 0", lineHeight: 1.55 }}>{t.text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
