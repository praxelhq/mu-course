"""Praxel Forge interview agent — LiveKit Agents worker entrypoint.

SKELETON (U5): connects to LiveKit, logs readiness, and exits with a clear
message when required env is missing. The actual interview pipeline
(Deepgram STT -> Gemini dialog -> ElevenLabs TTS, plus LMS callbacks via
AGENT_INTERNAL_TOKEN/APP_URL) is implemented in U13.

Run: python main.py start   (the `start` subcommand is the livekit-agents CLI)
"""

import logging
import os
import sys

logger = logging.getLogger("praxel-forge-agent")

# livekit-agents reads these directly from the environment.
REQUIRED_ENV = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]

# Needed by the U13 pipeline; warn-only while this is a skeleton.
PIPELINE_ENV = [
    "DEEPGRAM_API_KEY",
    "GEMINI_API_KEY",
    "ELEVENLABS_API_KEY",
    "AGENT_INTERNAL_TOKEN",
    "APP_URL",
]


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

    for k in PIPELINE_ENV:
        if not os.environ.get(k):
            logger.warning(
                "env %s is not set — fine for the skeleton, required once "
                "U13 lands the interview pipeline",
                k,
            )

    # Our codebase's canonical name is GEMINI_API_KEY; the livekit google
    # plugin reads GOOGLE_API_KEY. Map the alias so only one needs setting.
    if os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]


async def entrypoint(ctx) -> None:
    """Placeholder job entrypoint. U13 replaces this with the interview
    pipeline (AgentSession with deepgram.STT / google.LLM / elevenlabs.TTS)."""
    await ctx.connect()
    logger.info(
        "connected to room %s — placeholder pipeline, no interviewer yet (U13)",
        ctx.room.name,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    check_env()

    # Imported after the env check so a misconfigured container prints the
    # missing-env message instead of an SDK traceback.
    from livekit.agents import WorkerOptions, cli

    logger.info("env OK — starting LiveKit agent worker (skeleton)")
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))


if __name__ == "__main__":
    main()
