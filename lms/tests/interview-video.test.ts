import { describe, expect, it } from "vitest";
import {
  CAMERA_REQUIRED_NOTICE,
  VIDEO_LOST_FLAG,
  VIDEO_LOST_NOTICE,
  cameraRemediation,
  classifyCameraError,
} from "../lib/interview/video";

// U4 — camera is required to start, but losing it mid-call is not terminal.
// The classification is pure so the remediation a student sees for each
// failure is provable without a browser.

describe("camera failure classification", () => {
  const cases: [string, string][] = [
    ["NotAllowedError", "permission-denied"],
    ["SecurityError", "permission-denied"],
    ["NotFoundError", "no-device"],
    ["OverconstrainedError", "no-device"],
    ["NotReadableError", "device-busy"],
    ["AbortError", "device-busy"],
    ["TypeError", "insecure-context"],
  ];

  it.each(cases)("maps %s to %s", (name, expected) => {
    expect(classifyCameraError(Object.assign(new Error("x"), { name }))).toBe(expected);
  });

  it("falls back rather than guessing on an unknown DOMException", () => {
    expect(classifyCameraError(Object.assign(new Error("x"), { name: "WeirdError" }))).toBe(
      "unknown",
    );
  });

  it("treats a nameless throw as an unsupported browser", () => {
    expect(classifyCameraError(undefined)).toBe("unsupported");
    expect(classifyCameraError("boom")).toBe("unsupported");
  });
});

describe("remediation", () => {
  it("tells a blocked student where the permission lives", () => {
    expect(cameraRemediation("permission-denied")).toMatch(/address bar/i);
  });

  it("tells a busy-camera student what to close", () => {
    expect(cameraRemediation("device-busy")).toMatch(/Zoom|Meet/);
  });

  it("names a concrete next step for every failure, never just 'failed'", () => {
    const failures = [
      "permission-denied",
      "no-device",
      "device-busy",
      "insecure-context",
      "unsupported",
      "unknown",
    ] as const;
    for (const failure of failures) {
      const message = cameraRemediation(failure);
      expect(message.length).toBeGreaterThan(30);
      expect(message).toMatch(/try again|latest Chrome/i);
    }
  });
});

describe("notices", () => {
  it("explains that the camera is required because the interview is recorded", () => {
    expect(CAMERA_REQUIRED_NOTICE).toMatch(/recorded/i);
    expect(CAMERA_REQUIRED_NOTICE).toMatch(/required/i);
  });

  it("reassures a student who lost video that nothing is lost", () => {
    expect(VIDEO_LOST_NOTICE).toMatch(/audio only/i);
    expect(VIDEO_LOST_NOTICE).toMatch(/Keep going/i);
    expect(VIDEO_LOST_NOTICE).not.toMatch(/fail|error|invalid/i);
  });

  it("uses one stable flag name across client and server", () => {
    expect(VIDEO_LOST_FLAG).toBe("video-lost");
  });
});
