"""Durable pane-to-conversation tracking, without manual snapshots."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import workspace


class Client:
    def __init__(self, cwd):
        self.cwd = cwd
        self.server = {"host_id": "host", "instance_id": "before"}
        self.foreground = {"pid": 111, "name": "pi", "cwd": cwd}

    def call(self, method, **args):
        if method == "server.status":
            return self.server
        if method == "session.list":
            return {"sessions": [{"session_id": "session:one"}]}
        if method == "session.view":
            return {"label": "repo", "windows": [{"window_id": "window:one", "label": "main",
                "layers": [{"kind": "tiled", "layout": {"block_id": "block:one"},
                            "blocks": [{"block_id": "block:one"}]}]}]}
        raise AssertionError("Unexpected mutation: " + method)

    def terminal(self, sid, bid, method):
        if method == "process":
            return {"foreground": self.foreground}
        if method == "modes":
            return {"screen": "normal"}
        if method == "format":
            return {"content": "❯ "}
        raise AssertionError(method)


class Tracking(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.client = Client(str(self.root))
        for context in (
            patch.dict(os.environ, {"REX_WORKSPACE_STATE_DIR": str(self.root / "state"),
                                    "REX_SESSION": "session:one", "REX_BLOCK": "block:one"}),
            patch.object(workspace, "process_start", return_value="start"),
            patch.object(workspace.shutil, "which", return_value="/bin/pi"),
        ):
            context.__enter__()
            self.addCleanup(context.__exit__, None, None, None)

    def register(self, conversation="one", persisted=True):
        file = self.root / (conversation + ".jsonl")
        file.write_text(json.dumps({"type": "session", "id": conversation}) + "\n")
        workspace.register(self.client, "pi", {"pid": 111, "session_id": conversation,
            "file": str(file) if persisted else None, "cwd": str(self.root)})

    def records(self):
        return workspace.read(workspace.state_root() / "tracked.json")["hosts"]["host"]

    def test_latest_conversation_survives_shutdown_and_server_restart_without_save(self):
        self.register("one")
        self.register("two")
        workspace.register(self.client, "pi", {"pid": 111}, remove=True)
        self.assertEqual(self.records()["block:one"]["agent"]["session_id"], "two")
        self.assertNotIn("pid", self.records()["block:one"])
        self.client.server["instance_id"] = "after"
        self.client.foreground = {"pid": 222, "name": "zsh", "cwd": str(self.root)}
        source = workspace.tracked_snapshot(self.client)
        _, entries, _ = workspace.plan(self.client, source)
        self.assertEqual([(e["block_id"], e["agent"]["session_id"], e["state"]) for e in entries],
                         [("block:one", "two", "resume")])
        self.assertFalse((workspace.state_root() / "latest.json").exists())

    def test_unpersisted_replacement_clears_previous_conversation(self):
        self.register("one")
        self.register("not-saved", persisted=False)
        self.assertEqual(self.records(), {})

    def test_conversation_follows_its_last_verified_pane_and_can_be_forgotten(self):
        self.register()
        with patch.dict(os.environ, {"REX_BLOCK": "block:two"}):
            self.register()
        self.assertEqual(set(self.records()), {"block:two"})
        workspace.forget_agent(self.client, "block:two")
        self.assertEqual(self.records(), {})

    def test_rejected_registration_does_not_replace_durable_mapping(self):
        self.register("one")
        self.client.foreground = {"pid": 222, "name": "zsh", "cwd": str(self.root)}
        with self.assertRaisesRegex(ValueError, "foreground"):
            self.register("wrong")
        self.assertEqual(self.records()["block:one"]["agent"]["session_id"], "one")

    def test_verified_running_agents_can_be_backfilled_without_restarting(self):
        self.register()
        (workspace.state_root() / "tracked.json").unlink()
        self.assertEqual(workspace.track_running(self.client), 1)
        self.assertEqual(self.records()["block:one"]["agent"]["session_id"], "one")

    def test_tracking_for_another_host_is_not_used(self):
        self.register()
        self.client.server["host_id"] = "another-host"
        with self.assertRaisesRegex(ValueError, "No tracked agents"):
            workspace.tracked_snapshot(self.client)
