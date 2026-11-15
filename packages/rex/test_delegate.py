"""Optional post-setup launch contract used by toolkit's /delegate command."""
import contextlib
import io
import json
import os
from pathlib import Path
import pty
import select
import signal
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import picker


class DelegateSetupTests(unittest.TestCase):
    def test_pi_starts_only_after_all_worktree_hooks_in_the_new_directory(self):
        command = ["/opt/pi", "--", "Read source session.\nFix the target."]
        calls = []
        with patch.object(picker, "run", side_effect=lambda *args, **kwargs: calls.append(args)), \
             patch.object(picker.os, "chdir", side_effect=lambda path: calls.append(("chdir", path))), \
             patch.object(picker, "launch_command", side_effect=lambda command: calls.append(("launch", command))), \
             contextlib.redirect_stdout(io.StringIO()):
            picker.main(["setup", "/new checkout", "origin/main", json.dumps(command)])
        self.assertEqual([call[4] for call in calls[:3]], ["pre-start", "post-start", "post-switch"])
        self.assertTrue(all("--foreground" in call for call in calls[:3]))
        self.assertEqual(calls[3], ("chdir", "/new checkout"))
        self.assertEqual(calls[4], ("launch", command))

    def test_failed_post_start_hook_never_starts_pi(self):
        with patch.object(picker, "run", side_effect=[None, RuntimeError("setup failed")]), \
             patch.object(picker, "launch_command") as launch, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, "setup failed"):
                picker.main(["setup", "/new", "origin/main", json.dumps(["/pi", "--", "task"])])
        launch.assert_not_called()

    def test_agent_is_the_foreground_process_group_leader_and_arguments_stay_literal(self):
        # Reproduce login's process group in a real PTY, without Rex or an agent.
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "probe.json"
            argument = "quotes ' \"; $(echo unsafe)\nsecond line"
            probe = (
                "import json,os,sys; from pathlib import Path; "
                "Path(sys.argv[1]).write_text(json.dumps("
                "[os.getpid(),os.getpgrp(),os.tcgetpgrp(0),sys.argv[2]]))"
            )
            pid, terminal = pty.fork()
            if pid == 0:
                try:
                    worker = os.fork()
                    if worker == 0:
                        os.environ.update(SHELL="/bin/zsh", HOME=directory, ZDOTDIR=directory)
                        picker.launch_command([sys.executable, "-c", probe, str(output), argument])
                        os._exit(99)
                    _, status = os.waitpid(worker, 0)
                    os._exit(os.waitstatus_to_exitcode(status))
                except BaseException:
                    os._exit(98)
            completed = False
            try:
                deadline = time.monotonic() + 15
                transcript = b""
                while time.monotonic() < deadline:
                    waited, status = os.waitpid(pid, os.WNOHANG)
                    if waited:
                        completed = True
                        self.assertEqual(os.waitstatus_to_exitcode(status), 0, transcript.decode(errors="replace"))
                        break
                    if select.select([terminal], [], [], 0.05)[0]:
                        try:
                            transcript += os.read(terminal, 65536)
                        except OSError:
                            pass
                self.assertTrue(completed, "foreground launch did not finish")
                agent_pid, process_group, foreground_group, actual = json.loads(output.read_text())
                self.assertEqual(agent_pid, process_group)
                self.assertEqual(agent_pid, foreground_group)
                self.assertEqual(actual, argument)
            finally:
                if not completed:
                    os.killpg(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                os.close(terminal)
