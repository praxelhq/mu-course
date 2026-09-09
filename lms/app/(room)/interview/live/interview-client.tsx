"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { RealtimeRoom } from "./realtime-room";
import styles from "./room.module.css";

type Mode = "requesting" | "waiting" | "reconnecting" | "realtime" | "unavailable" | "done";

type TokenResponse = {
  token?: string;
  url?: string;
  interviewId?: string;
  startedAt?: string;
  waiting?: boolean;
  error?: string;
};

/**
 * A graded voice interview has one transport: the LiveKit room. A transient
 * disconnect retries that room; it must never turn into an unproctored manual
 * recorder that looks like a completed interview.
 */
export function InterviewRoom() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("requesting");
  const [message, setMessage] = useState<string | null>(null);
  const [rt, setRt] = useState<{
    url: string;
    token: string;
    interviewId: string;
    startedAt: string | null;
  } | null>(null);
  const tokenRequestRef = useRef(0);
  const hasStartedRef = useRef(false);

  const requestRealtime = useCallback(async (silent = false) => {
    const requestId = ++tokenRequestRef.current;
    if (!silent) setMode("requesting");
    try {
      const res = await fetch("/api/interview/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as TokenResponse;
      if (requestId !== tokenRequestRef.current) return;
      if (res.ok && body.token && body.url && body.interviewId) {
        hasStartedRef.current = true;
        setRt({
          url: body.url,
          token: body.token,
          interviewId: body.interviewId,
          startedAt: body.startedAt ?? null,
        });
        setMessage(null);
        setMode("realtime");
        return;
      }
      if (res.status === 429 && body.waiting) {
        setMode("waiting");
        return;
      }
      setMessage(
        body.error ??
          "The real-time interviewer is unavailable. Your attempt has not started; please try again shortly.",
      );
      setMode("unavailable");
    } catch {
      if (requestId !== tokenRequestRef.current) return;
      setMessage(
        hasStartedRef.current
          ? "We could not reach your live interviewer. Your recorded progress is safe while we reconnect you."
          : "We could not reach the real-time interview service. Your attempt has not started.",
      );
      setMode("unavailable");
    }
  }, []);

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void requestRealtime(true);
  }, [requestRealtime]);

  // A queue or a worker restart should resolve without the student needing to
  // refresh. Neither branch starts a second attempt: /token is resume-safe.
  useEffect(() => {
    if (mode !== "waiting" && mode !== "unavailable") return;
    const timer = setInterval(() => void requestRealtime(true), 10_000);
    return () => clearInterval(timer);
  }, [mode, requestRealtime]);

  useEffect(() => {
    if (mode === "done") router.replace("/interview/result");
  }, [mode, router]);

  const reconnect = useCallback(
    (reason: string) => {
      setRt(null);
      setMessage(
        reason === "disconnected"
          ? "Your connection changed. Rejoining your live interview…"
          : "Reconnecting you to your live interviewer…",
      );
      setMode("reconnecting");
      void requestRealtime(true);
    },
    [requestRealtime],
  );

  if (mode === "realtime" && rt) {
    return (
      <RealtimeRoom
        key={rt.token}
        url={rt.url}
        token={rt.token}
        interviewId={rt.interviewId}
        startedAt={rt.startedAt}
        onReconnect={reconnect}
        onCompleted={() => setMode("done")}
      />
    );
  }

  if (mode === "done") {
    return (
      <div className={styles.centered}>
        <p style={{ color: "var(--charcoal)" }}>Wrapping up your interview…</p>
      </div>
    );
  }

  if (mode === "waiting") {
    return (
      <div className={styles.centered}>
        <Card>
          <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.25rem", margin: "0 0 0.75rem" }}>
            You&apos;re in the queue
          </h2>
          <p style={{ margin: 0, lineHeight: 1.6, color: "var(--charcoal)" }}>
            All live interview rooms are busy. Keep this page open and we&apos;ll connect you automatically. Your attempt is safe and has not started.
          </p>
        </Card>
      </div>
    );
  }

  if (mode === "unavailable") {
    return (
      <div className={styles.centered}>
        <Card>
          <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.25rem", margin: "0 0 0.75rem" }}>
            Live interviewer reconnecting
          </h2>
          <p style={{ margin: "0 0 1rem", lineHeight: 1.6, color: "var(--charcoal)" }}>{message}</p>
          <Button onClick={() => void requestRealtime()}>Try again</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.centered}>
      <Card>
        <p style={{ margin: 0, color: "var(--charcoal)" }}>
          {mode === "reconnecting" ? message : "Setting up your live interview…"}
        </p>
      </Card>
    </div>
  );
}
