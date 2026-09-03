import os
import tempfile
import unittest
from pathlib import Path
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
    def test_budget_is_fifteen_minutes(self):
        """R3: the interview ends at 15 minutes, raised from 12."""
        self.assertEqual(main.MAX_INTERVIEW_SECONDS, 15 * 60)


if __name__ == "__main__":
    unittest.main()
