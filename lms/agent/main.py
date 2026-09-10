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
completion. A disconnected student reconnects to the same LiveKit room; the
agent never hands an attempt to a manual-recording transport.

Run: python main.py start   (subcommands come from the livekit-agents CLI)
"""

import asyncio
import logging
import inspect
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
# A dropped browser gets a real opportunity to rejoin, but a permanently empty
# room must not run into the normal budget-completion path and grade a fragment.
REJOIN_GRACE_SECONDS = max(1, int(os.environ.get("INTERVIEW_REJOIN_GRACE_SECONDS", 120)))
QUESTION_BUDGET = 20  # hard ceiling across the five segments (runaway guard)
# Marks a chat item that came from the LMS transcript rather than from this
# session's microphone. Restored items are already persisted; re-posting them
# would duplicate the transcript, inflate question_count and trip the runaway
# guard. livekit-agents 1.7.1 only emits conversation_item_added from live
# speech and generation paths, never for a chat_ctx supplied at construction —
# but "the SDK does not currently do that" is not a guarantee worth a student's
# interview, so the items carry a marker and the handler drops them.
RESTORED_ITEM_ID_PREFIX = "lms-restored-"
# How long to wait for a stopped egress to finish uploading before giving up and
# leaving the attach to the LMS sweep. Audio-only MP4s land in seconds; this is
# sized for a bad day, and it never delays the student — the interview is
# completed before this wait begins.
EGRESS_UPLOAD_TIMEOUT_SECONDS = int(os.environ.get("INTERVIEW_EGRESS_UPLOAD_TIMEOUT", 90))
# A resumed interview restarts the per-session budget, so the per-session clock
# alone cannot bound a student who reconnects repeatedly. This is the wall-clock
# ceiling measured from the interview's own createdAt, and it is the only clock
# a reconnect cannot rewind. Generous on purpose: it exists to stop a runaway,
# not to punish a student whose network dropped. Below the 30-minute
# abandonment sweep would make a rejoin pointless, so keep it above.
MAX_WALLCLOCK_SECONDS = int(
    os.environ.get("INTERVIEW_MAX_WALLCLOCK_SECONDS", MAX_INTERVIEW_SECONDS * 3)
)
# The model may not end the interview before this many of its own turns. The
# five-segment arc cannot be covered in fewer, and the final segment — the
# student's own workflow and sector map — is the one that gets skipped when an
# interview ends early. Prompt instructions alone did not hold; this does.
MIN_TURNS_BEFORE_END = 10

# A stray transcription must not cut the interviewer off mid-question.
#
# Sarvam runs with language=auto so the cohort can code-mix, and on silence it
# invents filler: one student's transcript carries seventeen turns of the
# single word "I", seven of "I mean,", and a line of Bengali script he never
# spoke. LiveKit's default lets ONE transcribed word barge in, so every phantom
# fragment interrupted the question being asked. That interview holds four
# truncated openings — "When you were", "Would you be", "What is one task",
# "What is" — the same question restarted until it got through. The student
# described it as the interviewer freezing and hallucinating while the call sat
# silent. He was describing our barge-in, exactly.
#
# Requiring a few words (and a moment of speech) to interrupt costs a genuinely
# eager student a beat before they can cut in, and buys every student a
# question they can actually hear to the end.
MIN_INTERRUPTION_WORDS = int(os.environ.get("INTERVIEW_MIN_INTERRUPTION_WORDS", 3))
MIN_INTERRUPTION_SECONDS = float(
    os.environ.get("INTERVIEW_MIN_INTERRUPTION_SECONDS", 0.6)
)

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
    # The interviewer now asks these in everyday words rather than naming the
    # concept ("what makes it start" instead of "what trigger criteria"), so the
    # guard has to recognise the plain phrasing too — otherwise coverage never
    # registers and a student gets trapped in a segment they already answered.
    "makes it start",
    "make it start",
    "sets it off",
    "kicks it off",
    "how often does it run",
    "when does it run",
    "why does it run",
    "costs to run",
    "cost to run",
    "how much does it cost",
    "decided against",
    "decide against",
    "chose not to",
    "goes wrong",
    "hangs",
    "takes too long",
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


def restore_session_state(transcript: "list[dict]"):
    """Rebuild an in-progress interview from the turns the LMS already holds.

    A job is not an interview. The room name is deterministic, so a job that
    ends — a browser that stays away past the rejoin grace, a worker restart, a
    deploy — is followed by a NEW job for the SAME interview. That job used to
    construct an empty AgentSession, which meant it greeted the student and
    began at segment one again. One student was restarted four times and lost
    his interview; his transcript carries four greetings.

    agent-context has always returned the transcript. Nothing read it. This
    turns that payload back into the three pieces of state a resumed job needs:

      chat_ctx          - so the model knows what it already asked
      question_count    - so the budget and end-guard are not rewound
      agent_utterances  - so own_work_covered() does not forget that the
                          student's own build was already interrogated, which
                          would otherwise trap them in a refusal loop

    Returns (chat_ctx, question_count, agent_utterances). chat_ctx is None when
    there is nothing to resume, which is the ordinary first-join case.
    """
    from livekit.agents.llm import ChatContext

    agent_utterances: list[str] = []
    question_count = 0
    messages: list[tuple[str, str]] = []
    for turn in transcript:
        if not isinstance(turn, Mapping):
            continue
        # Turn 0 is the system prompt; it reaches the Agent as instructions.
        if turn.get("turnNo") == 0:
            continue
        text = (turn.get("text") or "").strip()
        speaker = turn.get("speaker")
        if not text or speaker not in ("agent", "student"):
            continue
        if speaker == "agent":
            question_count += 1
            agent_utterances.append(text)
            messages.append(("assistant", text))
        else:
            messages.append(("user", text))

    if not messages:
        return None, 0, []

    chat_ctx = ChatContext.empty()
    for index, (role, text) in enumerate(messages):
        chat_ctx.add_message(
            role=role, content=text, id=f"{RESTORED_ITEM_ID_PREFIX}{index}"
        )
    return chat_ctx, question_count, agent_utterances


def interview_deadline(created_at: "str | None", budget_seconds: int) -> "float | None":
    """monotonic() value past which this interview must stop, whatever the job.

    Derived from the interview's createdAt so that reconnecting cannot buy more
    time. Returns None when createdAt is unusable — the per-session budget and
    the question budget still apply, so a missing timestamp degrades to the old
    behaviour rather than ending an interview early.
    """
    if not created_at:
        return None
    from datetime import datetime, timezone

    try:
        started = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except ValueError:
        logger.warning("unparseable interview createdAt %r — no wall-clock cap", created_at)
        return None
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    already = (datetime.now(timezone.utc) - started).total_seconds()
    return time.monotonic() + max(0.0, budget_seconds - already)


# Dialog runs through LiveKit Inference, which is included in LiveKit Cloud —
# no extra provider key, and it is zero-data-retention by default, which matters
# because this prompt carries the student's own resume.
#
# gemini-3.6-flash over the latency-tuned gemma-4-31b-it: the agent ends a
# session by CALLING end_interview, and the context holds student-uploaded text
# that may be engineered to manipulate the grade. The latency gap is small next
# to the STT+TTS round trip; the instruction-following gap is not.
DIALOG_MODEL = os.environ.get("INTERVIEW_DIALOG_MODEL", "google/gemini-3.6-flash")
# The same model reached directly, as a fallback. LiveKit Inference is metered
# against a gateway credit that four interviews were enough to exhaust; when it
# returned 429 the agent joined, Sarvam transcribed the student fine, and the
# interviewer said nothing at all for the whole call. Three students sat through
# that. A mute interviewer is the worst failure this system has, because it
# looks like the student's fault.
DIALOG_FALLBACK_MODEL = os.environ.get("INTERVIEW_DIALOG_FALLBACK_MODEL", "gemini-3.6-flash")

# FallbackAdapter passes attempt_timeout down as the provider request deadline,
# and its default is 5s. Gemini REJECTS any deadline under 10s outright:
#
#   400 INVALID_ARGUMENT
#   "Manually set deadline 5s is too short. Minimum allowed deadline is 10s."
#
# Non-retryable, so every leg failed instantly and the session gave up with
# "all LLMs are unavailable" before asking a single question. A student's
# retake died this way. Anything at or above 10s works; 15 leaves headroom for
# a slow first token without making a genuinely dead leg hold the student up.
DIALOG_ATTEMPT_TIMEOUT_SECONDS = float(
    os.environ.get("INTERVIEW_DIALOG_ATTEMPT_TIMEOUT", "15")
)


# Explicit prompt caching. Implicit caching was measured at a 0% hit rate on
# this prompt (systemInstruction does not qualify), while an explicit cache
# holds 99% of it: a 20-turn interview costs $0.065 uncached and $0.008 cached.
# Gemini refuses a request that sets system_instruction, tools or tool_config
# alongside a cache, so BOTH the instructions and the end_interview schema live
# in the cache and the plugin bakes them out of every request.
PROMPT_CACHE_ENABLED = os.environ.get("INTERVIEW_PROMPT_CACHE", "1") not in ("0", "false", "False")
PROMPT_CACHE_TTL_SECONDS = MAX_INTERVIEW_SECONDS + 300

# The end_interview schema as the cache must carry it. This has to stay in step
# with the tool the Interviewer actually exposes: the model reads the schema
# from here, and the agent executes the Python function.
END_INTERVIEW_SCHEMA = {
    "name": "end_interview",
    "description": (
        "Call this when the interview should end: the question budget is "
        "reached, all categories are covered, or the student asks to stop."
    ),
    "parameters": {"type": "OBJECT", "properties": {}},
}


def create_prompt_cache(instructions: str) -> str | None:
    """Cache one interview's instructions + tools. None if caching is off or fails.

    Best-effort by design: a cache that cannot be created must cost the student
    money, never their interview.
    """
    if not PROMPT_CACHE_ENABLED:
        return None
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return None
    try:
        from google import genai
        from google.genai import types as gtypes

        client = genai.Client(api_key=key)
        cache = client.caches.create(
            model=DIALOG_FALLBACK_MODEL,
            config=gtypes.CreateCachedContentConfig(
                system_instruction=instructions,
                tools=[gtypes.Tool(function_declarations=[END_INTERVIEW_SCHEMA])],
                ttl=f"{PROMPT_CACHE_TTL_SECONDS}s",
            ),
        )
        held = getattr(getattr(cache, "usage_metadata", None), "total_token_count", None)
        logger.info("prompt cache %s created (%s tokens held)", cache.name, held)
        return cache.name
    except Exception as err:  # noqa: BLE001 — never lose an interview over a cache
        logger.warning("prompt cache unavailable (%s) — running uncached", err)
        return None


def delete_prompt_cache(name: str | None) -> None:
    """Drop the cache early. The TTL is the real guarantee, not this.

    Deletion runs during shutdown and can lose the race with the plugin closing
    its client, so a failure here is logged at debug and otherwise ignored: the
    cache expires on its own a few minutes later, and the storage it bills in
    the meantime is a fraction of a cent.
    """
    if not name:
        return
    try:
        from google import genai

        genai.Client(api_key=os.environ["GEMINI_API_KEY"]).caches.delete(name=name)
        logger.info("prompt cache %s deleted", name)
    except Exception as err:  # noqa: BLE001
        logger.debug("prompt cache %s left to expire on its TTL: %s", name, err)


def dialog_order(env: Mapping[str, str] = os.environ) -> list[str]:
    """Which dialog LLM leads. INTERVIEW_DIALOG_PROVIDER=gemini|inference.

    Gemini leads BY DEFAULT, not by configuration. LiveKit Inference meters
    against an opaque gateway credit that ran to zero twice inside one day, and
    each time it 429'd on every turn rather than intermittently: the agent
    joined, Sarvam transcribed the student, and the interviewer never spoke.
    Four students sat through that, one of whom typed "You can start asking
    questions" and left. A FallbackAdapter only helps if the leader usually
    works, and leading with that endpoint made every question pay for a failed
    attempt and its retries first.

    It stays in the chain as the last leg — a different vendor is worth having
    behind Gemini — but nothing depends on it being up, and no env var has to
    be set for that to be true.
    """
    pinned = (env.get("INTERVIEW_DIALOG_PROVIDER") or "").strip().lower()
    if pinned == "inference":
        return ["inference", "gemini"]
    return ["gemini", "inference"]


def build_dialog_llm(cache_name: str | None = None):
    """The dialog LLM chain, same model on both legs.

    A failover changes who is billed and nothing the student can hear — but it
    costs a round trip, so the order matters when one leg is known-dead.

    A cached leg does NOT cost the fallback. The plugin decides per INSTANCE
    whether to bake system_instruction and tools out of a request, so the cached
    leg reads them from the cache while the uncached legs still receive them
    from the chat context. Both share one context and both work — the cheap leg
    leads and the resilient ones stand behind it.
    """
    from livekit.agents import inference
    from livekit.agents import llm as llm_mod

    key = os.environ.get("GEMINI_API_KEY")
    built: list[tuple[str, object]] = []
    if cache_name and key:
        from livekit.plugins import google

        built.append(
            (
                "gemini+cache",
                google.LLM(
                    model=DIALOG_FALLBACK_MODEL, api_key=key, cached_content=cache_name
                ),
            )
        )
    for name in dialog_order():
        if name == "inference":
            built.append(("inference", inference.LLM(model=DIALOG_MODEL)))
        elif key:
            try:
                from livekit.plugins import google

                built.append(("gemini", google.LLM(model=DIALOG_FALLBACK_MODEL, api_key=key)))
            except Exception as err:  # noqa: BLE001 — never lose a leg over the other
                logger.error("gemini dialog leg unavailable: %s", err)

    if not built:
        raise RuntimeError("no dialog LLM could be constructed")
    if len(built) == 1:
        logger.warning("dialog LLM: %s with NO fallback", built[0][0])
        return built[0][1]

    logger.info(
        "dialog LLM: %s (attempt timeout %ss)",
        " -> ".join(n for n, _ in built),
        DIALOG_ATTEMPT_TIMEOUT_SECONDS,
    )
    return llm_mod.FallbackAdapter(
        [impl for _, impl in built],
        attempt_timeout=DIALOG_ATTEMPT_TIMEOUT_SECONDS,
    )

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
        finished: bool = False,
    ) -> None:
        # `finished` is the ONLY thing that may end an interview. A shutdown
        # reports the recording and nothing else: the worker dying, a deploy,
        # or a student's wifi blipping must never mark their interview done.
        body: dict = {"interviewId": interview_id, "finished": finished}
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

    async def _await_upload(self, egress_id: str) -> bool:
        """Wait for the file to actually reach S3. Returns whether it landed.

        stop_egress RETURNS WHILE THE MP4 IS STILL UPLOADING — the request only
        moves the egress into ENDING. Reporting the key at that moment made the
        LMS HEAD an object S3 did not have yet, and the commit failed on every
        single interview: nine recordings exist, and the newest one does not,
        because the race is not even close. So watch the egress to COMPLETE
        before claiming the key.
        """
        from livekit import api

        deadline = time.monotonic() + EGRESS_UPLOAD_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            try:
                res = await self._lkapi.egress.list_egress(
                    api.ListEgressRequest(egress_id=egress_id)
                )
            except Exception as err:  # noqa: BLE001 — transient API blip; retry
                logger.warning("egress status check failed (%s): %s", egress_id, err)
                await asyncio.sleep(2)
                continue
            info = next(iter(res.items), None)
            if info is None:
                logger.warning("egress %s vanished before completing", egress_id)
                return False
            status = info.status
            if status == api.EgressStatus.EGRESS_COMPLETE:
                return True
            if status in (api.EgressStatus.EGRESS_FAILED, api.EgressStatus.EGRESS_ABORTED):
                logger.error("egress %s ended as %s: %s", egress_id, status, info.error)
                return False
            await asyncio.sleep(2)
        logger.warning(
            "egress %s still uploading after %ss — leaving it to the LMS sweep",
            egress_id,
            EGRESS_UPLOAD_TIMEOUT_SECONDS,
        )
        return False

    async def stop(self) -> str | None:
        """Stop the recording and wait for it to upload.

        Returns the S3 key only once the object is actually there, so the
        caller never reports a key the LMS cannot commit.
        """
        if not self._lkapi:
            return None
        egress_id = self.egress_id
        key: str | None = None
        try:
            if egress_id:
                from livekit import api

                await self._lkapi.egress.stop_egress(api.StopEgressRequest(egress_id=egress_id))
                if await self._await_upload(egress_id):
                    key = self.s3_key
        except Exception as err:  # noqa: BLE001
            logger.error("egress stop failed (%s): %s", egress_id, err)
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

    # The LiveKit plugin looks for ELEVEN_API_KEY, while this service's
    # documented Railway contract uses ELEVENLABS_API_KEY. Pass the latter
    # explicitly so the configured emergency leg is actually constructible.
    return deepgram.STT(model="nova-3"), elevenlabs.TTS(api_key=os.environ["ELEVENLABS_API_KEY"])


def conversation_item_turn(item) -> tuple[str, str] | None:
    """Map a finalized LiveKit message to an LMS turn, ignoring control items."""
    text = (getattr(item, "text_content", "") or "").strip()
    role = getattr(item, "role", None)
    if not text or role not in ("user", "assistant"):
        return None
    return ("student" if role == "user" else "agent", text)


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
    # NOT registered as its own callback: shutdown callbacks are gathered
    # CONCURRENTLY, so closing the HTTP client raced the callback that still
    # needed it to post the completion and flush buffered turns. The recording
    # callback closes it last instead — see report_recording_only.

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
    # A resumed job must NOT start a second recording. The video reservation is
    # idempotent per interview, so a re-dispatched job is handed the same S3 key
    # and a second egress would write straight over the first one's file (or
    # orphan a version of it). Now that a re-dispatch resumes rather than
    # restarts, this path is ordinary rather than exotic. The transcript, which
    # is what grading actually reads, is complete either way.
    already_conversing = any(
        isinstance(t, Mapping) and t.get("speaker") in ("agent", "student")
        for t in (context.get("transcript") or [])
    )
    if already_conversing:
        logger.info(
            "interview %s resumed — keeping the first job's recording, not starting a second",
            interview_id,
        )
    else:
        try:
            # Unbounded, and it sits between the student joining and the session
            # starting: a slow Egress API call is dead air with a student in the room.
            await asyncio.wait_for(egress.start(), timeout=20)
        except asyncio.TimeoutError:
            logger.warning("egress start timed out for %s — continuing unrecorded", interview_id)
    turn_tasks: set[asyncio.Task[None]] = set()

    async def flush_finalized_turns() -> None:
        # conversation_item_added is synchronous, so it launches persistence
        # work in the background. Finish that work before changing the
        # interview status; otherwise a last turn can arrive after completion
        # and be rejected from the grading transcript.
        if turn_tasks:
            await asyncio.gather(*tuple(turn_tasks), return_exceptions=True)
        await lms.flush()

    async def stop_and_report_recording(finished: bool = False) -> None:
        """Stop Egress and report the key exactly once.

        Runs on the normal path AND as a shutdown callback, because a recording
        with no row pointing at it is lost either way. But only the normal path
        passes finished=True.

        This used to complete the interview on ANY shutdown. A student whose
        connection blipped — or who simply refreshed the page — had their
        interview marked done and sent to grading while they were still in it,
        and a deploy did the same to everyone live. The docstring claimed the
        LMS guarded against that; it did not.
        """
        if getattr(stop_and_report_recording, "_done", False):
            return
        stop_and_report_recording._done = True  # type: ignore[attr-defined]
        await flush_finalized_turns()

        # Completion first, and on its own. Waiting for the upload before
        # saying "this interview is over" would put an S3 write on the critical
        # path of a student's grade; the recording is an attachment to the
        # interview, never a precondition for it.
        await lms.post_complete(interview_id, None, None, finished=finished)

        # Then the recording, once it has actually landed. A second post: the
        # route treats a keyed post with finished=False as recording-only and
        # commits it without touching the status it already set.
        key = await egress.stop()
        if key and video_reservation_id:
            await lms.post_complete(
                interview_id,
                None,
                None,
                video_s3_key=key,
                video_reservation_id=video_reservation_id,
                finished=False,
            )

    async def report_recording_only() -> None:
        # Shutdown of any kind: keep the recording, leave the interview alone.
        await stop_and_report_recording(finished=False)
        # Last writer wins the client: everything above needs it, nothing after
        # does. Closing it anywhere else races these posts and drops them.
        await lms.aclose()

    ctx.add_shutdown_callback(report_recording_only)

    started_at = time.monotonic()
    finished = asyncio.Event()
    aborted = False

    # Resume, don't restart. See restore_session_state.
    prior_ctx, question_count, agent_utterances = restore_session_state(
        context.get("transcript") or []
    )
    resuming = prior_ctx is not None
    # Answers on the record, across every job this interview has had. An
    # interview with none of these is not an interview and must never be
    # completed: doing so grades silence and burns the student's one attempt.
    student_turns = sum(
        1
        for turn in (context.get("transcript") or [])
        if isinstance(turn, Mapping) and turn.get("speaker") == "student"
    )
    if resuming:
        logger.info(
            "interview %s: resuming with %s prior questions already asked",
            interview_id,
            question_count,
        )

    # The one clock a reconnect cannot rewind. createdAt is the interview's own
    # start; a job that begins 12 minutes into it inherits those 12 minutes.
    wallclock_deadline = interview_deadline(
        context.get("createdAt"), MAX_WALLCLOCK_SECONDS
    )

    class Interviewer(Agent):
        def __init__(self) -> None:
            super().__init__(
                instructions=realtime_instructions(context.get("systemPrompt", "")),
                chat_ctx=prior_ctx,
            )

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
                    "map they built and uploaded, in plain language: what happens "
                    "when a step fails or something takes too long, what makes it "
                    "start and why that, what they thought about doing and decided "
                    "against, and what it costs to run. Ask one question now, in "
                    "everyday words rather than technical ones, and say the words "
                    "\"sector map\" or \"blueprint\" in it so the segment is on "
                    "the record."
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
            # The budget and the end-guard release both count from here, not
            # from process start: a student who takes two minutes to get their
            # camera working was otherwise handed an 18-minute interview whose
            # guard released before the own-work segment was reachable.
            nonlocal started_at
            started_at = time.monotonic()
            # A resumed interview must not be re-introduced. The student has
            # already been greeted — possibly several times — and re-asking
            # segment one is how an interview gets destroyed rather than
            # recovered. The prior turns are in the chat context; carry on.
            self.session.generate_reply(
                instructions=(
                    "You have just reconnected to an interview already in "
                    "progress. Do NOT greet the student, introduce yourself, or "
                    "repeat a question you have already asked — the conversation "
                    "so far is in your context. In one short sentence, tell them "
                    "you are back, then continue with the NEXT question in the "
                    "sequence."
                )
                if resuming
                else (
                    "Greet the student warmly in one or two sentences, then ask "
                    "your first interview question."
                )
            )

    stt, tts = build_voice_components()

    # One cache per interview: the instructions carry this student's own
    # artifacts, so nothing is shareable between them. Created before the
    # session so a failure simply means an uncached (dearer) interview.
    # google-genai's sync client builds its httpx client with timeout=None, so
    # this is an unbounded blocking call on the job's event loop — a Gemini
    # stall here freezes the agent before the session even starts, with the
    # student already in the room. Off-thread, with a hard ceiling.
    try:
        prompt_cache = await asyncio.wait_for(
            asyncio.to_thread(
                create_prompt_cache, realtime_instructions(context.get("systemPrompt", ""))
            ),
            timeout=20,
        )
    except (asyncio.TimeoutError, Exception) as err:  # noqa: BLE001
        logger.warning("prompt cache setup skipped for %s: %s", interview_id, err)
        prompt_cache = None

    async def drop_prompt_cache() -> None:
        # Same blocking-client problem, and this one runs inside the shutdown
        # gather where Railway's kill window is already ticking. The TTL is the
        # real guarantee, so give it a few seconds and move on.
        try:
            await asyncio.wait_for(
                asyncio.to_thread(delete_prompt_cache, prompt_cache), timeout=5
            )
        except Exception:  # noqa: BLE001
            pass

    if prompt_cache:
        ctx.add_shutdown_callback(drop_prompt_cache)

    # Passed by signature check rather than positionally: the plugin floor is
    # livekit-agents>=1.0 and these landed during that line, so an older wheel
    # must degrade to the previous behaviour instead of failing to start and
    # taking every interview down with it.
    interruption_kwargs: dict[str, object] = {}
    session_params = inspect.signature(AgentSession.__init__).parameters
    for name, value in (
        ("min_interruption_words", MIN_INTERRUPTION_WORDS),
        ("min_interruption_duration", MIN_INTERRUPTION_SECONDS),
    ):
        if name in session_params:
            interruption_kwargs[name] = value
        else:
            logger.warning("AgentSession has no %s — barge-in stays at the default", name)

    session = AgentSession(
        stt=stt,
        llm=build_dialog_llm(prompt_cache),
        tts=tts,
        vad=silero.VAD.load(),
        **interruption_kwargs,
    )

    def on_item_added(ev) -> None:
        # A restored turn is already in the LMS; posting it again would
        # duplicate the graded transcript and rewind nothing in our favour.
        if str(getattr(ev.item, "id", "") or "").startswith(RESTORED_ITEM_ID_PREFIX):
            return
        # conversation_item_added also delivers AgentHandoff, which is not a
        # text message. Treat it as an ignorable control event rather than
        # raising inside LiveKit's event emitter.
        turn = conversation_item_turn(ev.item)
        if turn is None:
            return
        speaker, text = turn
        nonlocal question_count, student_turns
        if speaker == "agent":
            question_count += 1
            agent_utterances.append(text)
        else:
            student_turns += 1
        # Persist-before-anything-else is the LMS's job; ours is never to drop
        # a finalized utterance (retry + buffer inside post_turn).
        task = asyncio.create_task(lms.post_turn(interview_id, speaker, text))
        turn_tasks.add(task)
        task.add_done_callback(turn_tasks.discard)

    session.on("conversation_item_added", on_item_added)

    # If every LLM leg fails, AgentSession closes ITSELF. Nothing used to
    # notice: `finished` stayed unset, the student got dead air until the
    # 20-minute budget expired, and the fragment was then completed and graded.
    #
    # Registered BEFORE start(): both LLM legs can fail on the very first
    # request — generating the greeting — and a close emitted before this
    # listener existed left `finished` unset until the budget, which is the
    # dead-air-then-grade-a-fragment path all over again.
    def on_session_close(_ev=None) -> None:
        nonlocal aborted
        if not finished.is_set():
            aborted = True
            logger.error(
                "interview %s: session closed on its own after %s questions — "
                "NOT completing, leaving it live so the student can rejoin",
                interview_id, question_count,
            )
            finished.set()

    try:
        session.on("close", on_session_close)
    except Exception as err:  # noqa: BLE001 — never fail startup over a listener
        logger.warning("could not watch session close for %s: %s", interview_id, err)

    # A browser reconnect is normal on student networks. The default closes
    # the AgentSession on that event, abandoning the room before the browser
    # can rejoin it.
    await session.start(
        agent=Interviewer(),
        room=ctx.room,
        room_input_options=RoomInputOptions(close_on_disconnect=False),
    )

    rejoin_task: asyncio.Task[None] | None = None

    async def abort_if_student_does_not_rejoin() -> None:
        nonlocal aborted
        await asyncio.sleep(REJOIN_GRACE_SECONDS)
        if finished.is_set() or ctx.room.remote_participants:
            return
        aborted = True
        logger.warning(
            "interview %s: no student rejoined within %ss — recording only",
            interview_id,
            REJOIN_GRACE_SECONDS,
        )
        finished.set()

    def on_participant_disconnected(_participant) -> None:
        nonlocal rejoin_task
        if finished.is_set() or ctx.room.remote_participants:
            return
        if rejoin_task is None or rejoin_task.done():
            rejoin_task = asyncio.create_task(abort_if_student_does_not_rejoin())

    def on_participant_connected(_participant) -> None:
        nonlocal rejoin_task
        if rejoin_task is not None and not rejoin_task.done():
            rejoin_task.cancel()
        rejoin_task = None

    ctx.room.on("participant_disconnected", on_participant_disconnected)
    ctx.room.on("participant_connected", on_participant_connected)

    def abort_rather_than_grade_silence(reason: str) -> None:
        """Expiring the clock is not the same as having conducted an interview.

        A student who dropped during startup — before the participant handlers
        were even registered — used to have the agent greet an empty room, ask
        into it for twenty minutes, and then complete a transcript with zero
        answers in it. That grades silence and spends the student's one attempt.
        """
        nonlocal aborted
        if student_turns == 0:
            aborted = True
            logger.error(
                "interview %s: %s with no student turns — NOT completing",
                interview_id,
                reason,
            )

    async def budget_watch() -> None:
        while not finished.is_set():
            if time.monotonic() - started_at > MAX_INTERVIEW_SECONDS:
                logger.info("interview %s hit the %ss budget", interview_id, MAX_INTERVIEW_SECONDS)
                abort_rather_than_grade_silence("budget expired")
                finished.set()
                return
            if wallclock_deadline is not None and time.monotonic() > wallclock_deadline:
                logger.info(
                    "interview %s hit the %ss wall-clock ceiling across reconnects",
                    interview_id,
                    MAX_WALLCLOCK_SECONDS,
                )
                abort_rather_than_grade_silence("wall-clock ceiling reached")
                finished.set()
                return
            if question_count >= QUESTION_BUDGET * 2:  # runaway guard
                abort_rather_than_grade_silence("question runaway guard tripped")
                finished.set()
                return
            await asyncio.sleep(5)

    watcher = asyncio.create_task(budget_watch())
    await finished.wait()
    watcher.cancel()
    if rejoin_task is not None:
        rejoin_task.cancel()

    # Wind down: closing line, stop the recording, mark the interview done.
    if not aborted:
        try:
            await asyncio.wait_for(
                session.say(CLOSING_LINE, allow_interruptions=False), timeout=30
            )
        except Exception as err:  # noqa: BLE001 — closing audio is a nicety
            logger.warning("closing line failed for %s: %s", interview_id, err)
    try:
        # Unbounded, and it runs while Railway's shutdown clock is already
        # ticking on a deploy — the completion post is queued behind it.
        await asyncio.wait_for(session.drain(), timeout=30)
    except Exception:  # noqa: BLE001 — including the timeout; keep winding down
        pass

    # An aborted session reports its recording and stops there. Completing it
    # would grade whatever fragment exists and burn the student's one attempt.
    await stop_and_report_recording(finished=not aborted)
    try:
        await session.aclose()
    except Exception:  # noqa: BLE001
        pass

    # Leaving an aborted interview's room standing is what stranded students.
    # Dispatch is automatic, which means it fires once — when the room is
    # created. A room this job abandons will never be given another agent, and
    # the student's browser will happily reconnect to it forever, watching
    # itself, while the transcript poll keeps the heartbeat fresh enough that
    # the abandonment sweep cannot see them either.
    #
    # Deleting it makes their next join create a new room, which does dispatch —
    # and that job now resumes from the transcript rather than starting over.
    # Only on the aborted path: deleting the room on a normal finish would race
    # the student's own poll and bounce them out before they see their result.
    if aborted:
        try:
            await asyncio.wait_for(ctx.delete_room(), timeout=10)
            logger.info(
                "interview %s: deleted the room so a rejoin gets a fresh agent",
                interview_id,
            )
        except Exception as err:  # noqa: BLE001 — the LMS also recovers this
            logger.warning("could not delete room for %s: %s", interview_id, err)

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
