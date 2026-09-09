import os
import sys
import tempfile
import time
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import main


class RuntimeHeartbeatTests(unittest.TestCase):
    def test_identity_uses_baked_sha_and_railway_snapshot(self):
        source_sha = "a" * 40
        with tempfile.TemporaryDirectory() as root:
            source_path = Path(root) / "BUILD_SOURCE_SHA"
            source_path.write_text(source_sha + "\n", encoding="utf-8")
            env = {
                "RELEASE_SHA": "b" * 40,
                "RAILWAY_GIT_COMMIT_SHA": "c" * 40,
                "RAILWAY_DEPLOYMENT_ID": "agent-deploy",
                "RAILWAY_SNAPSHOT_ID": "agent-snapshot",
                "RAILWAY_REPLICA_ID": "agent-replica",
            }

            identity = main.load_runtime_identity(source_path=source_path, env=env)

        self.assertEqual(identity["sourceSha"], source_sha)
        self.assertEqual(identity["imageDigest"], "agent-snapshot")
        self.assertTrue(identity["verified"])

    def test_reporter_posts_only_bounded_identity_to_internal_endpoint(self):
        calls = []

        def post(url, *, json, headers, timeout):
            calls.append((url, json, headers, timeout))

            class Response:
                status_code = 200

            return Response()

        identity = {
            "sourceSha": "a" * 40,
            "deploymentId": "agent-deploy",
            "imageDigest": "agent-snapshot",
            "instanceId": "agent-replica",
            "verified": True,
        }
        with patch.dict(
            os.environ,
            {
                "APP_URL": "https://forge.example/",
                "AGENT_INTERNAL_TOKEN": "secret-token",
                "AGENT_HEARTBEAT_INTERVAL_SECONDS": "30",
            },
            clear=False,
        ):
            reporter = main.HeartbeatReporter(identity=identity, post=post)
            self.assertTrue(reporter.report_once())

        self.assertEqual(calls[0][0], "https://forge.example/api/internal/service-heartbeat")
        self.assertEqual(
            calls[0][1],
            {
                "sourceSha": "a" * 40,
                "deploymentId": "agent-deploy",
                "imageDigest": "agent-snapshot",
                "instanceId": "agent-replica",
                "intervalSeconds": 30,
            },
        )
        self.assertEqual(calls[0][2], {"X-Agent-Token": "secret-token"})
        self.assertNotIn("secret-token", str(calls[0][1]))


class ProductionInterviewSafetyTests(unittest.TestCase):
    def test_legacy_elevenlabs_client_receives_the_configured_key_explicitly(self):
        calls = []
        plugins = types.ModuleType("livekit.plugins")
        plugins.deepgram = SimpleNamespace(STT=lambda **kwargs: ("stt", kwargs))
        plugins.elevenlabs = SimpleNamespace(TTS=lambda **kwargs: calls.append(kwargs) or ("tts", kwargs))
        with patch.dict(sys.modules, {"livekit.plugins": plugins}):
            with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "configured-key"}, clear=False):
                _, tts = main._legacy_pair()
        self.assertEqual(tts, ("tts", {"api_key": "configured-key"}))
        self.assertEqual(calls, [{"api_key": "configured-key"}])

    def test_agent_session_stays_alive_when_a_student_reconnects(self):
        src = Path("main.py").read_text(encoding="utf-8")
        body = src[src.index("async def entrypoint("):src.index("async def request_fnc(")]
        self.assertIn("RoomInputOptions(close_on_disconnect=False)", body)

    def test_non_message_agent_events_do_not_break_turn_persistence(self):
        self.assertIsNone(main.conversation_item_turn(SimpleNamespace()))
        self.assertIsNone(main.conversation_item_turn(SimpleNamespace(role="handoff")))
        self.assertEqual(
            main.conversation_item_turn(SimpleNamespace(role="assistant", text_content="  Next question?  ")),
            ("agent", "Next question?"),
        )


class VoiceProviderSelectionTests(unittest.TestCase):
    """U1: Sarvam is primary; Deepgram/ElevenLabs remain the no-key fallback."""

    def test_sarvam_key_selects_sarvam(self):
        env = {
            "SARVAM_API_KEY": "sk-sarvam",
            "DEEPGRAM_API_KEY": "dg",
            "ELEVENLABS_API_KEY": "el",
        }
        self.assertEqual(main.select_voice_provider(env), main.VOICE_SARVAM)

    def test_without_sarvam_falls_back_to_legacy_pair(self):
        env = {"DEEPGRAM_API_KEY": "dg", "ELEVENLABS_API_KEY": "el"}
        self.assertEqual(main.select_voice_provider(env), main.VOICE_LEGACY)

    def test_no_complete_pair_selects_nothing(self):
        # A half-configured legacy pair is not a usable provider.
        self.assertIsNone(main.select_voice_provider({"DEEPGRAM_API_KEY": "dg"}))
        self.assertIsNone(main.select_voice_provider({}))

    def test_sarvam_wins_even_when_legacy_pair_incomplete(self):
        env = {"SARVAM_API_KEY": "sk-sarvam", "DEEPGRAM_API_KEY": "dg"}
        self.assertEqual(main.select_voice_provider(env), main.VOICE_SARVAM)

    def test_missing_voice_env_names_both_options(self):
        missing = main.missing_voice_env({})
        self.assertIn("SARVAM_API_KEY", missing)
        self.assertIn("DEEPGRAM_API_KEY", missing)
        self.assertIn("ELEVENLABS_API_KEY", missing)

    def test_missing_voice_env_is_empty_when_sarvam_present(self):
        self.assertEqual(main.missing_voice_env({"SARVAM_API_KEY": "k"}), [])


class InterviewBudgetTests(unittest.TestCase):
    def test_budget_is_twenty_minutes(self):
        """Raised from 15: a real interview spent 738 of its 913 seconds on the
        student talking and still reached only six questions, running out of
        clock before RAG/MCP and all three set probes."""
        self.assertEqual(main.MAX_INTERVIEW_SECONDS, 20 * 60)

    def test_the_budget_is_tunable_without_a_deploy(self):
        # Each concurrent slot is held for the whole budget, so throughput may
        # force this back down mid-cohort.
        assert "INTERVIEW_MAX_SECONDS" in open("main.py", encoding="utf-8").read()

    def test_the_end_guard_releases_before_the_budget_not_at_it(self):
        assert main.END_GUARD_RELEASE_SECONDS == main.MAX_INTERVIEW_SECONDS - 120


if __name__ == "__main__":
    unittest.main()


# The end guard counted questions, which is a proxy for coverage and failed as
# one: a real interview reached exactly MIN_TURNS_BEFORE_END having covered
# every segment except the student's own build, and ended one question early.
class TestOwnWorkCoverage:
    def test_the_transcript_that_slipped_through_is_not_covered(self):
        # These are the interviewer's actual questions from that interview.
        asked = [
            "Could you tell me a little about yourself and what you've been working on recently?",
            "Thinking back to your role as a Senior Product Manager, if leadership had asked you to make your team more efficient with AI, what would you automate?",
            "What is one specific part of your job that you would deliberately not hand over to AI, and why?",
            "What specific company data would you be comfortable feeding an AI tool?",
            "Suppose a US hospital network wants to buy a custom web application you built on a visual builder platform like Lovable.",
            "Beyond vendor agreements and legal approvals, what technical and operational steps would be required?",
            "Imagine you're using a single LLM assistant across three completely separate work projects.",
            "What is one specific, repeated task you would package into a dedicated workspace skill?",
        ]
        assert main.own_work_covered(asked) is False

    def test_naming_the_artifact_alone_is_not_coverage(self):
        # Caught by simulation: the interviewer said "the Make.com workflow you
        # built" INSIDE the context-isolation question, the keyword matched,
        # and the interview ended without interrogating the build at all.
        assert main.own_work_covered(
            ["How would you apply that same context separation to the Make.com "
             "workflow you built, where you process articles in a Google Sheet?"]
        ) is False

    def test_probing_without_naming_the_artifact_is_not_coverage(self):
        # Error handling in the abstract is not a defence of their build.
        assert main.own_work_covered(
            ["In general, how should an automation handle a timeout?"]
        ) is False

    def test_naming_plus_probing_is_coverage(self):
        assert main.own_work_covered(
            ["Talk me through your sector map.",
             "What does your error handling do when the HTTP module times out?"]
        ) is True

    def test_trigger_criteria_on_the_named_blueprint_counts(self):
        assert main.own_work_covered(
            ["Why does your blueprint use that trigger criteria?"]
        ) is True

    def test_what_they_left_out_counts_as_substance(self):
        assert main.own_work_covered(
            ["In the Make.com scenario you built, what did you decide not to implement?"]
        ) is True

    def test_credit_burn_counts_as_substance(self):
        assert main.own_work_covered(
            ["How did your blueprint avoid burning credits on every run?"]
        ) is True

    def test_the_word_workflow_alone_is_not_enough(self):
        # "workflow" appears in the earlier AI-in-your-job segment, so counting
        # it would mark the segment covered before it had been reached.
        assert main.own_work_covered(["Which workflow would you automate first?"]) is False

    def test_matching_ignores_case(self):
        assert main.own_work_covered(
            ["Tell me about your SECTOR MAP.", "What happens when it TIMES OUT?"]
        ) is True

    def test_no_questions_is_not_covered(self):
        assert main.own_work_covered([]) is False

    def test_the_guard_releases_before_the_time_cap(self):
        # A model that refuses to comply must not trap the student in a loop.
        assert main.END_GUARD_RELEASE_SECONDS < main.MAX_INTERVIEW_SECONDS
        assert main.END_GUARD_RELEASE_SECONDS > 0


# The legacy pair used to be unreachable: selection returned Sarvam whenever
# SARVAM_API_KEY was set, so the "fallback" only covered a missing key — never
# the vendor being down, which is the failure that actually happens.
class TestVoiceFailover:
    BOTH = {
        "SARVAM_API_KEY": "s",
        "DEEPGRAM_API_KEY": "d",
        "ELEVENLABS_API_KEY": "e",
    }

    def test_both_providers_are_available_when_both_are_keyed(self):
        assert main.available_voice_providers(self.BOTH) == [
            main.VOICE_SARVAM,
            main.VOICE_LEGACY,
        ]

    def test_sarvam_still_leads(self):
        assert main.select_voice_provider(self.BOTH) == main.VOICE_SARVAM

    def test_legacy_alone_when_sarvam_is_unkeyed(self):
        env = {k: v for k, v in self.BOTH.items() if k != "SARVAM_API_KEY"}
        assert main.available_voice_providers(env) == [main.VOICE_LEGACY]

    def test_sarvam_alone_when_the_legacy_pair_is_incomplete(self):
        # A half-configured pair is not a usable provider.
        env = {"SARVAM_API_KEY": "s", "DEEPGRAM_API_KEY": "d"}
        assert main.available_voice_providers(env) == [main.VOICE_SARVAM]

    def test_nothing_available_with_no_keys(self):
        assert main.available_voice_providers({}) == []
        assert main.select_voice_provider({}) is None

    def test_operator_can_pin_legacy_without_deleting_the_sarvam_key(self):
        # The fastest mitigation when Sarvam degrades mid-cohort: a variable
        # and a restart, with the key left in place for the way back.
        env = {**self.BOTH, "INTERVIEW_VOICE_PROVIDER": "legacy"}
        assert main.available_voice_providers(env) == [main.VOICE_LEGACY]
        assert main.select_voice_provider(env) == main.VOICE_LEGACY

    def test_operator_can_pin_sarvam(self):
        env = {**self.BOTH, "INTERVIEW_VOICE_PROVIDER": "sarvam"}
        assert main.available_voice_providers(env) == [main.VOICE_SARVAM]

    def test_a_meaningless_override_is_ignored_rather_than_fatal(self):
        env = {**self.BOTH, "INTERVIEW_VOICE_PROVIDER": "banana"}
        assert main.voice_override(env) is None
        assert main.available_voice_providers(env) == [
            main.VOICE_SARVAM,
            main.VOICE_LEGACY,
        ]

    def test_pinning_a_provider_with_no_key_leaves_nothing(self):
        # Better to fail the env check loudly than to silently ignore the pin.
        env = {"SARVAM_API_KEY": "s", "INTERVIEW_VOICE_PROVIDER": "legacy"}
        assert main.available_voice_providers(env) == []

    def test_missing_voice_env_still_names_every_key(self):
        assert main.missing_voice_env({}) == [
            "SARVAM_API_KEY",
            *main.LEGACY_VOICE_ENV,
        ]

class TestDialogOrder:
    def test_default_leads_with_gemini(self):
        # Not by configuration: LiveKit's gateway credit hit zero twice in one
        # day and 429'd on every turn, so nothing may depend on an env var
        # being set for the reliable provider to lead.
        assert main.dialog_order({}) == ["gemini", "inference"]

    def test_gemini_can_be_pinned_to_lead(self):
        # Once LiveKit's credit is exhausted it 429s on every turn, and the
        # student waits through the failed attempt before the fallback answers.
        assert main.dialog_order({"INTERVIEW_DIALOG_PROVIDER": "gemini"}) == ["gemini", "inference"]

    def test_inference_can_be_pinned_back(self):
        assert main.dialog_order({"INTERVIEW_DIALOG_PROVIDER": "inference"}) == ["inference", "gemini"]

    def test_a_meaningless_pin_falls_back_to_the_default(self):
        assert main.dialog_order({"INTERVIEW_DIALOG_PROVIDER": "banana"}) == ["gemini", "inference"]

    def test_an_unset_env_still_leads_with_gemini(self):
        # The deployed override can be removed without changing behaviour.
        assert main.dialog_order({"SOMETHING_ELSE": "1"}) == ["gemini", "inference"]

    def test_livekit_is_kept_as_the_last_leg(self):
        # A second vendor behind Gemini is worth having; depending on it is not.
        assert "inference" in main.dialog_order({})

    def test_both_legs_are_always_present(self):
        for env in ({}, {"INTERVIEW_DIALOG_PROVIDER": "gemini"}):
            assert sorted(main.dialog_order(env)) == ["gemini", "inference"]


class TestPromptCache:
    def test_the_cached_tool_schema_matches_the_tool_the_agent_runs(self):
        # The model reads end_interview's schema from the cache while the agent
        # executes the Python function; if they drift the model calls something
        # that does not exist and the interview cannot end.
        assert main.END_INTERVIEW_SCHEMA["name"] == "end_interview"
        assert main.END_INTERVIEW_SCHEMA["parameters"]["properties"] == {}

    def test_cache_outlives_the_interview_it_serves(self):
        assert main.PROMPT_CACHE_TTL_SECONDS > main.MAX_INTERVIEW_SECONDS

    def test_caching_is_switchable_without_a_deploy(self):
        assert "INTERVIEW_PROMPT_CACHE" in open("main.py", encoding="utf-8").read()

    def test_no_cache_without_a_gemini_key(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        assert main.create_prompt_cache("some instructions") is None

    def test_deleting_a_cache_that_never_existed_is_a_no_op(self):
        main.delete_prompt_cache(None)  # must not raise


class TestCacheKeepsTheFallback:
    def test_a_cached_leg_does_not_cost_the_chain(self):
        # The plugin decides per INSTANCE whether to bake system_instruction and
        # tools out of a request, so a cached leg and an uncached leg can share
        # one chat context. Collapsing to a single leg when caching was on gave
        # up the fallback for nothing.
        src = open("main.py", encoding="utf-8").read()
        assert "gemini+cache" in src
        # the cached leg is appended to `built`, not returned early
        body = src[src.index("def build_dialog_llm("):src.index("def realtime_instructions(")]
        assert "return google.LLM(" not in body

    def test_the_chain_still_honours_the_pinned_order(self):
        assert main.dialog_order({"INTERVIEW_DIALOG_PROVIDER": "gemini"})[0] == "gemini"


class TestDialogAttemptTimeout:
    def test_it_clears_geminis_minimum_deadline(self):
        # FallbackAdapter passes attempt_timeout down as the request deadline
        # and defaults to 5s. Gemini rejects anything under 10s with a
        # non-retryable 400, so every leg failed instantly and an interview
        # ended with "all LLMs are unavailable" before its first question.
        assert main.DIALOG_ATTEMPT_TIMEOUT_SECONDS >= 10

    def test_it_is_tunable_without_a_deploy(self):
        assert "INTERVIEW_DIALOG_ATTEMPT_TIMEOUT" in open("main.py", encoding="utf-8").read()

    def test_the_adapter_is_constructed_with_it(self):
        src = open("main.py", encoding="utf-8").read()
        body = src[src.index("def build_dialog_llm("):src.index("def realtime_instructions(")]
        assert "attempt_timeout=DIALOG_ATTEMPT_TIMEOUT_SECONDS" in body


class InterviewResumeTests(unittest.TestCase):
    """A new job for the same room must resume the interview, not restart it.

    Four greetings in one student's transcript are what these guard against.
    """

    def test_empty_transcript_is_a_first_join(self):
        ctx, count, utterances = main.restore_session_state([])
        self.assertIsNone(ctx)
        self.assertEqual(count, 0)
        self.assertEqual(utterances, [])

    def test_prior_turns_rebuild_context_counters_and_coverage(self):
        transcript = [
            {"turnNo": 0, "speaker": "system", "text": "SYSTEM PROMPT"},
            {"turnNo": 1, "speaker": "agent", "text": "Tell me about yourself."},
            {"turnNo": 2, "speaker": "student", "text": "I am an engineer."},
            {"turnNo": 3, "speaker": "agent", "text": "What would you automate?"},
        ]
        ctx, count, utterances = main.restore_session_state(transcript)
        self.assertIsNotNone(ctx)
        # Only the agent's own turns advance the question budget.
        self.assertEqual(count, 2)
        self.assertEqual(len(utterances), 2)
        roles = [getattr(item, "role", None) for item in ctx.items]
        self.assertEqual(roles, ["assistant", "user", "assistant"])
        # The system prompt reaches the Agent as instructions, never as history.
        joined = " ".join(
            t for item in ctx.items for t in [getattr(item, "text_content", "") or ""]
        )
        self.assertNotIn("SYSTEM PROMPT", joined)

    def test_own_work_coverage_survives_a_restart(self):
        # Without this the end-guard forgets the segment was covered and traps
        # the student in a refusal loop for the rest of the interview.
        probing = (
            "Walk me through the sector map you uploaded, and what error handling "
            "you put in when a module times out."
        )
        _, _, utterances = main.restore_session_state(
            [{"turnNo": 1, "speaker": "agent", "text": probing}]
        )
        self.assertTrue(main.own_work_covered(utterances))

    def test_blank_and_unknown_speakers_are_ignored(self):
        ctx, count, _ = main.restore_session_state(
            [
                {"turnNo": 1, "speaker": "agent", "text": "   "},
                {"turnNo": 2, "speaker": "narrator", "text": "ignored"},
                {"turnNo": 3, "speaker": "student", "text": "kept"},
                "not-a-mapping",
            ]
        )
        self.assertEqual(count, 0)
        self.assertEqual(len(ctx.items), 1)


class WallClockCeilingTests(unittest.TestCase):
    """The per-session budget restarts on every rejoin; this one cannot."""

    def test_missing_created_at_disables_the_cap_rather_than_ending_early(self):
        self.assertIsNone(main.interview_deadline(None, 600))
        self.assertIsNone(main.interview_deadline("not-a-date", 600))

    def test_time_already_spent_is_deducted(self):
        from datetime import datetime, timedelta, timezone

        started = datetime.now(timezone.utc) - timedelta(seconds=300)
        deadline = main.interview_deadline(started.isoformat(), 600)
        remaining = deadline - time.monotonic()
        self.assertTrue(240 < remaining < 360, remaining)

    def test_an_exhausted_interview_gets_no_further_time(self):
        from datetime import datetime, timedelta, timezone

        started = datetime.now(timezone.utc) - timedelta(seconds=9000)
        deadline = main.interview_deadline(started.isoformat(), 600)
        self.assertLessEqual(deadline - time.monotonic(), 0.5)


class ResumeWiringTests(unittest.TestCase):
    """The helper existing is not the fix; the entrypoint using it is.

    agent-context has returned the transcript since it was written. The agent
    simply never read it, and no test noticed for four production interviews.
    """

    SOURCE = Path(__file__).with_name("main.py").read_text()

    def test_prior_context_is_handed_to_the_agent(self):
        self.assertIn("chat_ctx=prior_ctx", self.SOURCE)
        self.assertIn('restore_session_state(\n        context.get("transcript") or []', self.SOURCE)

    def test_a_resumed_interview_is_not_greeted_again(self):
        self.assertIn("if resuming", self.SOURCE)
        self.assertIn("Do NOT greet the student", self.SOURCE)

    def test_the_wall_clock_ceiling_is_enforced_in_the_budget_watch(self):
        self.assertIn("wallclock_deadline is not None and time.monotonic() > wallclock_deadline", self.SOURCE)


class ResumeSideEffectTests(unittest.TestCase):
    """What a resumed job must NOT do a second time."""

    SOURCE = Path(__file__).with_name("main.py").read_text()

    def test_a_resumed_job_does_not_start_a_second_recording(self):
        # The video reservation is idempotent per interview, so a second egress
        # is handed the same S3 key and writes over the first job's file.
        self.assertIn("already_conversing", self.SOURCE)
        self.assertIn("not starting a second", self.SOURCE)

    def test_the_http_client_is_closed_after_the_posts_that_need_it(self):
        # Shutdown callbacks are gathered concurrently; closing the client in
        # its own callback raced the completion post and dropped it.
        self.assertNotIn("ctx.add_shutdown_callback(lms.aclose)", self.SOURCE)
        self.assertIn("await lms.aclose()", self.SOURCE)

    def test_session_close_is_watched_before_the_session_starts(self):
        close_at = self.SOURCE.index('session.on("close", on_session_close)')
        start_at = self.SOURCE.index("await session.start(")
        self.assertLess(close_at, start_at)
