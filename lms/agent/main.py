"""Praxel Forge interview agent — LiveKit Agents worker (U13).

Pipeline: Deepgram STT -> Gemini Flash dialog -> ElevenLabs TTS, running as a
livekit-agents v1.x AgentSession in rooms named ``interview-{interviewId}``.

The agent owns NO database access. It talks to the LMS over three internal
endpoints guarded by the shared secret AGENT_INTERNAL_TOKEN (header
``X-Agent-Token``):

  GET  /api/interview/agent-context?interviewId=   system prompt + transcript
  POST /api/interview/agent-turn                   persist a finalized turn
  POST /api/interview/agent-complete               mark completed (+ egress key)

Every finalized user/agent utterance is POSTed to agent-turn with 3 retries;
failed posts are buffered locally and re-flushed before shutdown — a turn is
never lost. When Egress env is present (S3 creds + bucket), a room-composite
audio-only Egress records the whole conversation to
``interviews/{interviewId}/room.ogg`` and the key is reported on completion.

Run: python main.py start   (subcommands come from the livekit-agents CLI)
"""

import asyncio
import logging
import os
import sys
import time

logger = logging.getLogger("praxel-forge-agent")

# livekit-agents reads these directly from the environment.
REQUIRED_ENV = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]

# Required by the interview pipeline itself.
PIPELINE_ENV = [
    "DEEPGRAM_API_KEY",
    "GEMINI_API_KEY",
    "ELEVENLABS_API_KEY",
    "AGENT_INTERNAL_TOKEN",
    "APP_URL",
]

ROOM_PREFIX = "interview-"
MAX_INTERVIEW_SECONDS = 12 * 60
QUESTION_BUDGET = 10  # hard ceiling; the prompt targets 8-10
GEMINI_MODEL = os.environ.get("INTERVIEW_GEMINI_MODEL", "gemini-2.0-flash")

CLOSING_LINE = (
    "That's everything from me — thank you for talking through your work. "
    "Your interview is complete; you can leave the room whenever you're ready."
)


def check_env() -> None:
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        print(
            "[praxel-forge-agent] Missing required environment variables: "
            f"{', '.join(missing)}. Set them (see agent/README.md) and "
            "restart. Exiting.",
            file=sys.stderr,
        )
        sys.exit(1)

    missing_pipeline = [k for k in PIPELINE_ENV if not os.environ.get(k)]
    if missing_pipeline:
        print(
            "[praxel-forge-agent] Missing pipeline environment variables: "
            f"{', '.join(missing_pipeline)}. The interview pipeline cannot "
            "run without them (see agent/README.md). Exiting.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Our codebase's canonical name is GEMINI_API_KEY; the livekit google
    # plugin reads GOOGLE_API_KEY. Map the alias so only one needs setting.
    if os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]


def egress_configured() -> bool:
    """Room recording is optional: it needs S3 creds + bucket in the env."""
    return all(
        os.environ.get(k)
        for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET")
    )


class LmsClient:
    """Internal-API client. POST failures are retried 3x with backoff, then
    buffered; flush() re-sends the buffer (called again before shutdown)."""

    RETRIES = 3

    def __init__(self) -> None:
        import httpx

        self._base = os.environ["APP_URL"].rstrip("/")
        self._client = httpx.AsyncClient(
            timeout=10.0,
            headers={"X-Agent-Token": os.environ["AGENT_INTERNAL_TOKEN"]},
        )
        self._pending: list[tuple[str, dict]] = []

    async def get_context(self, interview_id: str) -> dict:
        res = await self._client.get(
            f"{self._base}/api/interview/agent-context",
            params={"interviewId": interview_id},
        )
        res.raise_for_status()
        return res.json()

    async def _post(self, path: str, body: dict) -> bool:
        for attempt in range(self.RETRIES):
            try:
                res = await self._client.post(f"{self._base}{path}", json=body)
                if res.status_code < 500:
                    if res.status_code >= 400:
                        # 4xx is a policy answer (e.g. fallback flipped the
                        # transport) — retrying cannot help; do not buffer.
                        logger.warning(
                            "LMS rejected %s (%s): %s", path, res.status_code, res.text[:200]
                        )
                    return res.status_code < 400
            except Exception as err:  # noqa: BLE001 — network layer, retry all
                logger.warning("POST %s attempt %d failed: %s", path, attempt + 1, err)
            await asyncio.sleep(0.5 * (attempt + 1))
        return False

    async def post_turn(
        self, interview_id: str, speaker: str, text: str, buffer_on_failure: bool = True
    ) -> None:
        body = {"interviewId": interview_id, "speaker": speaker, "text": text}
        if not await self._post("/api/interview/agent-turn", body) and buffer_on_failure:
            logger.error("buffering unsent %s turn for %s", speaker, interview_id)
            self._pending.append(("/api/interview/agent-turn", body))

    async def post_complete(self, interview_id: str, audio_s3_key: str | None) -> None:
        body: dict = {"interviewId": interview_id}
        if audio_s3_key:
            body["audioS3Key"] = audio_s3_key
        if not await self._post("/api/interview/agent-complete", body):
            self._pending.append(("/api/interview/agent-complete", body))

    async def flush(self) -> None:
        """Last-chance re-send of buffered posts (shutdown callback)."""
        pending, self._pending = self._pending, []
        for path, body in pending:
            if not await self._post(path, body):
                self._pending.append((path, body))
        if self._pending:
            logger.error("%d turn(s) could not be delivered to the LMS", len(self._pending))

    async def aclose(self) -> None:
        await self.flush()
        await self._client.aclose()


class Egress:
    """Room-composite audio-only Egress to S3. Strictly best-effort: any
    failure logs and the interview continues without a room recording."""

    def __init__(self, room_name: str, interview_id: str) -> None:
        self.room_name = room_name
        self.s3_key = f"interviews/{interview_id}/room.ogg"
        self.egress_id: str | None = None
        self._lkapi = None

    async def start(self) -> None:
        if not egress_configured():
            logger.info("egress env not set — no room recording for %s", self.room_name)
            return
        try:
            from livekit import api

            self._lkapi = api.LiveKitAPI()
            req = api.RoomCompositeEgressRequest(
                room_name=self.room_name,
                audio_only=True,
                file_outputs=[
                    api.EncodedFileOutput(
                        file_type=api.EncodedFileType.OGG,
                        filepath=self.s3_key,
                        s3=api.S3Upload(
                            access_key=os.environ["AWS_ACCESS_KEY_ID"],
                            secret=os.environ["AWS_SECRET_ACCESS_KEY"],
                            region=os.environ["AWS_REGION"],
                            bucket=os.environ["S3_BUCKET"],
                        ),
                    )
                ],
            )
            info = await self._lkapi.egress.start_room_composite_egress(req)
            self.egress_id = info.egress_id
            logger.info("egress %s recording %s -> %s", self.egress_id, self.room_name, self.s3_key)
        except Exception as err:  # noqa: BLE001 — recording is best-effort
            logger.error("egress start failed for %s: %s", self.room_name, err)
            self.egress_id = None

    async def stop(self) -> str | None:
        """Stop the recording; returns the S3 key when a recording ran."""
        if not self._lkapi:
            return None
        key = self.s3_key if self.egress_id else None
        try:
            if self.egress_id:
                from livekit import api

                await self._lkapi.egress.stop_egress(api.StopEgressRequest(egress_id=self.egress_id))
        except Exception as err:  # noqa: BLE001
            logger.error("egress stop failed (%s): %s", self.egress_id, err)
        finally:
            try:
                await self._lkapi.aclose()
            except Exception:  # noqa: BLE001
                pass
            self._lkapi = None
            self.egress_id = None
        return key


def realtime_instructions(system_prompt: str) -> str:
    """The stored turn-0 prompt targets the turn-based JSON contract; append a
    voice-mode override so the same interviewing rules drive natural speech."""
    return (
        f"{system_prompt}\n\n"
        "VOICE MODE OVERRIDE (this is a live spoken conversation):\n"
        "- IGNORE the JSON output contract above. Speak naturally — plain\n"
        "  conversational sentences only, never JSON, code, or markup.\n"
        "- Ask exactly ONE question, then wait for the student to finish.\n"
        "- Keep each question under three sentences; no lists.\n"
        "- When the question budget is reached or all categories are covered,\n"
        "  call the end_interview tool instead of asking another question."
    )


async def entrypoint(ctx) -> None:
    """One job = one interview room. Wires the STT->LLM->TTS session, mirrors
    every finalized utterance into the LMS, records via Egress, and completes
    the interview when the LLM signals done or the 12-minute budget expires."""
    from livekit.agents import Agent, AgentSession, RoomInputOptions, RunContext, function_tool
    from livekit.plugins import deepgram, elevenlabs, google, silero

    await ctx.connect()
    room_name = ctx.room.name
    if not room_name.startswith(ROOM_PREFIX):
        logger.warning("room %s is not an interview room — leaving", room_name)
        ctx.shutdown(reason="not an interview room")
        return
    interview_id = room_name[len(ROOM_PREFIX):]

    lms = LmsClient()
    ctx.add_shutdown_callback(lms.aclose)

    try:
        context = await lms.get_context(interview_id)
    except Exception as err:  # noqa: BLE001
        logger.error("could not fetch agent-context for %s: %s", interview_id, err)
        ctx.shutdown(reason="agent-context unavailable")
        return
    if context.get("status") != "live" or context.get("transport") != "realtime":
        logger.warning(
            "interview %s is status=%s transport=%s — not joining",
            interview_id, context.get("status"), context.get("transport"),
        )
        ctx.shutdown(reason="interview not live/realtime")
        return

    egress = Egress(room_name, interview_id)
    await egress.start()

    started_at = time.monotonic()
    finished = asyncio.Event()
    question_count = 0

    class Interviewer(Agent):
        def __init__(self) -> None:
            super().__init__(instructions=realtime_instructions(context.get("systemPrompt", "")))

        @function_tool
        async def end_interview(self, ctx_: RunContext) -> str:
            """Call this when the interview should end: the question budget is
            reached, all categories are covered, or the student asks to stop."""
            finished.set()
            return "The interview is over. Say a short, warm goodbye."

        async def on_enter(self) -> None:
            self.session.generate_reply(
                instructions=(
                    "Greet the student warmly in one or two sentences, then ask "
                    "your first interview question."
                )
            )

    session = AgentSession(
        stt=deepgram.STT(model="nova-3"),
        llm=google.LLM(model=GEMINI_MODEL),
        tts=elevenlabs.TTS(),
        vad=silero.VAD.load(),
    )

    def on_item_added(ev) -> None:
        text = (ev.item.text_content or "").strip()
        if not text or ev.item.role not in ("user", "assistant"):
            return
        nonlocal question_count
        speaker = "student" if ev.item.role == "user" else "agent"
        if speaker == "agent":
            question_count += 1
        # Persist-before-anything-else is the LMS's job; ours is never to drop
        # a finalized utterance (retry + buffer inside post_turn).
        asyncio.create_task(lms.post_turn(interview_id, speaker, text))

    session.on("conversation_item_added", on_item_added)

    await session.start(agent=Interviewer(), room=ctx.room, room_input_options=RoomInputOptions())

    async def budget_watch() -> None:
        while not finished.is_set():
            if time.monotonic() - started_at > MAX_INTERVIEW_SECONDS:
                logger.info("interview %s hit the %ss budget", interview_id, MAX_INTERVIEW_SECONDS)
                finished.set()
                return
            if question_count >= QUESTION_BUDGET * 2:  # runaway guard
                finished.set()
                return
            await asyncio.sleep(5)

    watcher = asyncio.create_task(budget_watch())
    await finished.wait()
    watcher.cancel()

    # Wind down: closing line, stop the recording, mark the interview done.
    try:
        await session.say(CLOSING_LINE, allow_interruptions=False)
    except Exception as err:  # noqa: BLE001 — closing audio is a nicety
        logger.warning("closing line failed for %s: %s", interview_id, err)
    try:
        await session.drain()
    except Exception:  # noqa: BLE001
        pass

    audio_key = await egress.stop()
    await lms.post_complete(interview_id, audio_key)
    await lms.flush()
    try:
        await session.aclose()
    except Exception:  # noqa: BLE001
        pass
    ctx.shutdown(reason="interview complete")


async def request_fnc(req) -> None:
    """Only take jobs for interview-* rooms; everything else is rejected."""
    if req.room.name.startswith(ROOM_PREFIX):
        await req.accept(identity="forge-interviewer")
    else:
        await req.reject()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    check_env()

    # Imported after the env check so a misconfigured container prints the
    # missing-env message instead of an SDK traceback.
    from livekit.agents import WorkerOptions, cli

    logger.info("env OK — starting LiveKit interview agent worker")
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, request_fnc=request_fnc))


if __name__ == "__main__":
    main()
