"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { useRouter } from "next/navigation";
import { RealtimeRoom } from "./realtime-room";
import styles from "./room.module.css";

// The interview room. One orchestrator (InterviewRoom) owns consent
// and transport selection; the SERVER decides which transport runs:
//
//   consent → POST /api/interview/token
//     200 {token,...}            → realtime LiveKit room (RealtimeRoom)
//     200 {turnbased:true}       → resume the turn-based loop (after fallback)
//     429 {waiting:true}         → waiting room, retry every 10s
//     503 {realtimeUnavailable}  → turn-based loop (U12) — zero-key local dev
//
// If the realtime room fails to connect (~8s), drops, or degrades, the client
// POSTs /api/interview/fallback and continues the SAME interview in the
// turn-based loop with a calm banner — transcript and attempt intact.

type Turn = { turnNo: number; speaker: string; text: string; audioS3Key: string | null };
type Pending = { turnNo: number; text: string; audioS3Key: string | null } | null;
type State = {
  id: string;
  status: string;
  turns: Turn[];
  pendingQuestion: Pending;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

function CompletedCard() {
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

function FallbackBanner({ text }: { text: string }) {
  return (
    <Card>
      <p style={{ margin: 0, lineHeight: 1.6, color: "var(--charcoal)" }}>{text}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

type Mode = "entry" | "requesting" | "waiting" | "realtime" | "turnbased" | "done";

type TokenResponse = {
  token?: string;
  url?: string;
  interviewId?: string;
  turnbased?: boolean;
  waiting?: boolean;
  activeRooms?: number;
  realtimeUnavailable?: boolean;
  error?: string;
};

export function InterviewRoom({ textMode }: { textMode: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("requesting");
  const [banner, setBanner] = useState<string | null>(null);
  const [rt, setRt] = useState<{ url: string; token: string; interviewId: string } | null>(null);

  const requestRealtime = useCallback(async (silent = false) => {
    if (!silent) setMode("requesting");
    try {
      const res = await fetch("/api/interview/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as TokenResponse;
      if (res.ok && body.token && body.url && body.interviewId) {
        setRt({ url: body.url, token: body.token, interviewId: body.interviewId });
        setMode("realtime");
        return;
      }
      if (res.ok && body.turnbased) {
        setMode("turnbased");
        return;
      }
      if (res.status === 429 && body.waiting) {
        setMode("waiting");
        return;
      }
      // 503 realtimeUnavailable — or any guard error, which the turn-based
      // start route reports with a proper message. Either way: turn-based.
      setMode("turnbased");
    } catch {
      setMode("turnbased");
    }
  }, []);

  // Consent and the gates were settled on /interview; arriving here IS the
  // decision to begin, so the room opens immediately. The token route is
  // resume-safe, so a reload rejoins rather than burning a second attempt.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void requestRealtime(true);
  }, [requestRealtime]);

  // Waiting room: quietly retry every 10s until a room frees up.
  useEffect(() => {
    if (mode !== "waiting") return;
    const t = setInterval(() => void requestRealtime(true), 10_000);
    return () => clearInterval(t);
  }, [mode, requestRealtime]);

  const fallback = useCallback(
    async (reason: string) => {
      const id = rt?.interviewId;
      if (id) {
        try {
          await jsonFetch("/api/interview/fallback", {
            method: "POST",
            body: JSON.stringify({ interviewId: id, reason }),
          });
        } catch {
          // The flip is idempotent server-side; the turn-based loop resumes
          // the live interview either way.
        }
      }
      setBanner("Connection changed — continuing in step-by-step mode.");
      setMode("turnbased");
    },
    [rt],
  );

  if (mode === "requesting") {
    return (
      <div className={styles.centered}>
        <p style={{ color: "var(--charcoal)" }}>Setting up your interview…</p>
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
          All interview rooms are busy right now. Keep this page open — we check for a free
          room every few seconds and connect you automatically. Your attempt is safe; nothing
          starts until you&apos;re in the room.
        </p>
      </Card>
      </div>
    );
  }

  if (mode === "done") {
    router.replace("/interview/done");
    return (
      <div className={styles.centered}>
        <p style={{ color: "var(--charcoal)" }}>Wrapping up…</p>
      </div>
    );
  }

  if (mode === "realtime" && rt) {
    return (
      <RealtimeRoom
        url={rt.url}
        token={rt.token}
        interviewId={rt.interviewId}
        onFallback={(reason) => void fallback(reason)}
        onCompleted={() => setMode("done")}
      />
    );
  }

  return (
    <div className={styles.turnBased}>
      <TurnBasedRoom textMode={textMode} banner={banner} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turn-based room (U12) — fallback-first transport over plain HTTPS.
// Starts (or resumes — the start route is resume-safe) on mount; consent was
// already collected by the orchestrator. Question (text always; audio when
// TTS ran) → MediaRecorder answer with level meter + re-record → upload →
// calm "thinking" state → next question → … → done. Typed answers appear in
// dev text-mode or when no microphone exists.
// ---------------------------------------------------------------------------

type Phase = "starting" | "live" | "thinking" | "completed" | "error";

function TurnBasedRoom({ textMode, banner }: { textMode: boolean; banner: string | null }) {
  const [phase, setPhase] = useState<Phase>("starting");
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

  // Consent already happened in the orchestrator — start (or resume) at once.
  const begunRef = useRef(false);
  useEffect(() => {
    if (begunRef.current) return;
    begunRef.current = true;
    void begin();
  }, [begin]);

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
    async (res: { done: boolean }) => {
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
      const presign = await jsonFetch<{
        url: string;
        key: string;
        reservationId: string;
        headers: Record<string, string>;
      }>(
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
        body: JSON.stringify({
          interviewId: state.id,
          audioReservationId: presign.reservationId,
        }),
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

  if (phase === "starting" || phase === "error") {
    return (
      <div style={{ display: "grid", gap: "1.5rem" }}>
        {banner && <FallbackBanner text={banner} />}
        <Card>
          {phase === "starting" ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>Setting up your interview…</p>
          ) : (
            <div>
              <p style={{ color: "#8a3b1c", margin: "0 0 1rem" }}>{error}</p>
              <Button onClick={begin}>Try again</Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (phase === "completed") {
    return <CompletedCard />;
  }

  const question = state?.pendingQuestion ?? null;
  const showTextInput = textMode || !micAvailable;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {banner && <FallbackBanner text={banner} />}
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
