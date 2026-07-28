# Praxel Forge interview agent

Python LiveKit Agents worker that will run the voice interviews:
LiveKit (audio transport) -> Deepgram (STT) -> Gemini (dialog) ->
ElevenLabs (TTS), calling back into the LMS over internal endpoints.

**Status: skeleton (U5).** `main.py` boots a real livekit-agents worker,
validates env, and connects to rooms with a placeholder entrypoint that only
logs. **U13** replaces `entrypoint()` with the actual interview pipeline
(an `AgentSession` wiring `deepgram.STT`, `google.LLM` (Gemini),
`elevenlabs.TTS`, interview prompts, and result callbacks to the LMS via
`APP_URL` + `AGENT_INTERNAL_TOKEN`).

## Environment

Required now (worker refuses to start without them, with a clear message):

| Var | Purpose |
| --- | --- |
| `LIVEKIT_URL` | LiveKit server URL (`wss://...`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |

Required once U13 lands (warn-only today):

| Var | Purpose |
| --- | --- |
| `DEEPGRAM_API_KEY` | Speech-to-text |
| `GEMINI_API_KEY` | Dialog LLM. The livekit google plugin reads `GOOGLE_API_KEY`; `main.py` maps `GEMINI_API_KEY` -> `GOOGLE_API_KEY` automatically, so set only `GEMINI_API_KEY`. |
| `ELEVENLABS_API_KEY` | Text-to-speech |
| `AGENT_INTERNAL_TOKEN` | Shared secret for internal LMS endpoints |
| `APP_URL` | Base URL of the web service |

Deepgram/Gemini/ElevenLabs keys already exist in the other Praxel Railway
projects — copy them from there (see `docs/DEPLOY.md`).

## Run locally

```sh
cd agent
python3 -m venv .venv && . .venv/bin/activate
pip install .
python main.py dev    # dev mode (hot reload); `start` for production mode
```

## Deploy

Built from `agent/Dockerfile` (python:3.12-slim, `pip install .`,
`CMD python main.py start`). On Railway the service's root directory is
`lms/agent`, so `agent/railway.json` is picked up automatically.
No HTTP healthcheck — it is an outbound worker; process liveness + restart
policy (`ON_FAILURE`) cover it.

## Notes for U13

- Fill `entrypoint()` with an `AgentSession` (see livekit-agents docs for the
  voice pipeline: VAD/turn detection + STT/LLM/TTS plugins).
- If a turn-detector/VAD model is used, add `python main.py download-files`
  as a Dockerfile build step so model weights bake into the image.
- Promote the warn-only env vars above to required.
