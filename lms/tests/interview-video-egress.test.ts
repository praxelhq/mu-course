import { describe, expect, it } from "vitest";
import { keyForInterviewRecording, keyForInterviewVideo } from "../lib/s3";

// U5 — the room recording is a composite MP4 written into the interview's own
// namespace. These cover the pure key/namespace rules; the reserve/commit pair
// mirrors the audio one and is exercised against a live DB in
// tests/interview-realtime.test.ts.

describe("video recording keys", () => {
  const interviewId = "iv_001";

  it("writes MP4 into the interview's own namespace", () => {
    const key = keyForInterviewVideo(interviewId, "interview-video:iv_001");
    expect(key.startsWith(`interviews/${interviewId}/`)).toBe(true);
    expect(key.endsWith(".mp4")).toBe(true);
  });

  it("never collides with the audio recording key for the same interview", () => {
    expect(keyForInterviewVideo(interviewId, "interview-video:iv_001")).not.toBe(
      keyForInterviewRecording(interviewId, "interview-recording:iv_001"),
    );
  });

  it("keeps one interview's recording out of another's namespace", () => {
    const key = keyForInterviewVideo("iv_002", "interview-video:iv_002");
    expect(key.startsWith("interviews/iv_001/")).toBe(false);
  });

  it("sanitises a hostile interview id rather than escaping the prefix", () => {
    const key = keyForInterviewVideo("../../etc/passwd", "r1");
    expect(key.startsWith("interviews/")).toBe(true);
    expect(key).not.toContain("..");
    expect(key).not.toContain("interviews/../");
  });

  it("sanitises the reservation id too", () => {
    const key = keyForInterviewVideo("iv_001", "../evil");
    expect(key).not.toContain("..");
  });

  it("is deterministic for one reservation, so a retry rewrites the same object", () => {
    expect(keyForInterviewVideo(interviewId, "r1")).toBe(keyForInterviewVideo(interviewId, "r1"));
  });
});
