"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { cameraRemediation, classifyCameraError } from "@/lib/interview/video";

// Lobby: consent, a visible device check, and the door into the interview.
//
// The check is shown BEFORE the student commits, so a blocked camera is a
// calm problem on a page where nothing is running — not a discovery made
// thirty seconds into a graded, recorded conversation.

type Status = "checking" | "ready" | "blocked";

export function InterviewStart({ canResume }: { canResume: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        // Held only long enough to prove the devices work, then released so
        // the camera light does not sit on while the student reads.
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (cancelled) return;
        setProblem(null);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProblem(cameraRemediation(classifyCameraError(err)));
        setStatus("blocked");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
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
          {status === "ready" && "Camera and microphone are working. You're good to go."}
          {status === "blocked" && problem}
        </p>
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
        <Link href="/interview/live" style={{ textDecoration: "none" }}>
          <Button>{canResume ? "Rejoin interview" : "Start interview →"}</Button>
        </Link>
      ) : (
        <Button disabled>{canResume ? "Rejoin interview" : "Start interview →"}</Button>
      )}
    </Card>
  );
}
