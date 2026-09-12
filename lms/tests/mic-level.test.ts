import { describe, expect, it } from "vitest";
import {
  SPEECH_RMS_THRESHOLD,
  meterFraction,
  rmsLevel,
} from "@/lib/interview/mic-level";

/** One frame of a sine wave at the given peak amplitude. */
function tone(amplitude: number, length = 1024): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * i) / 64);
  return out;
}

describe("rmsLevel", () => {
  it("is zero for a silent frame", () => {
    expect(rmsLevel(new Float32Array(1024))).toBe(0);
  });

  it("is zero for an empty frame rather than NaN", () => {
    // A browser handing back a zero-length buffer must not poison the meter
    // with NaN, which compares false against every threshold and would leave
    // the lobby claiming it had heard nothing forever.
    expect(rmsLevel(new Float32Array(0))).toBe(0);
  });

  it("returns amplitude/√2 for a sine wave", () => {
    expect(rmsLevel(tone(1))).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it("puts a muted mic below the speech threshold and speech above it", () => {
    // Room tone on an open but unused mic sits around -60dBFS.
    expect(rmsLevel(tone(0.001))).toBeLessThan(SPEECH_RMS_THRESHOLD);
    // A person talking at a normal level clears it comfortably.
    expect(rmsLevel(tone(0.2))).toBeGreaterThan(SPEECH_RMS_THRESHOLD);
  });
});

describe("meterFraction", () => {
  it("stays within the bar", () => {
    expect(meterFraction(0)).toBe(0);
    expect(meterFraction(5)).toBe(1);
    expect(meterFraction(-1)).toBe(0);
  });

  it("gives speech-level audio a visible bar", () => {
    // The threshold itself must move the bar enough for a student to believe
    // the check is responding to them.
    expect(meterFraction(SPEECH_RMS_THRESHOLD)).toBeGreaterThan(0.1);
  });
});
