"use client";

import { useEffect, useRef, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import { Card } from "@/components/ui";
import {
  CAMERA_REQUIRED_NOTICE,
  cameraRemediation,
  classifyCameraError,
} from "@/lib/interview/video";
import { MeetingView } from "./meeting-view";
import styles from "./room.module.css";

// Connects the student to the LiveKit room and hands off to MeetingView.
//
// This component no longer worries about layout: it lives on /interview/live,
// which is already a full screen with no app shell around it. Its remaining
// jobs are the camera gate and the reconnect path.
//
// A connect timeout (~8s), a disconnect, or sustained poor quality remints a
// token for the same LiveKit interview. The single attempt is never replaced.

const CONNECT_TIMEOUT_MS = 8_000;
const BUDGET_MINUTES = 15;

type Phase = "checking" | "blocked" | "connecting" | "live";

export function RealtimeRoom({
  url,
  token,
  interviewId,
  onReconnect,
  onCompleted,
}: {
  url: string;
  token: string;
  interviewId: string;
  onReconnect: (reason: string) => void;
  onCompleted: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [cameraError, setCameraError] = useState<string | null>(null);
  /** Bumped by "Try again" to re-run the camera check. */
  const [attempt, setAttempt] = useState(0);
  const endedRef = useRef(false);
  const reconnectRef = useRef(onReconnect);
  const completedRef = useRef(onCompleted);
  useEffect(() => {
    reconnectRef.current = onReconnect;
    completedRef.current = onCompleted;
  }, [onReconnect, onCompleted]);

  // Camera gate. The lobby already ran a device check, but permission can be
  // revoked between screens, so this is re-proved before joining. State
  // settles in the promise callbacks, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        // Release immediately — LiveKit acquires its own tracks on connect.
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        setCameraError(null);
        setPhase("connecting");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraError(cameraRemediation(classifyCameraError(err)));
        setPhase("blocked");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Connect timeout: no long spinners on a graded assessment.
  useEffect(() => {
    if (phase !== "connecting") return;
    const timer = setTimeout(() => {
      if (endedRef.current) return;
      endedRef.current = true;
      reconnectRef.current("connect-failed");
    }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "blocked") {
    return (
      <div className={styles.centered}>
        <Card>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ochre)",
            }}
          >
            Camera needed
          </p>
          <p style={{ margin: "0.5rem 0 0", lineHeight: 1.6 }}>{CAMERA_REQUIRED_NOTICE}</p>
          <p style={{ margin: "0.75rem 0 1.25rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
            {cameraError}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("checking");
              setAttempt((n) => n + 1);
            }}
            style={{
              minHeight: 44,
              padding: "0 1.25rem",
              border: "1px solid var(--pine)",
              background: "var(--pine)",
              color: "var(--parchment)",
              cursor: "pointer",
              fontSize: "0.9375rem",
            }}
          >
            Try again
          </button>
        </Card>
      </div>
    );
  }

  if (phase === "checking") {
    return (
      <div className={styles.centered}>
        <p style={{ color: "var(--charcoal)" }}>Checking your camera…</p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect
      audio
      video
      onConnected={() => setPhase("live")}
      onDisconnected={() => {
        if (endedRef.current) return;
        endedRef.current = true;
        reconnectRef.current("disconnected");
      }}
      onError={() => {
        if (endedRef.current) return;
        endedRef.current = true;
        reconnectRef.current("connect-failed");
      }}
      style={{ display: "contents" }}
    >
      <MeetingView
        interviewId={interviewId}
        budgetMinutes={BUDGET_MINUTES}
        onReconnect={(reason) => {
          if (endedRef.current) return;
          endedRef.current = true;
          reconnectRef.current(reason);
        }}
        onCompleted={() => {
          if (endedRef.current) return;
          endedRef.current = true;
          completedRef.current();
        }}
      />
    </LiveKitRoom>
  );
}
