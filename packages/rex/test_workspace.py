"""Unit checks plus opt-in save/restart/restore against an isolated Rex server."""
import copy
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import workspace


def saved_workspace(cwd):
    return {"version": 1, "id": "a" * 32, "host_id": "host", "source_instance": "old",
            "warnings": [], "sessions": [{"id": "session:old", "label": "repo", "repo": None,
                "active": "window:old", "windows": [{"id": "window:old", "label": "main",
                    "layout": {"block_id": "block:old"}, "focused": "block:old", "zoomed": None,
                    "panes": {"block:old": {"cwd": cwd, "label": "terminal", "agent": None}}}]}]}


class WorkspaceSafety(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        context = patch.dict(os.environ, {"REX_WORKSPACE_STATE_DIR": str(self.root / "workspace"),
                                          "XDG_STATE_HOME": str(self.root / "state")})
        context.start()
        self.addCleanup(context.stop)

    def test_missing_pi_file_reopens_shell_without_new_conversation(self):
        pane = {"cwd": str(self.root), "agent": {"kind": "pi", "file": "/missing-session", "session_id": "id"}}
        warnings = []
        with patch.object(workspace.shutil, "which", return_value="/bin/pi"):
            command = workspace.resume_command(pane, warnings)
        self.assertIsNone(command)
        self.assertTrue(warnings)

    def test_resume_uses_exact_pi_file_and_never_a_prompt(self):
        file = self.root / "session.jsonl"
        file.write_text(json.dumps({"type": "session", "id": "known"}) + "\n")
        pane = {"cwd": str(self.root), "agent": {"kind": "pi", "file": str(file), "session_id": "known"},
                "command": ["rm", "-rf", "/"]}
        with patch.object(workspace.shutil, "which", return_value="/bin/pi"):
            resume = workspace.resume_command(pane, [])
        self.assertIn(str(file), resume)
        self.assertNotIn("rm", resume)
        pane["agent"]["session_id"] = "wrong"
        with patch.object(workspace.shutil, "which", return_value="/bin/pi"):
            with self.assertRaisesRegex(ValueError, "does not match"):
                workspace.resume_command(pane, [])

    def test_missing_directory_does_not_resume_agent_in_another_directory(self):
        warnings = []
        command = workspace.resume_command({"cwd": "/definitely-missing-rex-directory",
            "agent": {"kind": "pi", "session_id": "known"}}, warnings)
        self.assertIsNone(command)
        self.assertTrue(any("no longer exists" in warning for warning in warnings))

    def test_inherited_rex_environment_cannot_register_unrelated_agent(self):
        class Client:
            def call(self, method, **args):
                return {"instance_id": "test"}
            def terminal(self, *args):
                return {"foreground": {"pid": 111, "name": "pi"}}
        with patch.dict(os.environ, {"REX_SESSION": "session:test", "REX_BLOCK": "block:test"}):
            with self.assertRaisesRegex(ValueError, "foreground"):
                workspace.register(Client(), "pi", {"pid": 222, "session_id": "wrong", "file": None})
        self.assertFalse((workspace.state_root() / "agents.json").exists())

    def test_missing_native_session_is_not_recreated(self):
        class Client:
            def call(self, method, **args):
                if method == "server.status":
                    return {"host_id": "host", "instance_id": "new"}
                if method == "session.list":
                    return {"sessions": []}
                raise AssertionError("Must not create sessions")
        snapshot = saved_workspace(str(self.root))
        snapshot["sessions"][0]["windows"][0]["panes"]["block:old"]["agent"] = {
            "kind": "pi", "session_id": "known"}
        with self.assertRaisesRegex(ValueError, "Nothing will be recreated"):
            workspace.restore(Client(), snapshot)

    def test_codex_hook_records_only_resume_metadata(self):
        conversation = "1c36885f-3c41-4b94-bdbf-e20e90b246b9"
        class Client:
            def call(self, method, **args):
                return {"instance_id": "test"}
            def terminal(self, *args):
                return {"foreground": {"pid": 111, "name": "codex", "cwd": str(Path.cwd())}}
        with patch.dict(os.environ, {"REX_SESSION": "session:test", "REX_BLOCK": "block:test"}), \
             patch.object(workspace, "process_start", return_value="process-start"):
            workspace.register(Client(), "codex", {"session_id": conversation, "prompt": "not for storage",
                                                   "token": "not for storage"})
        record = workspace.read(workspace.state_root() / "agents.json")["test/block:test"]
        self.assertEqual(record["session_id"], conversation)
        self.assertNotIn("prompt", record)
        self.assertNotIn("token", record)
        with patch.object(workspace.shutil, "which", return_value="/bin/codex"):
            command = workspace.resume_command({"cwd": str(self.root), "agent": record}, [])
        self.assertEqual(command, ["/bin/codex", "resume", conversation])

    def test_server_address_is_required_and_never_autostarts(self):
        with patch.dict(os.environ, {"REX_SERVER": ""}):
            with self.assertRaisesRegex(ValueError, "explicit"):
                workspace.Client()
        with patch.object(workspace.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = "{}"
            workspace.Client("unix:///tmp/isolated.sock").call("server.status")
        self.assertIn("--autostart=false", run.call_args.args[0])
        self.assertIn("unix:///tmp/isolated.sock", run.call_args.args[0])


@unittest.skipUnless(os.environ.get("REX_WORKSPACE_INTEGRATION") == "1", "opt-in isolated Rex integration")
class IsolatedRex(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="rx-", dir="/tmp"))
        self.name = "rex-workspace-test-" + self.root.name
        self.socket = "unix://" + str(self.root / "server.sock")
        self.config = self.root / "init.lua"
        self.config.write_text("")
        agent_dir = self.root / "pi-agent"
        (agent_dir / "extensions").mkdir(parents=True)
        (agent_dir / "settings.json").write_text(json.dumps({"defaultProvider": "openai", "defaultModel": "gpt-4o-mini"}))
        (agent_dir / "extensions/rex-session.ts").symlink_to(workspace.Path(__file__).resolve().parents[2] / "pi/agent/extensions/rex-session.ts")
        # The restore planner runs in this Python process, not in the server.
        # Isolate its login-shell choice too, avoiding personal zsh/Atuin hooks.
        self.context = patch.dict(os.environ, {"REX_WORKSPACE_STATE_DIR": str(self.root / "workspace"),
                                               "XDG_STATE_HOME": str(self.root / "xdg"),
                                               "SHELL": "/bin/sh"})
        self.context.start()
        self.client = workspace.Client(self.socket)
        self.addCleanup(self.cleanup)
        self.start()

    def start(self):
        command = ["env", "-u", "REX_SERVER", "-u", "REX_SESSION", "-u", "REX_BLOCK", "-u", "REX_CLIENT",
                   "REX_SERVER=" + self.socket,
                   "REX_WORKSPACE_STATE_DIR=" + str(self.root / "workspace"),
                   "XDG_STATE_HOME=" + str(self.root / "xdg"), "SHELL=/bin/sh",
                   "PI_CODING_AGENT_DIR=" + str(self.root / "pi-agent"), "PI_OFFLINE=1",
                   "REX_WORKSPACE_HELPER=" + str(Path(workspace.__file__).with_name("agent-state.py")),
                   self.client.binary, "server", "run", "--listen", self.socket,
                   "--state-dir", str(self.root / "server"), "--config", str(self.config)]
        subprocess.run(["tmux", "new-session", "-d", "-s", self.name, "-x", "100", "-y", "30",
                        shlex.join(command)], check=True)
        for _ in range(60):
            try:
                self.client.call("server.status")
                return
            except (RuntimeError, subprocess.TimeoutExpired):
                time.sleep(.1)
        log = subprocess.run(["tmux", "capture-pane", "-pt", self.name], text=True, capture_output=True)
        self.fail("Isolated Rex failed to start: " + log.stdout + log.stderr)

    def stop(self):
        subprocess.run([self.client.binary, "--autostart=false", "--server", self.socket, "server", "stop"],
                       check=True, capture_output=True)
        for _ in range(50):
            if subprocess.run(["tmux", "has-session", "-t", self.name], capture_output=True).returncode:
                return
            time.sleep(.1)
        self.fail("Test server did not exit")

    def cleanup(self):
        # Only this unique tmux session and its isolated server are touched.
        if subprocess.run(["tmux", "has-session", "-t", self.name], capture_output=True).returncode == 0:
            subprocess.run(["tmux", "kill-session", "-t", self.name], check=True)
        self.context.stop()
        shutil.rmtree(self.root)

    def test_pi_registration_and_exact_conversation_resume_without_model_calls(self):
        binary = shutil.which("pi")
        self.assertIsNotNone(binary)
        conversation = "1c36885f-3c41-4b94-bdbf-e20e90b246b9"
        file = self.root / "conversation with spaces.jsonl"
        file.write_text(json.dumps({"type": "session", "version": 3, "id": conversation,
                                   "timestamp": "2026-10-20T00:00:00.000Z", "cwd": str(self.root)}) + "\n")
        created = self.client.call("session.create", label="agent-test", initial_windows=[{
            "window_label": "pi", "layout": {"block": {"flavor": "com.superlogical.terminal.shell",
                "options": {"cwd": str(self.root), "shell": "none",
                            "command": [binary, "--session", str(file), "--offline"]}}}}])
        def wait_registration(require_foreground=False):
            instance = self.client.call("server.status")["instance_id"]
            for _ in range(50):
                agents = workspace.read(workspace.state_root() / "agents.json", {})
                current = [item for key, item in agents.items() if key.startswith(instance + "/")]
                if current:
                    self.assertEqual(current[0]["session_id"], conversation)
                    self.assertEqual(current[0]["file"], str(file))
                    if require_foreground:
                        process = self.client.terminal(current[0]["rex_session"],
                            next(key.split("/", 1)[1] for key, item in agents.items() if item is current[0]), "process")
                        if (process.get("foreground") or {}).get("name") != "pi":
                            time.sleep(.2)
                            continue
                    return
                time.sleep(.2)
            sessions = self.client.call("session.list")["sessions"]
            for session in sessions:
                blocks = self.client.call("session.list_blocks", session_id=session["session_id"])["blocks"]
                for block in blocks:
                    print("PI TEST SCREEN", self.client.terminal(session["session_id"], block["block_id"], "format"))
                    proc = self.client.terminal(session["session_id"], block["block_id"], "process")
                    print("PI TEST PROCESS", proc)
                    for p in workspace.processes(proc):
                        children = subprocess.run(["pgrep", "-P", str(p["pid"])], text=True, capture_output=True).stdout.split()
                        for pid in [str(p["pid"]), *children]:
                            print("PS", subprocess.run(["ps", "-p", pid, "-o", "ppid=,pgid=,tpgid=,ucomm=,comm="], text=True, capture_output=True).stdout)
            self.fail("Pi did not register its persisted conversation")
        wait_registration()
        snapshot = workspace.tracked_snapshot(self.client)
        pane = next(iter(snapshot["sessions"][0]["windows"][0]["panes"].values()))
        self.assertEqual(pane["agent"]["session_id"], conversation)
        self.assertFalse((workspace.state_root() / "latest.json").exists())
        self.stop()
        self.start()
        snapshot = workspace.tracked_snapshot(self.client)
        # Server readiness does not imply its restored terminals have finished
        # shell startup. Resume deliberately refuses to type before the prompt.
        target = next(iter(workspace.targets(self.client, snapshot, {}).values()))
        deadline = time.monotonic() + 10
        while True:
            try:
                workspace.ready_shell(self.client, target)
                break
            except ValueError:
                if time.monotonic() >= deadline:
                    self.fail("Restored shell did not become ready: " + str(
                        self.client.terminal(target["session_id"], target["block_id"], "format")))
                time.sleep(.1)
        workspace.restore(self.client, snapshot)
        wait_registration(require_foreground=True)

    def test_picker_layer_cleanup_restores_either_origin_pane(self):
        layout = {"block": {"flavor": "com.superlogical.terminal.shell", "options": {
            "command": ["/bin/sleep", "60"], "shell": "none"}}}
        sid = self.client.call("session.create", label="popup-focus", initial_windows=[
            {"layout": layout}])["session_id"]
        window = self.client.call("session.view", session_id=sid)["windows"][0]
        first = window["focused_block_id"]
        second = self.client.call("session.new_split", session_id=sid, anchor_id=first,
            direction="horizontal", side="after", layout=layout)["block_ids"][0]
        # Exercise the real terminal process closing its own layer. Natural
        # process exit chose the last tiled pane regardless of origin in Rex.
        helper_root = str(Path(workspace.__file__).parent)
        code = (f"import sys,time; sys.path.insert(0, {helper_root!r}); import picker; "
                "time.sleep(1.2); picker.close_picker_popup()")
        for origin in (first, second):
            self.client.call("session.focus_block", session_id=sid, block_id=origin)
            self.client.call("session.new_layer", session_id=sid, window_id=window["window_id"],
                bounds=[.1, .1, .8, .8], focus=True, layout={"block": {
                    "flavor": "com.superlogical.terminal.shell", "options": {
                        "shell": "none", "command": ["env", "REX_PICKER_ORIGIN=" + sid,
                            "REX_PICKER_ORIGIN_WINDOW=" + window["window_id"],
                            sys.executable, "-c", code]}}})
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                current = self.client.call("session.view", session_id=sid)["windows"][0]
                if len(current["layers"]) == 1:
                    break
                time.sleep(.1)
            self.assertEqual(len(current["layers"]), 1, "picker layer did not close")
            self.assertEqual(current["focused_block_id"], origin)

    def test_native_layout_is_unchanged_by_agent_resume(self):
        def leaf(label):
            return {"block": {"flavor": "com.superlogical.terminal.shell", "label": label,
                "options": {"cwd": str(self.root), "shell": "none", "command": ["/bin/sh", "-c",
                    "printf '\\033]7;file://localhost%s\\007' \"$PWD\"; exec /bin/sleep 300"]}}}
        layout = {"split": {"direction": "horizontal", "ratio": .35,
                            "before": leaf("left"), "after": leaf("right")}}
        created = self.client.call("session.create", label="repo-test", initial_windows=[
            {"window_label": "main", "layout": layout}, {"window_label": "feature", "layout": leaf("feature")}])
        sid = created["session_id"]
        main = created["initial_windows"][0]
        self.client.call("session.focus_block", session_id=sid, block_id=main["block_ids"][1])
        self.client.call("session.zoom_block", session_id=sid, block_id=main["block_ids"][1], zoom=True)
        self.client.call("session.new_window", session_id=sid, window_label="Rex picker", layout=leaf("picker"), focus=False)
        time.sleep(1.5)
        try:
            snapshot = workspace.capture(self.client)
        except ValueError:
            for window in created["initial_windows"]:
                for bid in window["block_ids"]:
                    print("TEST PROCESS", self.client.terminal(sid, bid, "process"))
                    print("TEST SCREEN", self.client.terminal(sid, bid, "format"))
            raise
        self.assertEqual(len(snapshot["sessions"][0]["windows"]), 2)
        before = self.client.call("server.status")["instance_id"]
        self.stop()
        self.start()
        self.assertNotEqual(before, self.client.call("server.status")["instance_id"])
        # Rex now owns layout restoration and preserves IDs. Our helper must
        # leave that layout alone, including focus, zoom, and tab ordering.
        view = self.client.call("session.view", session_id=sid)
        self.assertEqual(view["label"], "repo-test")
        self.assertEqual([w["label"] for w in view["windows"]], ["main", "feature", "Rex picker"])
        before_resume = copy.deepcopy(view)
        workspace.restore(self.client, snapshot)
        after_resume = self.client.call("session.view", session_id=sid)
        self.assertEqual(after_resume, before_resume)
        self.assertEqual(len(self.client.call("session.list")["sessions"]), 1)
        mode = (workspace.state_root() / "snapshots" / (snapshot["id"] + ".json")).stat().st_mode & 0o777
        self.assertEqual(mode, 0o600)


if __name__ == "__main__":
    unittest.main()
