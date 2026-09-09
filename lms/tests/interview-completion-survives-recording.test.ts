import { beforeEach, describe, expect, it, vi } from "vitest";

// The agent stops Egress and posts the resulting key immediately, but stop()
// returns while the MP4 is still uploading. Committing that key does a HEAD on
// an object S3 does not have yet and throws — and completion used to run AFTER
// the commit, so it never ran at all. The student heard "your interview is
// complete" while their row sat live forever: never graded, never swept
// (their open tab kept the heartbeat fresh), costUsd stuck at 0.

const completeInterview = vi.fn(async () => {});
const commitInterviewVideo = vi.fn(async () => ({ s3Key: "k", s3VersionId: "v" }));
const commitInterviewRecording = vi.fn(async () => ({ s3Key: "k", s3VersionId: "v" }));
const findUnique = vi.fn(async () => ({
  userId: "u_1",
  transport: "realtime",
  status: "live",
}));

vi.mock("@/lib/db", () => ({ prisma: { interview: { findUnique: () => findUnique() } } }));
vi.mock("@/lib/interview/session", () => ({
  completeInterview: (...args: unknown[]) => completeInterview(...(args as [])),
}));
vi.mock("@/lib/interview/audio-storage", () => ({
  commitInterviewVideo: (...args: unknown[]) => commitInterviewVideo(...(args as [])),
  commitInterviewRecording: (...args: unknown[]) => commitInterviewRecording(...(args as [])),
}));
vi.mock("@/lib/interview/realtime", () => ({ agentAuthResponse: () => null }));
vi.mock("@/lib/interview/http", () => ({ interviewErrorResponse: () => null }));

import { POST } from "@/app/api/interview/agent-complete/route";

function post(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/interview/agent-complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const withVideo = {
  interviewId: "iv_1",
  finished: true,
  videoS3Key: "interviews/iv_1/room-1.mp4",
  videoReservationId: "res_1",
};

describe("agent-complete", () => {
  beforeEach(() => {
    completeInterview.mockClear();
    commitInterviewVideo.mockClear();
    commitInterviewRecording.mockClear();
    commitInterviewVideo.mockImplementation(async () => ({ s3Key: "k", s3VersionId: "v" }));
  });

  it("completes the interview even when the recording is not in S3 yet", async () => {
    commitInterviewVideo.mockImplementation(async () => {
      throw new Error("Generated-object reservation is no longer active.");
    });
    const res = await POST(post(withVideo));
    const body = (await res.json()) as { completed: boolean; recordingFailures: string[] };

    expect(res.status).toBe(200);
    expect(completeInterview).toHaveBeenCalledOnce();
    expect(body.completed).toBe(true);
    // Reported, not swallowed — a lost recording is still worth knowing about.
    expect(body.recordingFailures).toEqual(["video"]);
  });

  it("still completes and attaches the recording on the happy path", async () => {
    const res = await POST(post(withVideo));
    const body = (await res.json()) as { completed: boolean; recordingFailures: string[] };
    expect(completeInterview).toHaveBeenCalledOnce();
    expect(commitInterviewVideo).toHaveBeenCalledOnce();
    expect(body.recordingFailures).toEqual([]);
  });

  it("a shutdown post still never completes the interview", async () => {
    const res = await POST(post({ ...withVideo, finished: false }));
    const body = (await res.json()) as { completed: boolean; reason: string };
    expect(completeInterview).not.toHaveBeenCalled();
    expect(body).toMatchObject({ completed: false, reason: "recording-only" });
    // ...but the recording is still attached.
    expect(commitInterviewVideo).toHaveBeenCalledOnce();
  });

  it("rejects a key outside the interview's own namespace", async () => {
    const res = await POST(
      post({ ...withVideo, videoS3Key: "interviews/iv_OTHER/room-1.mp4" }),
    );
    expect(res.status).toBe(400);
    expect(completeInterview).not.toHaveBeenCalled();
  });
});
