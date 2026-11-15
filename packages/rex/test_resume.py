"""Resume-in-place safety, independent of Rex's native layout restoration."""
import contextlib
import io
import tempfile
import unittest
from unittest.mock import patch

import workspace
from test_workspace import saved_workspace

CONVERSATION = "1c36885f-3c41-4b94-bdbf-e20e90b246b9"


class Client:
    def __init__(self, cwd):
        self.cwd, self.writes, self.prompt = cwd, [], "❯ "
        self.fail_write = False

    def call(self, method, **args):
        if method == "server.status":
            return {"host_id": "host", "instance_id": "new"}
        if method == "session.list":
            return {"sessions": [{"session_id": "session:old", "label": "repo"}]}
        if method == "session.view":
            return {"windows": [{"window_id": "window:old", "label": "main", "layers": [{
                "kind": "tiled", "layout": {"block_id": "block:old"}}]}]}
        if method == "com.superlogical.terminal.write":
            self.writes.append(args)
            if self.fail_write:
                raise RuntimeError("lost response")
            return {"bytes_written": len(args["args"]["data"].encode())}
        raise AssertionError("Unexpected operation, must not modify layout: " + method)

    def terminal(self, sid, bid, method):
        if method == "process":
            return {"foreground": {"pid": 123, "name": "zsh", "cwd": self.cwd}}
        if method == "modes":
            return {"screen": "normal"}
        if method == "format":
            return {"content": "previous output\n" + self.prompt}
        raise AssertionError(method)


class ResumeInPlace(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.cwd = temporary.name
        self.client = Client(self.cwd)
        self.snapshot = saved_workspace(self.cwd)
        self.snapshot["sessions"][0]["windows"][0]["panes"]["block:old"]["agent"] = {
            "kind": "codex", "session_id": CONVERSATION}
        for context in (
            patch.dict(workspace.os.environ, {"REX_WORKSPACE_STATE_DIR": self.cwd + "/state"}),
            patch.object(workspace.shutil, "which", return_value="/bin/codex"),
            patch.object(workspace, "live_registrations", side_effect=lambda *_: {
                ("codex", CONVERSATION): ("session:old", "block:old")} if self.client.writes else {}),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            context.__enter__()
            self.addCleanup(context.__exit__, None, None, None)

    def test_resume_writes_once_into_existing_pane_and_confirms_exact_conversation(self):
        journal, _ = workspace.restore(self.client, self.snapshot)
        self.assertEqual(journal["block:old"]["state"], "confirmed")
        self.assertEqual(len(self.client.writes), 1)
        write = self.client.writes[0]
        self.assertEqual((write["session_id"], write["block_id"]), ("session:old", "block:old"))
        self.assertIn("codex resume " + CONVERSATION, write["args"]["data"])
        workspace.restore(self.client, self.snapshot)
        self.assertEqual(len(self.client.writes), 1)

    def test_unconfirmed_write_is_never_replayed(self):
        self.client.fail_write = True
        # A transport failure can follow a successful write. Do not pretend the
        # conversation is registered, and never type the same command again.
        with patch.object(workspace, "live_registrations", return_value={}):
            with self.assertRaisesRegex(RuntimeError, "lost response"):
                workspace.restore(self.client, self.snapshot)
            with self.assertRaisesRegex(ValueError, "previous launch"):
                workspace.restore(self.client, self.snapshot)
        self.assertEqual(len(self.client.writes), 1)

    def test_duplicate_saved_conversation_is_rejected_before_writing(self):
        panes = self.snapshot["sessions"][0]["windows"][0]["panes"]
        panes["block:duplicate"] = dict(panes["block:old"])
        with self.assertRaisesRegex(ValueError, "same conversation"):
            workspace.restore(self.client, self.snapshot)
        self.assertEqual(self.client.writes, [])

    def test_legacy_session_needs_completed_journal_provenance(self):
        original = self.client.call
        def call(method, **args):
            if method == "session.list":
                return {"sessions": [{"session_id": "session:migrated", "label": "repo"}]}
            if method == "session.view":
                return {"windows": [{"window_id": "window:new", "label": "main", "layers": [{
                    "kind": "tiled", "layout": {"block_id": "block:new"}}]}]}
            return original(method, **args)
        journal = workspace.state_root() / "restores" / (self.snapshot["id"] + "-previous.json")
        workspace.atomic(journal, {"session:old": {"session_id": "session:migrated", "complete": False}})
        with patch.object(self.client, "call", side_effect=call):
            with self.assertRaisesRegex(ValueError, "no unique restored session"):
                workspace.plan(self.client, self.snapshot)
            workspace.atomic(journal, {"session:old": {"session_id": "session:migrated", "complete": True}})
            _, entries, _ = workspace.plan(self.client, self.snapshot)
        self.assertEqual((entries[0]["session_id"], entries[0]["block_id"]),
                         ("session:migrated", "block:new"))
        self.assertEqual(self.client.writes, [])

    def test_tracked_agent_can_be_resumed_again_after_a_confirmed_exit(self):
        self.snapshot["tracked"] = True
        journal, _ = workspace.restore(self.client, self.snapshot)
        self.assertEqual(next(iter(journal.values()))["state"], "confirmed")
        # Simulate a later intentional exit, back to the same empty shell.
        self.client.writes.clear()
        journal, _ = workspace.restore(self.client, self.snapshot)
        self.assertEqual(len(self.client.writes), 1)
        self.assertEqual(next(iter(journal.values()))["state"], "confirmed")

    def test_tracked_uncertain_launch_remains_blocked_when_other_tracking_changes(self):
        self.snapshot["tracked"] = True
        self.client.fail_write = True
        with patch.object(workspace, "live_registrations", return_value={}):
            with self.assertRaisesRegex(RuntimeError, "lost response"):
                workspace.restore(self.client, self.snapshot)
            # Tracking updates must not change the source ID or bypass a pane's
            # uncertain launch, even when another pane reports fresh metadata.
            self.snapshot["warnings"] = ["A closed tracked pane was skipped"]
            with self.assertRaisesRegex(ValueError, "previous launch"):
                workspace.restore(self.client, self.snapshot)
        self.assertEqual(len(self.client.writes), 1)

    def test_shell_draft_prevents_delivery(self):
        self.client.prompt = "❯ unfinished command"
        _, warnings = workspace.restore(self.client, self.snapshot)
        self.assertTrue(any("empty shell prompt" in warning for warning in warnings))
        self.assertEqual(self.client.writes, [])

    def test_busy_pane_does_not_prevent_safe_pane_resume(self):
        pane = self.snapshot["sessions"][0]["windows"][0]["panes"]["block:old"]
        entries = {bid: {"session_id": "session:old", "block_id": bid,
                         "pane": pane, "label": bid}
                   for bid in ("block:busy", "block:old")}
        terminal = self.client.terminal

        def inspect(sid, bid, method):
            if bid == "block:busy" and method == "process":
                return {"foreground": {"name": "login"}}
            return terminal(sid, bid, method)

        with patch.object(workspace, "targets", return_value=entries), \
                patch.object(self.client, "terminal", side_effect=inspect):
            journal, warnings = workspace.restore(self.client, self.snapshot)
        self.assertEqual(journal["block:old"]["state"], "confirmed")
        self.assertEqual([write["block_id"] for write in self.client.writes], ["block:old"])
        self.assertTrue(any("block:busy: target is not an idle shell" in w for w in warnings))

    def test_shell_becoming_busy_after_planning_is_skipped_without_journaling(self):
        with patch.object(workspace, "ready_shell", side_effect=[123, ValueError("target is not an idle shell")]):
            journal, warnings = workspace.restore(self.client, self.snapshot)
        self.assertEqual(journal, {})
        self.assertEqual(self.client.writes, [])
        self.assertTrue(any("target is not an idle shell" in w for w in warnings))

    def test_running_conversation_is_skipped_even_when_its_old_layout_changed(self):
        with patch.object(workspace, "live_registrations", return_value={
                ("codex", CONVERSATION): ("session:elsewhere", "block:elsewhere")}):
            _, entries, _ = workspace.plan(self.client, self.snapshot)
        self.assertEqual(entries[0]["state"], "running")
        self.assertEqual(self.client.writes, [])
