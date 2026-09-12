"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { cameraRemediation, classifyCameraError } from "@/lib/interview/video";
import { createMicMeter, meterFraction, type MicMeter } from "@/lib/interview/mic-level";

// Lobby: consent, a visible device check, and the door into the interview.
//
// The check is shown BEFORE the student commits, so a blocked camera is a
// calm problem on a page where nothing is running — not a discovery made
// thirty seconds into a graded, recorded conversation.
//
// Granted permission was never the same thing as a working microphone, and
// the gap between the two cost students whole attempts: a muted headset or
// the wrong default input passes the permission check and then says nothing
// for twenty minutes. So the student now has to see their own voice move a
// meter before the door opens.

type Status = "checking" | "ready" | "blocked";

/** How long we wait to hear the student before saying so. */
const LISTEN_WINDOW_MS = 12_000;

export function InterviewStart({ canResume }: { canResume: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [level, setLevel] = useState(0);
  const [heardVoice, setHeardVoice] = useState(false);
  /** Set once the listening window closes having heard nothing. */
  const [micSilent, setMicSilent] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<MicMeter | null>(null);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;

    const release = () => {
      if (poll) clearInterval(poll);
      if (deadline) clearTimeout(deadline);
      meterRef.current?.stop();
      meterRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // The camera only had to prove it opens — drop it straight away so the
        // camera light is not sitting on while the student reads the consent
        // copy. The microphone stays open, because it has something left to
        // prove and a meter cannot read a stopped track.
        stream.getVideoTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        // Settled here rather than in the effect body: a synchronous setState
        // on mount cascades a second render before paint, and "Check again"
        // needs these cleared anyway, which this covers on both paths.
        setLevel(0);
        setHeardVoice(false);
        setMicSilent(false);
        setProblem(null);
        setStatus("ready");

        const meter = createMicMeter(stream);
        if (!meter) {
          // No Web Audio: permission is all we can honestly verify, so don't
          // manufacture a warning the student has no way to act on.
          setHeardVoice(true);
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          return;
        }
        meterRef.current = meter;
        poll = setInterval(() => {
          setLevel(meter.level());
          if (meter.heard()) {
            setHeardVoice(true);
            setMicSilent(false);
            release();
          }
        }, 100);
        deadline = setTimeout(() => {
          if (!meter.heard()) setMicSilent(true);
        }, LISTEN_WINDOW_MS);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProblem(cameraRemediation(classifyCameraError(err)));
        setStatus("blocked");
      });

    return () => {
      cancelled = true;
      release();
    };
  }, [attempt]);

  return (
    <Card>
      <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.25rem", margin: "0 0 0.75rem" }}>
        Before you begin
      </h2>
      <p style={{ margin: "0 0 0.75rem", lineHeight: 1.6 }}>
        A one-on-one conversation with our AI interviewer — about 15 minutes, on your own
        work. It is relaxed and adaptive, and there are no trick questions. Speak naturally;
        accent and grammar are never marked.
      </p>
      <p style={{ margin: "0 0 0.75rem", lineHeight: 1.6, color: "var(--charcoal)" }}>
        <strong>What we record and why:</strong> your spoken answers, <strong>video from your
        camera</strong>, and a written transcript, stored securely and used solely to assess
        this course component. Your instructor can review them. Recordings are kept for the
        course and its review period, then deleted per the programme&apos;s data policy.
        Scores never appear on your public profile.
      </p>
      <p style={{ margin: "0 0 1.25rem", lineHeight: 1.6, color: "var(--charcoal)" }}>
        Starting is your consent to this recording. A working camera is required to begin; if
        it stops part-way the interview simply continues on audio.
      </p>

      {/* device check */}
      <div
        style={{
          border: `1px solid ${status === "blocked" ? "var(--ochre)" : "var(--sand)"}`,
          padding: "0.875rem 1rem",
          marginBottom: "1.25rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: status === "blocked" ? "var(--ochre)" : "var(--clay)",
          }}
        >
          Camera and mic
        </p>
        <p style={{ margin: "0.375rem 0 0", lineHeight: 1.55, color: "var(--charcoal)" }}>
          {status === "checking" && "Checking your camera and microphone…"}
          {status === "ready" &&
            (heardVoice
              ? "Camera and microphone are working — we can hear you. You're good to go."
              : "Camera is working. Now say something out loud so we can check your microphone.")}
          {status === "blocked" && problem}
        </p>

        {/* Level meter. The student has to watch their own voice move this
            before starting, because "permission granted" and "we can hear
            you" turned out to be very different things. */}
        {status === "ready" && !heardVoice && (
          <div
            aria-hidden="true"
            style={{
              marginTop: "0.75rem",
              height: 8,
              background: "var(--sand)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(meterFraction(level) * 100)}%`,
                background: micSilent ? "var(--ochre)" : "var(--pine)",
                transition: "width 90ms linear",
              }}
            />
          </div>
        )}

        {status === "ready" && micSilent && (
          <p style={{ margin: "0.75rem 0 0", lineHeight: 1.55, color: "var(--ochre)" }}>
            We still haven&apos;t heard anything. Check that the right microphone is selected
            in your browser and that your headset is not muted — a muted mic looks exactly
            like a working one until the interview starts. Speak again, or use{" "}
            <strong>Check again</strong> after switching device.
          </p>
        )}

        {status === "ready" && !heardVoice && (
          <button
            type="button"
            onClick={() => {
              setStatus("checking");
              setAttempt((n) => n + 1);
            }}
            style={{
              marginTop: "0.75rem",
              minHeight: 40,
              padding: "0 1rem",
              border: "1px solid var(--pine)",
              background: "transparent",
              color: "var(--pine)",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Check again
          </button>
        )}
        {status === "blocked" && (
          <button
            type="button"
            onClick={() => {
              setStatus("checking");
              setAttempt((n) => n + 1);
            }}
            style={{
              marginTop: "0.75rem",
              minHeight: 40,
              padding: "0 1rem",
              border: "1px solid var(--pine)",
              background: "transparent",
              color: "var(--pine)",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Check again
          </button>
        )}
      </div>

      {status === "ready" ? (
        <>
          <Link href="/interview/live" style={{ textDecoration: "none" }}>
            <Button>{canResume ? "Rejoin interview" : "Start interview →"}</Button>
          </Link>
          {/* Deliberately not a hard block. A student on an unusual setup near
              the deadline must never be locked out by our own check — but they
              should know exactly what they are walking into. */}
          {!heardVoice && (
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.55, color: "var(--charcoal)" }}>
              You can start without this check passing, but if we cannot hear you the
              interviewer will keep asking the same question while your time runs down.
              It is worth sorting the microphone first.
            </p>
          )}
        </>
      ) : (
        <Button disabled>{canResume ? "Rejoin interview" : "Start interview →"}</Button>
      )}
    </Card>
  );
}
