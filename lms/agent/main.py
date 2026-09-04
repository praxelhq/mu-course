"""Praxel Forge interview agent — LiveKit Agents worker (U13).

Pipeline: Sarvam STT -> LiveKit Inference dialog -> Sarvam TTS, running as a
livekit-agents v1.x AgentSession in rooms named ``interview-{interviewId}``.
Deepgram STT / ElevenLabs TTS remain wired as the fallback pair and are used
whenever ``SARVAM_API_KEY`` is absent, so local dev and a Sarvam outage both
still run (see ``select_voice_provider``).

The agent owns NO database access. It talks to the LMS over three internal
endpoints guarded by the shared secret AGENT_INTERNAL_TOKEN (header
``X-Agent-Token``):

  GET  /api/interview/agent-context?interviewId=   system prompt + transcript
  POST /api/interview/agent-turn                   persist a finalized turn
  POST /api/interview/agent-complete               mark completed (+ egress key)

Every finalized user/agent utterance is POSTed to agent-turn with 3 retries;
failed posts are buffered locally and re-flushed before shutdown — a turn is
never lost. When Egress env is present (S3 creds + bucket), a room-composite
VIDEO Egress records the whole conversation to
``interviews/{interviewId}/room-{reservation}.mp4`` and the key is reported on
completion — including on the degraded path, where the student has flipped to
the turn-based loop and this worker is shutting down.

Run: python main.py start   (subcommands come from the livekit-agents CLI)
"""

import asyncio
import logging
import os
from pathlib import Path
import re
import sys
import threading
import time
from typing import Callable, Mapping

logger = logging.getLogger("praxel-forge-agent")

# livekit-agents reads these directly from the environment.
REQUIRED_ENV = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]

# Required by the interview pipeline itself, regardless of voice provider.
PIPELINE_ENV = [
    "AGENT_INTERNAL_TOKEN",
    "APP_URL",
]

# Voice is provider-swappable, so it is checked as a *pair* rather than as a
# flat key list: exactly one complete pair is required.
VOICE_SARVAM = "sarvam"
VOICE_LEGACY = "legacy"
LEGACY_VOICE_ENV = ("DEEPGRAM_API_KEY", "ELEVENLABS_API_KEY")


def voice_override(env: Mapping[str, str] = os.environ) -> str | None:
    """Operator kill switch: INTERVIEW_VOICE_PROVIDER=sarvam|legacy.

    Set this to pin one provider mid-cohort without deleting a key or shipping
    code — a Railway variable and a restart is the fastest lever there is when
    a vendor is degraded but not actually erroring.
    """
    value = (env.get("INTERVIEW_VOICE_PROVIDER") or "").strip().lower()
    return value if value in (VOICE_SARVAM, VOICE_LEGACY) else None


def available_voice_providers(env: Mapping[str, str] = os.environ) -> list[str]:
    """Every provider this process could use, best first.

    More than one means real failover: Sarvam leads and the legacy pair backs
    it, rather than the legacy pair being dead code that only runs when someone
    forgets to set SARVAM_API_KEY.
    """
    forced = voice_override(env)
    providers: list[str] = []
    if forced != VOICE_LEGACY and env.get("SARVAM_API_KEY"):
        providers.append(VOICE_SARVAM)
    if forced != VOICE_SARVAM and all(env.get(k) for k in LEGACY_VOICE_ENV):
        providers.append(VOICE_LEGACY)
    return providers


def select_voice_provider(env: Mapping[str, str] = os.environ) -> str | None:
    """Which STT/TTS pair this process will use, or None if neither is complete.

    Sarvam wins whenever its key is present; a half-configured legacy pair is
    not a usable provider, so it never counts.
    """
    providers = available_voice_providers(env)
    return providers[0] if providers else None


def missing_voice_env(env: Mapping[str, str] = os.environ) -> list[str]:
    """Every key that would complete a voice pair, when none is complete."""
    if select_voice_provider(env) is not None:
        return []
    return ["SARVAM_API_KEY", *LEGACY_VOICE_ENV]

ROOM_PREFIX = "interview-"
# Two participants, so a speaker layout spends pixels on the student's face
# rather than on empty grid cells.
EGRESS_LAYOUT = os.environ.get("INTERVIEW_EGRESS_LAYOUT", "speaker")
# Record audio only. LiveKit bills composite egress at $0.02/min for video and
# $0.005/min for audio-only, and across a 516-student cohort that is the single
# largest line item in the whole system — larger than every model call combined.
# Nothing downstream reads the video: grading works from the transcript, and a
# human reviewing a flagged interview needs to hear it, not watch it.
# The MP4 container and the reserved S3 key are deliberately unchanged, so the
# reserve/commit path and every stored key stay exactly as they were.
EGRESS_AUDIO_ONLY = os.environ.get("INTERVIEW_EGRESS_AUDIO_ONLY", "1") not in ("0", "false", "False")
# Interview length. Raised from 15 to 20 minutes: a real student spent 738 of
# her 913 seconds talking and still only reached six questions, so the arc ran
# out of clock before RAG/MCP and all three set probes. Env-tunable so it can
# be pulled back without a deploy if throughput becomes the binding constraint
# (each concurrent slot is held for the full budget).
MAX_INTERVIEW_SECONDS = int(os.environ.get("INTERVIEW_MAX_SECONDS", 20 * 60))
QUESTION_BUDGET = 20  # hard ceiling across the five segments (runaway guard)
# The model may not end the interview before this many of its own turns. The
# five-segment arc cannot be covered in fewer, and the final segment — the
# student's own workflow and sector map — is the one that gets skipped when an
# interview ends early. Prompt instructions alone did not hold; this does.
MIN_TURNS_BEFORE_END = 10

# Counting questions was the wrong guard. An interview ended at exactly ten
# questions having covered the resume, privacy, the regulated-shipping probe,
# context isolation and skills — every segment EXCEPT the student's own work,
# which is the only evidence work_integrity is scored from. The count said ten,
# the guard stood down, and the model ended the interview one question early.
#
# So the guard now asks what was actually discussed. These markers only appear
# when the interviewer has genuinely turned to the artifact the student
# uploaded; generic words like "workflow" are deliberately excluded because
# they show up in the earlier AI-in-your-job segment too.
# Naming the artifact is not the same as interrogating it. A simulated run
# ended having said "the Make.com workflow you built" inside the CONTEXT
# ISOLATION question — the keyword matched, coverage passed, and the interview
# closed without once asking about error handling, trigger criteria, what was
# left unbuilt, or credit burn. So coverage needs both halves: the artifact
# named, AND at least one of the things this segment exists to ask about.
OWN_WORK_IDENTITY_MARKERS = (
    "sector map",
    "blueprint",
    "make.com",
    "workflow you built",
    "workflow you uploaded",
    "automation you built",
    "scenario you built",
)

OWN_WORK_SUBSTANCE_MARKERS = (
    "error handler",
    "error handling",
    "timeout",
    "times out",
    "trigger criteria",
    "trigger did you",
    "why that trigger",
    "chose that trigger",
    "decided not to",
    "decide not to",
    "did not implement",
    "didn't implement",
    "left out",
    "credit",
    "fails",
    "breaks",
)

# An escape hatch so a model that will not comply cannot trap the student in a
# refusal loop: inside the last two minutes, let the interview end regardless.
END_GUARD_RELEASE_SECONDS = MAX_INTERVIEW_SECONDS - 120


def own_work_covered(agent_utterances: "list[str]") -> bool:
    """True once the interviewer has actually INTERROGATED the student's build.

    Both halves are required. Naming the artifact in passing — inside another
    segment's question, say — is not the segment; neither is asking about error
    handling in the abstract. work_integrity is scored from this and nothing
    else, so a false positive here costs a student half their marks.
    """
    haystack = " ".join(agent_utterances).lower()
    named = any(marker in haystack for marker in OWN_WORK_IDENTITY_MARKERS)
    probed = any(marker in haystack for marker in OWN_WORK_SUBSTANCE_MARKERS)
    return named and probed
# Dialog runs through LiveKit Inference, which is included in LiveKit Cloud —
# no extra provider key, and it is zero-data-retention by default, which matters
# because this prompt carries the student's own resume.
#
# gemini-3.6-flash over the latency-tuned gemma-4-31b-it: the agent ends a
# session by CALLING end_interview, and the context holds student-uploaded text
# that may be engineered to manipulate the grade. The latency gap is small next
# to the STT+TTS round trip; the instruction-following gap is not.
DIALOG_MODEL = os.environ.get("INTERVIEW_DIALOG_MODEL", "google/gemini-3.6-flash")

# Sarvam voice configuration. STT defaults to adaptive language identification:
# the cohort code-mixes English and Hindi mid-answer, and pinning en-IN drops or
# mangles those spans, which reads to the grader as incoherence and penalises
# exactly what the rubric forbids penalising.
SARVAM_STT_LANGUAGE = os.environ.get("SARVAM_STT_LANGUAGE", "auto")
SARVAM_STT_STREAM_TYPE = os.environ.get("SARVAM_STT_STREAM_TYPE", "balanced")
SARVAM_TTS_MODEL = os.environ.get("SARVAM_TTS_MODEL", "bulbul:v3")
SARVAM_TTS_SPEAKER = os.environ.get("SARVAM_TTS_SPEAKER", "shubh")
SARVAM_TTS_LANGUAGE = os.environ.get("SARVAM_TTS_LANGUAGE", "en-IN")

CLOSING_LINE = (
    "That's everything from me — thank you for talking through your work. "
    "Your interview is complete; you can leave the room whenever you're ready."
)

GIT_SHA_RE = re.compile(r"^[0-9a-f]{40}$", re.IGNORECASE)


def load_runtime_identity(
    source_path: Path = Path("/app/BUILD_SOURCE_SHA"),
    env: Mapping[str, str] = os.environ,
) -> dict:
    """Load identity baked into the image plus Railway immutable runtime ids.

    Mutable labels such as RELEASE_SHA and runtime RAILWAY_GIT_COMMIT_SHA are
    deliberately ignored; the source SHA must come from the build artifact.
    """
    source_sha = "unknown"
    try:
        candidate = source_path.read_text(encoding="utf-8").strip()
        if GIT_SHA_RE.fullmatch(candidate):
            source_sha = candidate.lower()
    except OSError:
        pass

    deployment_id = env.get("RAILWAY_DEPLOYMENT_ID", "").strip() or None
    image_digest = env.get("RAILWAY_SNAPSHOT_ID", "").strip() or None
    instance_id = env.get("RAILWAY_REPLICA_ID", "").strip() or None
    verified = bool(
        GIT_SHA_RE.fullmatch(source_sha)
        and deployment_id
        and image_digest
        and instance_id
    )
    return {
        "sourceSha": source_sha,
        "deploymentId": deployment_id,
        "imageDigest": image_digest,
        "instanceId": instance_id,
        "verified": verified,
    }


def _heartbeat_interval() -> int:
    try:
        configured = int(os.environ.get("AGENT_HEARTBEAT_INTERVAL_SECONDS", "30"))
    except ValueError:
        configured = 30
    return min(300, max(10, configured))


class HeartbeatReporter:
    """Periodic agent identity proof through the token-guarded LMS endpoint."""

    def __init__(
        self,
        identity: dict,
        post: Callable | None = None,
    ) -> None:
        if post is None:
            import httpx

            post = httpx.post
        self._post = post
        self._identity = identity
        self._interval = _heartbeat_interval()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def report_once(self) -> bool:
        if not self._identity.get("verified"):
            logger.error("agent heartbeat identity is not verified")
            return False
        base = os.environ.get("APP_URL", "").rstrip("/")
        token = os.environ.get("AGENT_INTERNAL_TOKEN", "")
        if not base or not token:
            logger.error("agent heartbeat endpoint is not configured")
            return False
        payload = {
            "sourceSha": self._identity["sourceSha"],
            "deploymentId": self._identity["deploymentId"],
            "imageDigest": self._identity["imageDigest"],
            "instanceId": self._identity["instanceId"],
            "intervalSeconds": self._interval,
        }
        try:
            response = self._post(
                f"{base}/api/internal/service-heartbeat",
                json=payload,
                headers={"X-Agent-Token": token},
                timeout=10.0,
            )
            if 200 <= response.status_code < 300:
                return True
            logger.warning("agent heartbeat rejected with status %s", response.status_code)
        except Exception as err:  # noqa: BLE001 — background network proof
            logger.warning("agent heartbeat failed: %s", type(err).__name__)
        return False

    def _run(self) -> None:
        while not self._stop.is_set():
            self.report_once()
            self._stop.wait(self._interval)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._run,
            name="forge-agent-heartbeat",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)


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

    missing_voice = missing_voice_env()
    if missing_voice:
        print(
            "[praxel-forge-agent] No complete voice provider is configured. Set "
            "SARVAM_API_KEY (preferred), or both DEEPGRAM_API_KEY and "
            "ELEVENLABS_API_KEY for the fallback pair. Exiting.",
            file=sys.stderr,
        )
        sys.exit(1)

    # No LLM key to check: LiveKit Inference authenticates with the LIVEKIT_*
    # credentials this worker already needs to join a room at all.


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

    async def get_context(self, interview_id: str, reserve_recording: bool = False) -> dict:
        res = await self._client.get(
            f"{self._base}/api/interview/agent-context",
            params={
                "interviewId": interview_id,
                "reserveRecording": "1" if reserve_recording else "0",
            },
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

    async def post_complete(
        self,
        interview_id: str,
        audio_s3_key: str | None,
        audio_reservation_id: str | None,
        video_s3_key: str | None = None,
        video_reservation_id: str | None = None,
    ) -> None:
        body: dict = {"interviewId": interview_id}
        if audio_s3_key and audio_reservation_id:
            body["audioS3Key"] = audio_s3_key
            body["audioReservationId"] = audio_reservation_id
        if video_s3_key and video_reservation_id:
            body["videoS3Key"] = video_s3_key
            body["videoReservationId"] = video_reservation_id
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
    """Room-composite Egress to S3, audio-only by default (see
    EGRESS_AUDIO_ONLY); the MP4 container is kept either way.

    Strictly best-effort: any failure logs and the interview continues without
    a room recording. The interview is worth more than the tape.
    """

    def __init__(self, room_name: str, s3_key: str | None) -> None:
        self.room_name = room_name
        self.s3_key = s3_key
        self.egress_id: str | None = None
        self._lkapi = None

    async def start(self) -> None:
        if not egress_configured() or not self.s3_key:
            logger.info("egress env not set — no room recording for %s", self.room_name)
            return
        try:
            from livekit import api

            self._lkapi = api.LiveKitAPI()
            req = api.RoomCompositeEgressRequest(
                room_name=self.room_name,
                layout=EGRESS_LAYOUT,
                audio_only=EGRESS_AUDIO_ONLY,
                file_outputs=[
                    api.EncodedFileOutput(
                        file_type=api.EncodedFileType.MP4,
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
            logger.info(
                "egress %s recording %s (%s) -> %s",
                self.egress_id,
                self.room_name,
                "audio-only" if EGRESS_AUDIO_ONLY else "video",
                self.s3_key,
            )
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


def _sarvam_pair():
    from livekit.plugins import sarvam

    # STTRealtime (saaras:v3-realtime) is the streaming class in newer plugin
    # releases; older ones ship only STT. Prefer realtime, fall back rather
    # than crashing on a version we did not pin.
    if hasattr(sarvam, "STTRealtime"):
        stt_impl = sarvam.STTRealtime(
            language=SARVAM_STT_LANGUAGE,
            stream_type=SARVAM_STT_STREAM_TYPE,
        )
    else:
        logger.warning(
            "sarvam.STTRealtime unavailable in the installed plugin; using sarvam.STT"
        )
        stt_impl = sarvam.STT(language=SARVAM_STT_LANGUAGE)
    tts_impl = sarvam.TTS(
        target_language_code=SARVAM_TTS_LANGUAGE,
        model=SARVAM_TTS_MODEL,
        speaker=SARVAM_TTS_SPEAKER,
    )
    return stt_impl, tts_impl


def _legacy_pair():
    from livekit.plugins import deepgram, elevenlabs

    return deepgram.STT(model="nova-3"), elevenlabs.TTS()


_VOICE_BUILDERS = {VOICE_SARVAM: _sarvam_pair, VOICE_LEGACY: _legacy_pair}


def build_voice_components():
    """Construct the (STT, TTS) the session will use.

    When both providers are configured this returns LiveKit's FallbackAdapters
    rather than one provider's clients, so a Sarvam outage, timeout or 429
    fails over to Deepgram/ElevenLabs mid-session instead of ending the
    interview. Previously the legacy pair was unreachable: selection returned
    Sarvam whenever SARVAM_API_KEY was set, so the "fallback" only covered
    someone forgetting to set the key — never the vendor being down, which is
    the failure that actually happens.

    Kept separate from the selection helpers so those stay importable and
    unit-testable without the livekit plugin packages installed.
    """
    providers = available_voice_providers()
    if not providers:
        return None, None

    pairs = []
    for name in providers:
        try:
            pairs.append((name, *_VOICE_BUILDERS[name]()))
        except Exception as err:  # noqa: BLE001 — a broken plugin must not take the others down
            logger.error("voice provider %s failed to construct: %s", name, err)

    if not pairs:
        return None, None
    if len(pairs) == 1:
        logger.info("voice provider: %s (no failover configured)", pairs[0][0])
        return pairs[0][1], pairs[0][2]

    from livekit.agents import stt as stt_mod
    from livekit.agents import tts as tts_mod

    logger.info("voice providers: %s (failover in order)", " -> ".join(p[0] for p in pairs))
    return (
        stt_mod.FallbackAdapter([p[1] for p in pairs]),
        tts_mod.FallbackAdapter([p[2] for p in pairs]),
    )


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
        "- Do NOT praise or evaluate answers. No \"great\", \"excellent\",\n"
        "  \"perfect\", \"solid\", \"good point\", \"that makes sense\". Acknowledge\n"
        "  briefly and ask the next question. Warmth comes from tone and\n"
        "  curiosity, never from compliments.\n"
        "- You MUST cover the student's own workflow and sector map before\n"
        "  ending. Do not call end_interview until you have.\n"
        "- Many students speak English as a second or third language and may\n"
        "  mix in Hindi. Never treat accent, grammar or hesitation as a weak\n"
        "  answer. If you cannot follow an answer, ask them to put it another\n"
        "  way rather than moving on.\n"
        "- When the question budget is reached or all categories are covered,\n"
        "  call the end_interview tool instead of asking another question."
    )


async def entrypoint(ctx) -> None:
    """One job = one interview room. Wires the STT->LLM->TTS session, mirrors
    every finalized utterance into the LMS, records via Egress, and completes
    the interview when the LLM signals done or the 12-minute budget expires."""
    from livekit.agents import Agent, AgentSession, RoomInputOptions, RunContext, function_tool
    from livekit.agents import inference
    from livekit.plugins import silero

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
        context = await lms.get_context(
            interview_id,
            reserve_recording=egress_configured(),
        )
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

    video_reservation = context.get("videoReservation")
    video_key = (
        video_reservation.get("s3Key") if isinstance(video_reservation, dict) else None
    )
    video_reservation_id = (
        video_reservation.get("id") if isinstance(video_reservation, dict) else None
    )
    recording_reservation = context.get("recordingReservation")
    recording_key = (
        recording_reservation.get("s3Key")
        if isinstance(recording_reservation, dict)
        else None
    )
    recording_reservation_id = (
        recording_reservation.get("id")
        if isinstance(recording_reservation, dict)
        else None
    )
    egress = Egress(room_name, video_key)
    await egress.start()

    async def stop_and_report_recording() -> None:
        """Stop Egress and report the key exactly once.

        Registered as a shutdown callback as well as being called on the normal
        path: when the student degrades to the turn-based loop mid-interview,
        agent-turn posts start returning 409 and this worker shuts down with
        the recording still running. Without this the video of every degraded
        interview would be orphaned in S3 with no row pointing at it.
        """
        if getattr(stop_and_report_recording, "_done", False):
            return
        stop_and_report_recording._done = True  # type: ignore[attr-defined]
        key = await egress.stop()
        await lms.post_complete(
            interview_id,
            None,
            None,
            video_s3_key=key,
            video_reservation_id=video_reservation_id if key else None,
        )
        await lms.flush()

    ctx.add_shutdown_callback(stop_and_report_recording)

    started_at = time.monotonic()
    finished = asyncio.Event()
    question_count = 0
    agent_utterances: list[str] = []

    class Interviewer(Agent):
        def __init__(self) -> None:
            super().__init__(instructions=realtime_instructions(context.get("systemPrompt", "")))

        @function_tool
        async def end_interview(self, ctx_: RunContext) -> str:
            """Call this when the interview should end: the question budget is
            reached, all categories are covered, or the student asks to stop."""
            # Refuse an early finish. A previous run ended after the RAG segment
            # having never asked about the student's own Make workflow or sector
            # map, which is the only evidence the work-integrity score is drawn
            # from. The grader correctly scored it 12/50 and flagged the
            # transcript — but the interview was already unrecoverable.
            elapsed = time.monotonic() - started_at
            covered = own_work_covered(agent_utterances)
            # Two ways to be too early: too few questions, or — the one that
            # actually bit — enough questions but never having raised the
            # student's own build. Released near the time cap so a model that
            # will not comply cannot trap the student in a refusal loop.
            if (
                question_count < MIN_TURNS_BEFORE_END or not covered
            ) and elapsed < END_GUARD_RELEASE_SECONDS:
                logger.info(
                    "end_interview refused for %s at %s turns (own-work covered=%s, %.0fs elapsed)",
                    interview_id, question_count, covered, elapsed,
                )
                return (
                    "Not yet — you have not covered the final segment. Do NOT end "
                    "the interview. Ask the student about the workflow and sector "
                    "map they built and uploaded: how it handles errors and "
                    "timeouts, what trigger criteria they chose and why those are "
                    "right for this workflow, what they discussed but decided not "
                    "to implement, and how they kept credit use down. Ask one "
                    "question now, and say the words \"sector map\" or "
                    "\"blueprint\" in it so the segment is on the record."
                )
            finished.set()
            return "The interview is over. Say a short, warm goodbye."

        async def on_enter(self) -> None:
            # Greeting before the student is in the room throws the greeting
            # away. One real interview burned 167 seconds — 18% of its budget —
            # because the agent greeted an empty room at t=0, the student
            # arrived at t=167 having heard nothing, said "Hello", and was
            # greeted a second time. Wait for them, then speak.
            try:
                await asyncio.wait_for(ctx.wait_for_participant(), timeout=120)
            except asyncio.TimeoutError:
                logger.warning(
                    "no participant joined %s within 120s — greeting anyway",
                    interview_id,
                )
            except Exception as err:  # noqa: BLE001 — never block the greeting
                logger.warning("wait_for_participant failed for %s: %s", interview_id, err)
            self.session.generate_reply(
                instructions=(
                    "Greet the student warmly in one or two sentences, then ask "
                    "your first interview question."
                )
            )

    stt, tts = build_voice_components()
    session = AgentSession(
        stt=stt,
        llm=inference.LLM(model=DIALOG_MODEL),
        tts=tts,
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
            agent_utterances.append(text)
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

    await stop_and_report_recording()
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

    identity = load_runtime_identity()
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not identity["verified"]:
        print(
            "[praxel-forge-agent] Railway artifact identity is incomplete; exiting.",
            file=sys.stderr,
        )
        sys.exit(1)
    heartbeat = HeartbeatReporter(identity)
    heartbeat.start()

    # Imported after the env check so a misconfigured container prints the
    # missing-env message instead of an SDK traceback.
    from livekit.agents import WorkerOptions, cli

    providers = available_voice_providers()
    forced = voice_override()
    if forced:
        logger.warning("voice provider PINNED to %s by INTERVIEW_VOICE_PROVIDER", forced)
    if providers[:1] == [VOICE_SARVAM]:
        logger.info(
            "voice provider: sarvam (stt language=%s, tts %s/%s)",
            SARVAM_STT_LANGUAGE, SARVAM_TTS_MODEL, SARVAM_TTS_SPEAKER,
        )
    if len(providers) > 1:
        logger.info("voice failover configured: %s", " -> ".join(providers))
    elif providers == [VOICE_LEGACY]:
        logger.warning(
            "voice provider: deepgram+elevenlabs only — no Sarvam, so nothing "
            "to fail over FROM"
        )
    else:
        logger.warning("voice provider: %s with NO failover configured", providers or "none")
    logger.info("env OK — starting LiveKit interview agent worker")
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, request_fnc=request_fnc))


if __name__ == "__main__":
    main()
