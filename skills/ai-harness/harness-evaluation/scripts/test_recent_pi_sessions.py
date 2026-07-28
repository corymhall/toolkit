#!/usr/bin/env python3

import datetime as dt
import importlib.util
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    "recent_pi_sessions", SCRIPT_DIR / "recent_pi_sessions.py"
)
assert SPEC and SPEC.loader
recent_pi_sessions = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recent_pi_sessions)


class RecentPiSessionsTest(unittest.TestCase):
    fixtures = SCRIPT_DIR / "fixtures" / "pi"

    def scan(self, name: str, cutoff: str):
        parsed = recent_pi_sessions.read_session(self.fixtures / name)
        self.assertIsNotNone(parsed)
        summary = recent_pi_sessions.summarize_session(parsed)
        self.assertIsNotNone(summary)
        self.assertGreaterEqual(
            summary.activity, recent_pi_sessions.parse_timestamp(cutoff)
        )
        return summary

    def test_resumed_session_uses_latest_message_activity(self):
        summary = self.scan("resumed.jsonl", "2026-01-02T00:00:00Z")
        self.assertEqual(summary.started.isoformat(), "2026-01-01T00:00:00+00:00")
        self.assertEqual(summary.activity.isoformat(), "2026-01-03T12:00:00+00:00")

    def test_active_branch_excludes_abandoned_failures(self):
        summary = self.scan("branched.jsonl", "2026-01-02T00:00:00Z")
        self.assertEqual(summary.ask, "Original request")
        self.assertEqual(summary.active_entries, 3)
        self.assertEqual(summary.total_entries, 5)
        self.assertEqual(summary.failures, [])

    def test_bounded_scan_uses_branch_active_at_window_end(self):
        parsed = recent_pi_sessions.read_session(self.fixtures / "branched.jsonl")
        self.assertIsNotNone(parsed)
        through = recent_pi_sessions.parse_timestamp("2026-01-03T10:30:00Z")
        summary = recent_pi_sessions.summarize_session(parsed, through)
        self.assertIsNotNone(summary)
        self.assertEqual(summary.active_entries, 3)
        self.assertEqual(summary.failures, ["bash: Command exited with code 1"])
        self.assertEqual(summary.activity.isoformat(), "2026-01-03T10:01:00+00:00")

    def test_skill_injection_is_not_reported_as_the_ask(self):
        summary = self.scan("skill-injection.jsonl", "2026-01-02T00:00:00Z")
        self.assertEqual(summary.ask, "Review this change")
        self.assertEqual(summary.skills, ["request-review"])

    def test_read_skill_tool_error_and_malformed_line(self):
        summary = self.scan("tool-error-malformed.jsonl", "2026-01-02T00:00:00Z")
        self.assertEqual(summary.skills, ["go-development"])
        self.assertEqual(summary.failures, ["bash: Command exited with code 1"])
        self.assertIn("skipped 1 malformed JSON line(s)", summary.warnings)

    def test_unknown_session_version_is_visible(self):
        summary = self.scan("unsupported-version.jsonl", "2026-01-02T00:00:00Z")
        self.assertTrue(
            any(
                "unsupported session version 99" in warning
                for warning in summary.warnings
            )
        )

    def test_user_followups_surface_human_corrections(self):
        summary = self.scan("followups.jsonl", "2026-01-02T00:00:00Z")
        self.assertEqual(summary.ask, "Implement the change")
        self.assertEqual(
            summary.followups,
            ["This is too complicated; show me the simpler option"],
        )

    def test_scan_filters_by_activity_not_session_start(self):
        cutoff = dt.datetime(2026, 1, 2, tzinfo=dt.timezone.utc)
        summaries = recent_pi_sessions.scan_sessions(self.fixtures, cutoff)
        names = {summary.path.name for summary in summaries}
        self.assertIn("resumed.jsonl", names)

    def test_bounded_scan_requires_active_branch_activity_inside_window(self):
        cutoff = dt.datetime(2026, 1, 2, tzinfo=dt.timezone.utc)
        through = dt.datetime(2026, 1, 2, 23, 59, tzinfo=dt.timezone.utc)
        summaries = recent_pi_sessions.scan_sessions(self.fixtures, cutoff, through)
        names = {summary.path.name for summary in summaries}
        self.assertNotIn("resumed.jsonl", names)


if __name__ == "__main__":
    unittest.main()
