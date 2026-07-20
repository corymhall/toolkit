#!/usr/bin/env python3

import datetime as dt
import importlib.util
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    "recent_rollouts", SCRIPT_DIR / "recent_rollouts.py"
)
assert SPEC and SPEC.loader
recent_rollouts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(recent_rollouts)


class RecentRolloutsTest(unittest.TestCase):
    fixtures = SCRIPT_DIR / "fixtures" / "codex"

    def test_summary_includes_followups_skills_failures_and_recoveries(self):
        summary = recent_rollouts.summarize_rollout(self.fixtures / "basic.jsonl")
        self.assertEqual(summary["ask"], "Implement the change")
        self.assertEqual(summary["followups"], ["Please simplify this implementation"])
        self.assertEqual(summary["skills"], ["go-development"])
        self.assertEqual(len(summary["failures"]), 1)
        self.assertEqual(summary["recoveries"], ["Using a fallback after the retry"])

    def test_recent_rollout_selection_uses_latest_activity(self):
        cutoff = dt.datetime(2026, 1, 3, 9, 0, tzinfo=dt.timezone.utc)
        rollouts = list(recent_rollouts.iter_recent_rollouts(self.fixtures, cutoff))
        self.assertEqual([path.name for path, _, _, _ in rollouts], ["basic.jsonl"])
        _, started, activity, _ = rollouts[0]
        self.assertEqual(started.isoformat(), "2026-01-01T10:00:00+00:00")
        self.assertEqual(activity.isoformat(), "2026-01-03T10:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
