// Does the microphone actually carry sound — not merely "is permission granted".
//
// The lobby check proved the browser would HAND US a track, and a granted
// permission on a muted headset, a disconnected Bluetooth mic or the wrong
// default input hands one over just as happily. Students then entered a
// twenty-minute graded interview having never once confirmed we could hear
// them; the interview only told them by asking the same question again.
// One student gave his introduction seven times across eighteen minutes.
//
// So the lobby now listens. The maths lives here, away from the DOM, so the
// threshold is a tested number rather than one tuned by squinting at a bar.

/** Root-mean-square amplitude of one analyser frame, in 0..1. */
export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * RMS above which we are confident we are hearing a person rather than room
 * tone. Deliberately low: the cost of a false "we can hear you" is a student
 * discovering the truth in the interview, and the cost of a false "we cannot"
 * is a warning they can ignore — so this errs toward believing the student,
 * and the UI never hard-blocks on it.
 */
export const SPEECH_RMS_THRESHOLD = 0.02;

/** Frames above the threshold before we call it speech, at ~20fps sampling. */
export const SPEECH_FRAMES_REQUIRED = 3;

/** Bar height in 0..1 for an RMS reading; amplified because speech RMS is small. */
export function meterFraction(rms: number): number {
  return Math.max(0, Math.min(1, rms * 8));
}

export type MicMeter = {
  /** Latest RMS reading, 0..1. */
  level: () => number;
  /** True once speech-level audio has been heard for long enough. */
  heard: () => boolean;
  stop: () => void;
};

type AudioContextCtor = new () => AudioContext;

/**
 * Attach an analyser to a live microphone track. Browser-only; the caller owns
 * the stream and must still stop its tracks. Returns null when the browser has
 * no Web Audio — in which case the lobby simply skips the check rather than
 * inventing a failure the student cannot act on.
 */
export function createMicMeter(stream: MediaStream): MicMeter | null {
  const Ctor: AudioContextCtor | undefined =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext);
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  let current = 0;
  let loud = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buffer);
    current = rmsLevel(buffer);
    if (current >= SPEECH_RMS_THRESHOLD) loud += 1;
    else loud = 0;
  };
  const timer = setInterval(tick, 50);

  return {
    level: () => current,
    heard: () => loud >= SPEECH_FRAMES_REQUIRED,
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      try {
        source.disconnect();
        void ctx.close();
      } catch {
        // A context the browser already tore down is not a failure worth raising.
      }
    },
  };
}
