"""Real Pi follow-up scheduling against a loopback-only fake model endpoint."""
import importlib.util
import json
import os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import shutil
import threading
import time
import unittest
from unittest.mock import patch


@unittest.skipUnless(os.environ.get("REX_WORKSPACE_INTEGRATION") == "1", "opt-in isolated Pi input test")
class PiInput(unittest.TestCase):
    def test_native_followup_preserves_draft_and_rejects_wrong_conversation(self):
        from test_workspace import IsolatedRex
        root = Path(__file__).resolve().parent
        requests, started, release = [], threading.Event(), threading.Event()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                requests.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                number = len(requests)
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()

                def emit(delta, finish=None):
                    payload = {"id": "probe", "object": "chat.completion.chunk", "created": 1,
                               "model": "probe", "choices": [
                                   {"index": 0, "delta": delta, "finish_reason": finish}]}
                    self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
                    self.wfile.flush()

                emit({"role": "assistant", "content": "Holding local test response."})
                if number == 1:
                    started.set()
                    release.wait(40)
                emit({}, "stop")
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        fixture = IsolatedRex("test_native_layout_is_unchanged_by_agent_resume")
        try:
            fixture.setUp()
            agentdir = fixture.root / "queue-agent"
            (agentdir / "extensions").mkdir(parents=True)
            (agentdir / "extensions/rex-session.ts").symlink_to(
                root.parents[1] / "pi/agent/extensions/rex-session.ts")
            (agentdir / "settings.json").write_text(json.dumps({
                "defaultProvider": "queue-probe", "defaultModel": "probe", "packages": []}))
            (agentdir / "models.json").write_text(json.dumps({"providers": {"queue-probe": {
                "baseUrl": f"http://127.0.0.1:{server.server_port}/v1", "api": "openai-completions",
                "apiKey": "local-test-only", "models": [
                    {"id": "probe", "contextWindow": 128000, "maxTokens": 1000}]}}}))
            made = fixture.client.call("session.create", label="queue-probe", initial_windows=[{
                "layout": {"block": {"flavor": "com.superlogical.terminal.shell", "options": {
                    "cwd": str(fixture.root), "shell": "none", "command": [
                        "env", "PI_CODING_AGENT_DIR=" + str(agentdir), shutil.which("pi"),
                        "--offline", "--no-session", "--tui-mode", "fullscreen",
                        "--provider", "queue-probe", "--model", "probe"]}}}}])
            sid, bid = made["session_id"], made["initial_windows"][0]["block_ids"][0]

            def screen():
                return fixture.client.terminal(sid, bid, "format").get("content", "")

            def paste(text, suffix=""):
                fixture.client.call("com.superlogical.terminal.write", session_id=sid,
                    block_id=bid, args={"data": "\x1b[200~" + text + "\x1b[201~" + suffix})

            time.sleep(2)
            paste("INITIAL_PROBE", "\r")
            self.assertTrue(started.wait(15), "Initial local request did not start: " + screen())
            spec = importlib.util.spec_from_file_location("agent_message", root / "agent-message.py")
            composer = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(composer)
            with patch.dict(os.environ, {"REX_SERVER": fixture.socket}):
                endpoint = next(a for a in composer.agents() if a["block"] == bid)
            self.assertEqual(Path(endpoint["socket"]).stat().st_mode & 0o777, 0o600)
            paste("UNSENT_DRAFT")
            composer.deliver(endpoint, "FOLLOWUP_PROBE")
            time.sleep(.5)
            self.assertEqual(len(requests), 1, "Follow-up interrupted the current response")
            release.set()
            deadline = time.monotonic() + 12
            while len(requests) < 2 and time.monotonic() < deadline:
                time.sleep(.1)
            self.assertEqual(len(requests), 2, "Follow-up did not run automatically")
            self.assertIn("FOLLOWUP_PROBE", json.dumps(requests[1]["messages"]))
            self.assertNotIn("UNSENT_DRAFT", json.dumps(requests[1]["messages"]))
            self.assertIn("UNSENT_DRAFT", screen())
            with self.assertRaisesRegex(RuntimeError, "session changed"):
                composer.deliver({**endpoint, "session_id": "wrong-session"}, "DO_NOT_DELIVER")
        finally:
            release.set()
            server.shutdown()
            server.server_close()
            fixture.doCleanups()
