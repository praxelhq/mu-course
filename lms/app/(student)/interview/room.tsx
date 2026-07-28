"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";

// U12 — the turn-based interview room (fallback-first transport over plain
// HTTPS). Consent gate → question (text always; audio when TTS ran) →
// MediaRecorder answer with level meter + re-record → upload → calm
// "thinking" state (5–15s per turn is normal) → next question → … → done.
// Typed answers appear only in dev text-mode or when no microphone exists.

type Turn = { turnNo: number; speaker: string; text: string; audioS3Key: string | null };
type Pending = { turnNo: number; text: string; audioS3Key: string | null } | null;
type State = {
  id: string;
  status: string;
  turns: Turn[];
  pendingQuestion: Pending;
};

type Phase = "entry" | "starting" | "live" | "thinking" | "completed" | "error";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export function InterviewRoom({
  canStart,
  canResume,
  textMode,
}: {
  canStart: boolean;
  canResume: boolean;
  textMode: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("entry");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [questionAudioUrl, setQuestionAudioUrl] = useState<string | null>(null);
  const [micAvailable, setMicAvailable] = useState(true);
  const [textAnswer, setTextAnswer] = useState("");

  // --- recording ---------------------------------------------------------
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<Blob | null>(null);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setLevel(0);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopMeter();
  }, [stopMeter]);

  useEffect(() => () => stopStream(), [stopStream]);

  const refreshQuestionAudio = useCallback(async (s: State) => {
    setQuestionAudioUrl(null);
    const q = s.pendingQuestion;
    if (!q?.audioS3Key) return;
    try {
      const { url } = await jsonFetch<{ url: string }>(
        `/api/interview/question-audio?id=${encodeURIComponent(s.id)}&turnNo=${q.turnNo}`,
      );
      setQuestionAudioUrl(url);
    } catch {
      // Audio is a nicety — the question text is always shown.
    }
  }, []);

  const applyState = useCallback(
    async (s: State) => {
      setState(s);
      if (s.status !== "live") {
        setPhase("completed");
        return;
      }
      setPhase("live");
      await refreshQuestionAudio(s);
    },
    [refreshQuestionAudio],
  );

  const begin = useCallback(async () => {
    setPhase("starting");
    setError(null);
    try {
      const res = await jsonFetch<{ state: State }>("/api/interview/start", { method: "POST" });
      await applyState(res.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the interview.");
      setPhase("error");
    }
  }, [applyState]);

  const startRecording = useCallback(async () => {
    setClip(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Level meter.
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(peak);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setClip(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        void ctx.close();
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setMicAvailable(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    stopStream();
  }, [stopStream]);

  const handleAnswerResponse = useCallback(
    async (res: { done: boolean; question?: { turnNo: number; question: string; audioS3Key: string | null } }) => {
      if (!state) return;
      if (res.done) {
        setPhase("completed");
        setState({ ...state, status: "completed" });
        return;
      }
      // Re-fetch the canonical state (transcript + pending question).
      const { state: fresh } = await jsonFetch<{ state: State }>(
        `/api/interview/state?id=${encodeURIComponent(state.id)}`,
      );
      await applyState(fresh);
    },
    [state, applyState],
  );

  const sendAudio = useCallback(async () => {
    if (!state || !clip) return;
    setPhase("thinking");
    setError(null);
    try {
      const contentType = clip.type.split(";")[0] || "audio/webm";
      const presign = await jsonFetch<{ url: string; key: string; headers: Record<string, string> }>(
        "/api/interview/answer-url",
        {
          method: "POST",
          body: JSON.stringify({
            interviewId: state.id,
            contentType,
            sizeBytes: clip.size,
          }),
        },
      );
      const put = await fetch(presign.url, { method: "PUT", headers: presign.headers, body: clip });
      if (!put.ok) throw new Error("Upload failed — please try again.");
      const res = await jsonFetch<{ done: boolean }>("/api/interview/answer", {
        method: "POST",
        body: JSON.stringify({ interviewId: state.id, audioS3Key: presign.key }),
      });
      setClip(null);
      await handleAnswerResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong sending your answer.");
      setPhase("live");
    }
  }, [state, clip, handleAnswerResponse]);

  const sendText = useCallback(async () => {
    if (!state || !textAnswer.trim()) return;
    setPhase("thinking");
    setError(null);
    try {
      const res = await jsonFetch<{ done: boolean }>("/api/interview/answer", {
        method: "POST",
        body: JSON.stringify({ interviewId: state.id, text: textAnswer.trim() }),
      });
      setTextAnswer("");
      await handleAnswerResponse(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong sending your answer.");
      setPhase("live");
    }
  }, [state, textAnswer, handleAnswerResponse]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (phase === "entry" || phase === "starting" || phase === "error") {
    if (!canStart && !canResume) return null;
    return (
      <Card>
        <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.25rem", margin: "0 0 0.75rem" }}>
          Before you begin
        </h2>
        <p style={{ margin: "0 0 0.75rem", lineHeight: 1.6 }}>
          This is a short one-on-one conversation with our AI interviewer — around 10 to 12
          minutes, 8 to 10 questions about your industry and the work you have submitted this
          term. It is relaxed and adaptive; there are no trick questions.
        </p>
        <p style={{ margin: "0 0 0.75rem", lineHeight: 1.6, color: "var(--charcoal)" }}>
          <strong>What we record and why:</strong> your spoken answers (audio) and a written
          transcript are recorded and stored securely, solely for assessing this course
          component. Your instructor can review them. Recordings are retained for the duration
          of the course and the review period that follows, then handled per the programme&apos;s
          data policy. Scores never appear on your public profile.
        </p>
        <p style={{ margin: "0 0 1.25rem", lineHeight: 1.6, color: "var(--charcoal)" }}>
          Pressing Begin is your consent to this recording. Your microphone is only accessed
          after you consent.
        </p>
        {error && (
          <p style={{ color: "#8a3b1c", margin: "0 0 1rem" }}>{error}</p>
        )}
        <Button onClick={begin} disabled={phase === "starting"}>
          {phase === "starting"
            ? "Setting up your interview…"
            : canResume
              ? "Resume interview (I consent)"
              : "Begin interview (I consent)"}
        </Button>
      </Card>
    );
  }

  if (phase === "completed") {
    return (
      <Card>
        <h2 style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.25rem", margin: "0 0 0.75rem" }}>
          That&apos;s a wrap — thank you
        </h2>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Your interview is recorded. Grading takes a while: your responses go through the
          grading AI and then your instructor. You&apos;ll get a notification when there&apos;s
          news — nothing more for you to do here.
        </p>
      </Card>
    );
  }

  const question = state?.pendingQuestion ?? null;
  const showTextInput = textMode || !micAvailable;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <Card>
        {phase === "thinking" ? (
          <div>
            <p style={{ margin: 0, fontFamily: "var(--font-geist-mono)", fontSize: "0.8125rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--clay)" }}>
              The interviewer is thinking…
            </p>
            <p style={{ margin: "0.5rem 0 0", color: "var(--charcoal)" }}>
              Listening back to your answer and choosing the next question. This usually takes
              five to fifteen seconds — no need to do anything.
            </p>
          </div>
        ) : question ? (
          <div>
            <p style={{ margin: 0, fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
              Question
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "1.125rem", lineHeight: 1.6 }}>{question.text}</p>
            {questionAudioUrl && (
              <audio controls autoPlay src={questionAudioUrl} style={{ marginTop: "1rem", width: "100%" }} />
            )}
          </div>
        ) : (
          <p style={{ margin: 0, color: "var(--charcoal)" }}>Waiting for the next question…</p>
        )}
      </Card>

      {phase === "live" && question && (
        <Card>
          {!showTextInput ? (
            <div>
              {recording ? (
                <div>
                  <div aria-label="Microphone level" style={{ height: "6px", background: "var(--sand)", marginBottom: "1rem" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.round(level * 140))}%`, background: "var(--pine)", transition: "width 80ms linear" }} />
                  </div>
                  <Button onClick={stopRecording}>Stop recording</Button>
                </div>
              ) : clip ? (
                <div style={{ display: "grid", gap: "1rem" }}>
                  <audio controls src={URL.createObjectURL(clip)} style={{ width: "100%" }} />
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <Button onClick={sendAudio}>Send answer</Button>
                    <Button onClick={startRecording}>Re-record</Button>
                  </div>
                </div>
              ) : (
                <Button onClick={startRecording}>Record your answer</Button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--clay)" }}>
                {micAvailable
                  ? "Text mode (dev fallback) — type your answer."
                  : "No microphone detected — type your answer instead."}
              </p>
              <textarea
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                rows={4}
                style={{ border: "1px solid var(--sand)", background: "var(--parchment)", padding: "0.75rem", fontFamily: "var(--font-geist-sans)", fontSize: "0.9375rem", resize: "vertical" }}
                placeholder="Your answer…"
              />
              <div>
                <Button onClick={sendText} disabled={!textAnswer.trim()}>Send answer</Button>
              </div>
            </div>
          )}
          {error && <p style={{ color: "#8a3b1c", margin: "1rem 0 0" }}>{error}</p>}
        </Card>
      )}

      {state && state.turns.length > 0 && (
        <Card>
          <p style={{ margin: "0 0 1rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--clay)" }}>
            Transcript so far
          </p>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {state.turns.map((t) => (
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
