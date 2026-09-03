"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
// Two jobs live here rather than in the view:
//   1. Tech check — camera and mic are proven BEFORE connecting, so a student
//      never lands in a live graded interview only to discover their camera is
//      blocked. Video is required to start; losing it later is not terminal.
//   2. Degradation — a connect timeout (~8s), a disconnect, or sustained poor
//      quality flips the interview to the turn-based loop in place. The same
//      interview continues and the single attempt is never burned.
//
// The live room is PORTALLED to document.body and rendered full-screen. It is
// a timed, recorded, graded conversation, so it takes the whole viewport
// instead of sitting in the page's content column underneath the upload card.
// The student should have nothing else on screen and nothing to scroll away
// from — the camera included.

const CONNECT_TIMEOUT_MS = 8_000;
const BUDGET_MINUTES = 15;

type Phase = "checking" | "blocked" | "connecting" | "live";

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
  const [phase, setPhase] = useState<Phase>("checking");
  const [cameraError, setCameraError] = useState<string | null>(null);
  /** Bumped by "Try again" to re-run the tech check. */
  const [attempt, setAttempt] = useState(0);
  const endedRef = useRef(false);
  const fallbackRef = useRef(onFallback);
  const completedRef = useRef(onCompleted);
  useEffect(() => {
    fallbackRef.current = onFallback;
    completedRef.current = onCompleted;
  }, [onFallback, onCompleted]);

  // Tech check: prove camera + mic before joining anything. State settles in
  // the promise callbacks, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        // Release immediately — LiveKit acquires its own tracks on connect.
        // This is a permission and device probe, not the capture itself.
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
      fallbackRef.current("connect-failed");
    }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Lock the page behind the overlay so the interview cannot be scrolled away.
  useEffect(() => {
    if (phase !== "connecting" && phase !== "live") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  if (phase === "blocked") {
    return (
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
    );
  }

  // The portal needs a DOM. The first render is always the tech-check card
  // (phase starts as "checking"), so there is no hydration mismatch here.
  if (phase === "checking" || typeof document === "undefined") {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--charcoal)", lineHeight: 1.6 }}>
          Checking your camera and microphone…
        </p>
      </Card>
    );
  }

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Interview in progress"
    >
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
          fallbackRef.current("disconnected");
        }}
        onError={() => {
          if (endedRef.current) return;
          endedRef.current = true;
          fallbackRef.current("connect-failed");
        }}
        style={{ display: "contents" }}
      >
        <MeetingView
          interviewId={interviewId}
          budgetMinutes={BUDGET_MINUTES}
          onFallback={(reason) => {
            if (endedRef.current) return;
            endedRef.current = true;
            fallbackRef.current(reason);
          }}
          onCompleted={() => {
            if (endedRef.current) return;
            endedRef.current = true;
            completedRef.current();
          }}
        />
      </LiveKitRoom>
    </div>,
    document.body,
  );
}
