# Praxel Forge interview agent

Python LiveKit Agents worker that runs the realtime voice interviews:
LiveKit (transport) -> Sarvam (STT) -> LiveKit Inference (dialog) -> Sarvam (TTS),
calling back into the LMS over internal endpoints.

Voice is selected as a **pair**: Sarvam whenever `SARVAM_API_KEY` is set,
otherwise the Deepgram + ElevenLabs fallback. The worker refuses to start with
neither and logs which pair it chose, so a key that never reached the service
is visible rather than silently degrading a whole cohort.

**Status: implemented (U13).** `main.py` runs a livekit-agents v1.x worker
that only accepts jobs for rooms named `interview-{interviewId}`. Per job it:

1. Fetches `GET {APP_URL}/api/interview/agent-context?interviewId=` (header
   `X-Agent-Token: {AGENT_INTERNAL_TOKEN}`) — the assembled system prompt
   (InterviewTurn 0) plus the transcript so far. The agent has no DB access.
2. Starts a room-composite **video Egress** to
   `s3://{S3_BUCKET}/interviews/{interviewId}/room-{reservation}.mp4` when the
   S3 env vars are present (best-effort: failures log and the interview
   continues — the interview is worth more than the tape). The MP4 carries the
   audio; a speaker layout keeps the pixels on the student.
3. Runs an `AgentSession` (sarvam STT / inference.LLM google/gemini-3.6-flash /
   sarvam.TTS bulbul:v3 / silero.VAD). The stored system prompt gets a voice-mode
   override appended (speak naturally, one question, call `end_interview`
   when done — the turn-based JSON contract is explicitly disabled).
4. POSTs every finalized utterance to `/api/interview/agent-turn`
   (3 retries with backoff; failures are buffered and re-flushed before
   shutdown — a turn is never lost). These posts double as the room
   heartbeat for the LMS concurrency guard.
5. On `end_interview` (LLM signal) or the 15-minute budget: says a closing
   line, stops Egress, and POSTs `/api/interview/agent-complete` with the
   recording key — the LMS marks the interview completed and enqueues grading.
   Stop-and-report is ALSO registered as a shutdown callback, so an interview
   that degrades to the turn-based loop still commits its video instead of
   orphaning it in S3. It is idempotent, so the normal path never
   double-commits.

Independently of interview rooms, the process POSTs a bounded build-identity
heartbeat to `/api/internal/service-heartbeat`. The web service authenticates
it with `AGENT_INTERNAL_TOKEN`, verifies that its image-baked source SHA matches,
and persists the database schema head. Readiness fails if this heartbeat is
older than two configured intervals.

If the student's connection degrades, their client flips the interview to the
turn-based fallback (`POST /api/interview/fallback`); from then on agent-turn
posts are rejected with 409 and the agent's LMS client logs and stops — the
turn-based loop owns the rest of the same transcript.

## Environment

All required — the worker refuses to start without them, with a clear message:

| Var | Purpose |
| --- | --- |
| `LIVEKIT_URL` | LiveKit server URL (`wss://...`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `SARVAM_API_KEY` | Speech-to-text and text-to-speech (primary). Either this OR both Deepgram and ElevenLabs must be set. |
| `DEEPGRAM_API_KEY` | Speech-to-text (fallback pair) |
| _(no LLM key)_ | Dialog runs on LiveKit Inference, authenticated by the `LIVEKIT_*` credentials above. |
| `ELEVENLABS_API_KEY` | Text-to-speech (fallback pair) |
| `AGENT_INTERNAL_TOKEN` | Shared secret for internal LMS endpoints (must match the web service) |
| `APP_URL` | Base URL of the web service |
| `AGENT_HEARTBEAT_INTERVAL_SECONDS` | Durable service heartbeat cadence, 10–300 seconds (default `30`) |

Railway also supplies `RAILWAY_DEPLOYMENT_ID`, `RAILWAY_SNAPSHOT_ID`, and
`RAILWAY_REPLICA_ID`. The Docker build must receive
`RAILWAY_GIT_COMMIT_SHA`; `agent/Dockerfile` bakes it into
`/app/BUILD_SOURCE_SHA`. The process refuses to start on Railway when any part
of this immutable identity is missing.

Optional (room recording via LiveKit Egress; omit any to disable):

| Var | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials for the Egress upload |
| `AWS_REGION` | S3 bucket region |
| `S3_BUCKET` | Destination bucket (same one the LMS presigns from) |
| `INTERVIEW_DIALOG_MODEL` | Dialog model override (default `google/gemini-3.6-flash`; `google/gemma-4-31b-it` is lower latency but weaker at tool calls) |
| `SARVAM_STT_LANGUAGE` | STT language (default `auto` — adaptive identification, so code-mixed English/Hindi still transcribes) |
| `SARVAM_STT_STREAM_TYPE` | Latency profile (default `balanced`) |
| `SARVAM_TTS_MODEL` | TTS model (default `bulbul:v3`) |
| `SARVAM_TTS_SPEAKER` | TTS voice (default `shubh`) |
| `SARVAM_TTS_LANGUAGE` | TTS target language (default `en-IN`) |
| `INTERVIEW_EGRESS_LAYOUT` | Composite layout (default `speaker`) |

Deepgram/ElevenLabs keys already exist in the other Praxel Railway
projects — copy them from there (see `docs/DEPLOY.md`).

## Run locally

```sh
cd agent
python3 -m venv .venv && . .venv/bin/activate
pip install .
python main.py download-files   # bake Silero VAD weights (once)
python main.py dev              # dev mode (hot reload); `start` for production
```

## Deploy

Built from `agent/Dockerfile` (python:3.12-slim, `pip install .`,
`CMD python main.py start`). On Railway the service's root directory is
`lms/agent`, so `agent/railway.json` is picked up automatically.
Add `python main.py download-files` as a Dockerfile build step so the Silero
VAD weights bake into the image instead of downloading at boot.
No HTTP healthcheck — it is an outbound worker; process liveness + restart
policy (`ON_FAILURE`) cover it.
