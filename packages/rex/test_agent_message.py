"""Message transport contracts across a real local socket, without agent calls."""
import importlib.util
import json
import os
import fcntl
import pty
import select
import struct
import subprocess
import sys
import termios
import time
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("agent_message", Path(__file__).with_name("agent-message.py"))
composer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(composer)


class AgentMessages(unittest.TestCase):
    def test_unicode_multiline_delivery_and_rejection_without_retry(self):
        with tempfile.TemporaryDirectory(prefix="rx-input-", dir="/tmp") as root:
            path = str(Path(root) / "input.sock")
            received = []
            with socket.socket(socket.AF_UNIX) as server:
                server.bind(path)
                server.listen()
                def serve():
                    for response in ({"ok": True}, {"ok": False, "error": "Agent session changed"}):
                        client, _ = server.accept()
                        with client, client.makefile("rb") as reader:
                            received.append(json.loads(reader.readline()))
                            client.sendall((json.dumps(response) + "\n").encode())
                worker = threading.Thread(target=serve, daemon=True)
                worker.start()
                target = {"socket": path, "session_id": "conversation"}
                composer.deliver(target, "First line\nFix the π picker")
                with self.assertRaisesRegex(RuntimeError, "session changed"):
                    composer.deliver({**target, "session_id": "old-conversation"}, "Do not deliver")
                worker.join(2)
                self.assertFalse(worker.is_alive())
            self.assertEqual(received, [
                {"session_id": "conversation", "text": "First line\nFix the π picker"},
                {"session_id": "old-conversation", "text": "Do not deliver"}])

    def test_popup_pastes_multiline_unicode_and_submits_only_on_enter(self):
        with tempfile.TemporaryDirectory(prefix="rx-ui-", dir="/tmp") as root, \
             socket.socket(socket.AF_UNIX) as server:
            path = str(Path(root) / "input.sock")
            server.bind(path)
            server.listen()
            server.settimeout(8)
            received = []
            def serve():
                client, _ = server.accept()
                with client, client.makefile("rb") as reader:
                    received.append(json.loads(reader.readline()))
                    client.sendall(b'{"ok":true}\n')
            worker = threading.Thread(target=serve, daemon=True)
            worker.start()
            (Path(root) / "agent.json").write_text(json.dumps({
                "socket": path, "server": "test-ui", "pid": os.getpid(),
                "session_id": "test-conversation", "cwd": "/test/project"}))
            master, slave = pty.openpty()
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 120, 0, 0))
            env = {**os.environ, "TERM": "xterm-256color", "REX_AGENT_INPUT_DIR": root,
                   "REX_SERVER": "test-ui", "REX_PICKER_ORIGIN": ""}
            process = subprocess.Popen([sys.executable, "-B", str(Path(composer.__file__))],
                stdin=slave, stdout=slave, stderr=slave, env=env)
            os.close(slave)
            transcript = b""
            def wait_for(marker):
                nonlocal transcript
                deadline = time.monotonic() + 8
                while marker not in transcript and time.monotonic() < deadline:
                    if select.select([master], [], [], .1)[0]:
                        transcript += os.read(master, 65536)
                self.assertIn(marker, transcript)
            try:
                wait_for(b"Queue a message to Pi")
                os.write(master, b"\r")
                wait_for(b"Existing drafts stay untouched")
                os.write(master, "\x1b[200~First line\nFix π picker\x1b[201~".encode())
                wait_for("Fix π picker".encode())
                self.assertEqual(received, [], "Paste submitted before Enter")
                os.write(master, b"\r")
                deadline = time.monotonic() + 8
                while process.poll() is None and time.monotonic() < deadline:
                    if select.select([master], [], [], .1)[0]:
                        try:
                            transcript += os.read(master, 65536)
                        except OSError:
                            break
                self.assertEqual(process.poll(), 0, transcript.decode(errors="replace"))
                worker.join(2)
                self.assertEqual(received, [{"session_id": "test-conversation",
                    "text": "First line\nFix π picker"}])
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                os.close(master)

    def test_discovery_filters_other_servers_and_orders_favorites(self):
        with tempfile.TemporaryDirectory(prefix="rx-input-", dir="/tmp") as root, \
             socket.socket(socket.AF_UNIX) as server:
            socket_path = str(Path(root) / "input.sock")
            server.bind(socket_path)
            metadata = {"socket": socket_path, "server": "local", "pid": os.getpid()}
            (Path(root) / "agent-message.toml").write_text(
                '[[favorites]]\nname = "Favorite"\ncwd = "/favorite"\n')
            for name, cwd, host in (("other", "/other/project", "local"),
                                    ("favorite", "/favorite", "local"),
                                    ("foreign", "/foreign", "different-server")):
                (Path(root) / (name + ".json")).write_text(json.dumps(
                    {**metadata, "session_id": name, "cwd": cwd, "server": host}))
            (Path(root) / "stale.json").write_text("invalid metadata")
            with patch.dict(os.environ, {"REX_SERVER": "local", "REX_AGENT_INPUT_DIR": root}), \
                 patch.object(composer, "ROOT", Path(root)):
                found = composer.agents()
            self.assertEqual([(a["name"], a["session_id"]) for a in found],
                             [("Favorite", "favorite"), ("project", "other")])


if __name__ == "__main__":
    unittest.main()
