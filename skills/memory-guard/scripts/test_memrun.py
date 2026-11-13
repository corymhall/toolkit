#!/usr/bin/env python3
"""Regression checks for footprint enforcement and interrupted command cleanup."""
import importlib.machinery
import importlib.util
import json
import os
import signal
import subprocess
import time
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


loader = importlib.machinery.SourceFileLoader("memrun", str(Path(__file__).with_name("memrun")))
spec = importlib.util.spec_from_loader(loader.name, loader)
memrun = importlib.util.module_from_spec(spec)
loader.exec_module(memrun)


class MemoryGuardTests(unittest.TestCase):
    def test_compressed_footprint_outweighs_rss(self):
        processes = {
            10: {"pid": 10, "ppid": 1, "rss": 20, "command": "parent"},
            11: {"pid": 11, "ppid": 10, "rss": 5, "command": "compressed child"},
            12: {"pid": 12, "ppid": 1, "rss": 900, "command": "unrelated"},
        }
        with mock.patch.object(memrun, "read_processes", return_value=processes), \
                mock.patch.object(memrun, "physical_footprint", side_effect=lambda pid: {10: 15, 11: 100}[pid]):
            rss, memory, tree = memrun.snapshot(10)
        self.assertEqual(rss, 25)
        self.assertEqual(memory, 120)
        self.assertEqual(tree[0]["pid"], 11)
        self.assertEqual(tree[0]["physical_footprint"], 100)

    def test_rss_fallback(self):
        with mock.patch.object(memrun, "process_tree", return_value=[{"pid": 10, "rss": 20}]), \
                mock.patch.object(memrun, "physical_footprint", return_value=None):
            rss, memory, _tree = memrun.snapshot(10)
        self.assertEqual((rss, memory), (20, 20))

    def test_low_rss_does_not_bypass_footprint_limit(self):
        process = mock.Mock(pid=10)
        process.poll.return_value = None
        tree = [{"pid": 11, "rss": 5, "physical_footprint": 100, "memory": 100}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guard.jsonl"
            with mock.patch.object(memrun, "snapshot", return_value=(5, 100, tree)), \
                    mock.patch.object(memrun, "terminate_process_group") as terminate, \
                    mock.patch.object(memrun, "capture_sample") as sample:
                result = memrun.monitor(process, limit=80, sample_at=60, interval=0.1,
                                        log_dir=Path(directory), log_file=path, label="test")
            self.assertEqual(result, 137)
            terminate.assert_called_once_with(10)
            process.wait.assert_called_once()
            sample.assert_not_called()  # Never delay a required kill for a sample.
            events = [json.loads(line) for line in path.read_text().splitlines()]
            kill = next(event for event in events if event["event"] == "kill")
            self.assertEqual(kill["total_rss"], 5)
            self.assertEqual(kill["total_memory"], 100)

    def test_interrupt_cleans_up_children_and_records_outcome(self):
        process = mock.Mock(pid=10)
        process.poll.return_value = None
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guard.jsonl"
            with mock.patch.object(memrun, "snapshot", side_effect=KeyboardInterrupt), \
                    mock.patch.object(memrun, "terminate_process_group") as terminate:
                result = memrun.monitor(process, limit=80, sample_at=60, interval=0.1,
                                        log_dir=Path(directory), log_file=path, label="test")
            self.assertEqual(result, 130)
            terminate.assert_called_once_with(10)
            process.wait.assert_called_once()
            event = json.loads(path.read_text())
            self.assertEqual(event["event"], "interrupt")

    def test_signal_during_sample_is_not_swallowed(self):
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.object(memrun.subprocess, "run", side_effect=memrun.CommandInterrupted(15)):
                with self.assertRaises(memrun.CommandInterrupted):
                    memrun.capture_sample(10, Path(directory), Path(directory) / "guard.jsonl", "test")

    def test_summary_reports_footprint_and_incomplete_logs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guard.jsonl"
            events = [
                {"event": "start", "memory_metric": "max(rss,physical_footprint)"},
                {"event": "rss", "total_rss": 5, "total_memory": 100,
                 "processes": [{"pid": 11, "rss": 5, "physical_footprint": 100,
                                "memory": 100, "command": "compressed child"}]},
            ]
            path.write_text("".join(json.dumps(event) + "\n" for event in events))
            output = subprocess.check_output(
                [sys.executable, str(Path(__file__).with_name("summarize_memrun_log.py")), str(path)],
                text=True,
            )
            self.assertIn("outcome: incomplete", output)
            self.assertIn("peak_memory: 100 B", output)
            self.assertIn("largest_physical_footprint: 100 B", output)
            self.assertIn("largest_command: compressed child", output)

    def test_group_escalation_does_not_depend_on_a_live_leader_or_successful_probe(self):
        for probe_denied in (False, True):
            def kill_group(_pid, signum):
                if signum == 0 and probe_denied:
                    raise PermissionError

            with self.subTest(probe_denied=probe_denied), \
                    mock.patch.object(memrun.os, "kill", side_effect=ProcessLookupError), \
                    mock.patch.object(memrun.os, "killpg", side_effect=kill_group) as killpg, \
                    mock.patch.object(memrun.time, "time", side_effect=[0, 0, 6]), \
                    mock.patch.object(memrun.time, "sleep"):
                memrun.terminate_process_group(10)
                self.assertIn(mock.call(10, signal.SIGKILL), killpg.call_args_list)

    def test_summary_preserves_rss_peak_from_interrupt(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guard.jsonl"
            path.write_text(json.dumps({"event": "interrupt", "peak_rss": 50,
                                        "peak_memory": 100, "signal": 15}) + "\n")
            output = subprocess.check_output(
                [sys.executable, str(Path(__file__).with_name("summarize_memrun_log.py")), str(path)],
                text=True,
            )
            self.assertIn("outcome: interrupted", output)
            self.assertIn("peak_rss: 50 B", output)

    def test_repeated_interrupts_finish_cleanup_of_term_resistant_children(self):
        with tempfile.TemporaryDirectory() as directory:
            ready = Path(directory) / "ready"
            # The command's leader exits on TERM, but its child requires KILL.
            child_code = (
                "import os,signal,time,pathlib; "
                "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
                f"path=pathlib.Path({str(ready)!r}); "
                "path.with_suffix('.tmp').write_text(str(os.getppid())+' '+str(os.getpid())); "
                "path.with_suffix('.tmp').rename(path); time.sleep(60)"
            )
            command_code = (
                "import subprocess,sys; "
                f"child=subprocess.Popen([sys.executable,'-c',{child_code!r}]); "
                "child.wait()"
            )
            guard = subprocess.Popen(
                [sys.executable, str(Path(__file__).with_name("memrun")),
                 "--log-dir", directory, "--rss-limit", "1g", "--sample-at", "2g",
                 "--interval", "0.1", "--", sys.executable, "-c", command_code],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
            )
            group = None
            try:
                deadline = time.monotonic() + 10
                while not ready.exists() and time.monotonic() < deadline and guard.poll() is None:
                    time.sleep(0.02)
                self.assertTrue(ready.exists(), "child failed to start")
                group, child = map(int, ready.read_text().split())
                guard.send_signal(signal.SIGTERM)
                time.sleep(0.1)
                guard.send_signal(signal.SIGTERM)
                _, stderr = guard.communicate(timeout=12)
                self.assertEqual(guard.returncode, 143, stderr)
                status = subprocess.run(
                    ["/bin/ps", "-o", "stat=", "-p", str(child)],
                    capture_output=True, text=True, check=False,
                ).stdout.strip()
                self.assertTrue(not status or status.startswith("Z"), status)
                events = [json.loads(line) for path in Path(directory).glob("*.jsonl")
                          for line in path.read_text().splitlines()]
                self.assertEqual(events[-1]["event"], "interrupt")
            finally:
                if group is not None:
                    try:
                        os.killpg(group, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                if guard.poll() is None:
                    guard.kill()
                guard.communicate()

    @unittest.skipUnless(sys.platform == "darwin", "macOS accounting API")
    def test_native_footprint_is_available_for_own_process(self):
        self.assertIsNotNone(memrun._proc_pid_rusage)
        self.assertGreater(memrun.physical_footprint(os.getpid()), 0)


if __name__ == "__main__":
    unittest.main()
