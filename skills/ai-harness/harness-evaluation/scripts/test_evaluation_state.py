#!/usr/bin/env python3

import argparse
import shutil
import tempfile
import unittest
from pathlib import Path

import evaluation_state


class EvaluationStateTest(unittest.TestCase):
    fixtures = Path(__file__).parent / "fixtures"

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_root = Path(self.temp_dir.name)
        self.connection = evaluation_state.connect(self.state_root)

    def tearDown(self):
        self.connection.close()
        self.temp_dir.cleanup()

    def test_run_scan_cursor_and_snapshot_deduplication(self):
        first = evaluation_state.begin_run(
            self.connection, hours=100000, overlap_hours=1
        )
        scan = evaluation_state.scan_run(
            self.connection,
            first["run_id"],
            self.fixtures / "codex",
            self.fixtures / "pi",
        )
        self.assertEqual(scan["runtimes"]["codex"]["unseen"], 1)
        self.assertEqual(scan["runtimes"]["pi"]["unseen"], 6)
        evaluation_state.finish_run(self.connection, first["run_id"], "complete")

        second = evaluation_state.begin_run(
            self.connection, hours=24, overlap_hours=100000
        )
        repeated = evaluation_state.scan_run(
            self.connection,
            second["run_id"],
            self.fixtures / "codex",
            self.fixtures / "pi",
        )
        self.assertGreater(repeated["runtimes"]["codex"]["matched"], 0)
        self.assertGreater(repeated["runtimes"]["pi"]["matched"], 0)
        self.assertEqual(repeated["runtimes"]["codex"]["unseen"], 0)
        self.assertEqual(repeated["runtimes"]["pi"]["unseen"], 0)

    def test_run_scan_is_frozen_after_first_result(self):
        runtime_root = self.state_root / "runtime"
        shutil.copytree(self.fixtures, runtime_root)
        run = evaluation_state.begin_run(
            self.connection, hours=100000, overlap_hours=1
        )

        first = evaluation_state.scan_run(
            self.connection,
            run["run_id"],
            runtime_root / "codex",
            runtime_root / "pi",
        )
        shutil.copy(
            runtime_root / "pi" / "skill-injection.jsonl",
            runtime_root / "pi" / "added-after-scan.jsonl",
        )
        repeated = evaluation_state.scan_run(
            self.connection,
            run["run_id"],
            runtime_root / "codex",
            runtime_root / "pi",
        )

        self.assertEqual(repeated, first)

    def test_run_scan_excludes_activity_after_scan_through(self):
        runtime_root = self.state_root / "runtime"
        shutil.copytree(self.fixtures, runtime_root)
        future = runtime_root / "pi" / "future.jsonl"
        future.write_text(
            (runtime_root / "pi" / "skill-injection.jsonl")
            .read_text()
            .replace("2026-01", "2999-01")
        )
        run = evaluation_state.begin_run(
            self.connection, hours=10000000, overlap_hours=1
        )

        scan = evaluation_state.scan_run(
            self.connection,
            run["run_id"],
            runtime_root / "codex",
            runtime_root / "pi",
        )

        paths = {item["path"] for item in scan["runtimes"]["pi"]["sessions"]}
        self.assertNotIn(str(future), paths)

    def test_failed_initial_run_preserves_its_earlier_scan_window(self):
        first = evaluation_state.begin_run(
            self.connection, hours=72, overlap_hours=1
        )
        evaluation_state.fail_run(self.connection, first["run_id"], "interrupted")
        second = evaluation_state.begin_run(
            self.connection, hours=24, overlap_hours=1
        )
        self.assertEqual(second["codex_since"], first["codex_since"])
        self.assertEqual(second["pi_since"], first["pi_since"])

    def test_finding_lifecycle_and_evidence_carry_forward(self):
        args = argparse.Namespace(
            key="request-review:invalid-command",
            skill="request-review",
            scope="personal",
            kind="objective-fix",
            status="auto-fix-awaiting-review",
            title="Fix invalid command",
            summary="The documented command is unsupported.",
            repository="toolkit",
            evidence=["session one"],
            run_id=None,
        )
        evaluation_state.record_finding(self.connection, args)
        args.evidence = ["session one", "session two"]
        evaluation_state.record_finding(self.connection, args)

        finding = evaluation_state.require_finding(
            self.connection, "request-review:invalid-command"
        )
        self.assertEqual(finding["occurrences"], 2)
        self.assertEqual(
            evaluation_state.finding_dict(finding)["evidence"],
            ["session one", "session two"],
        )

        evaluation_state.attach_change(
            self.connection,
            argparse.Namespace(
                key=args.key,
                worktree="/tmp/worktree",
                branch="fix-command",
                commit="abc123",
                validation="tests passed",
            ),
        )
        evaluation_state.review_result(
            self.connection,
            argparse.Namespace(
                key=args.key,
                result="passed",
                note="Independent review passed.",
            ),
        )
        pending = evaluation_state.pending_auto(self.connection)
        self.assertEqual(pending[0]["status"], "auto-fix-review-passed")

        evaluation_state.close_finding(
            self.connection,
            argparse.Namespace(key=args.key, status="resolved", note="merged"),
        )
        self.assertEqual(evaluation_state.pending_auto(self.connection), [])

    def test_human_decisions_and_review_cursor_persist(self):
        args = argparse.Namespace(
            key="go-development:scope",
            skill="go-development",
            scope="personal",
            kind="discussion",
            status="needs-discussion",
            title="Discuss scope guidance",
            summary="The desired policy is unclear.",
            repository="toolkit",
            evidence=[],
            run_id=None,
        )
        evaluation_state.record_finding(self.connection, args)
        evaluation_state.decide(
            self.connection,
            argparse.Namespace(key=args.key, decision="watch", note="Collect more use."),
        )
        finding = evaluation_state.require_finding(self.connection, args.key)
        self.assertEqual(finding["status"], "watching")

        evaluation_state.mark_human_review(self.connection, "Reviewed the queue.")
        self.assertIsNotNone(
            evaluation_state.get_meta(self.connection, "last_human_review")
        )
        carried = evaluation_state.list_findings(
            self.connection,
            include_resolved=True,
            since_last_human_review=True,
        )
        self.assertEqual([item["key"] for item in carried], [args.key])


if __name__ == "__main__":
    unittest.main()
