"""Real Git/Worktrunk, synthetic Herdr. These tests never contact a live app."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("picker", Path(__file__).parents[1] / "scripts/picker.py")
picker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(picker)


class PickerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="toolkit-picker-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.home = self.root / "app"
        self.state = self.home / "data/toolkit-picker"
        self.home.mkdir()
        for name, value in (("HOME", self.home), ("STATE", self.state)):
            patcher = patch.object(picker, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.repo = self.root / "repo"
        subprocess.run(["git", "init", "-b", "main", str(self.repo)], check=True, capture_output=True)
        self.git("config", "user.name", "Picker Test")
        self.git("config", "user.email", "picker@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        (self.repo / "file").write_text("initial\n")
        self.git("add", ".")
        self.git("commit", "-m", "initial")
        self.checkout = self.root / "feature"
        self.git("worktree", "add", "-b", "feature", str(self.checkout))
        self.layout = {"spaces": [{"id": "space", "machine": None, "tabs": []}]}
        self.terminals = {}
        self.effects = []
        self.fail_open = False
        self.fail_close = None
        self.wt_config = self.root / "wt.toml"
        self.wt_config.write_text('worktree-path = "../{{ repo }}.{{ branch | sanitize }}"\n')
        self.real_run = picker.run
        patcher = patch.object(picker, "run", side_effect=self.fake_run)
        patcher.start()
        self.addCleanup(patcher.stop)

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *map(str, args)], check=True, text=True, capture_output=True).stdout

    def add_tab(self, ident, cwd, owned=None):
        self.layout["spaces"][0]["tabs"].append({"id": ident, "name": ident, "terminals": [{"terminal": ident, "sub_agents": []}]})
        self.terminals[ident] = {"cwd": str(self.root), "foreground": {"cwd": str(cwd)}, "state": "live"}
        if owned:
            picker.remember(ident, str(owned))

    def fake_run(self, *args, **kwargs):
        if args[:2] == ("herdr-app", "ls"):
            return json.dumps(self.layout)
        if args[:2] == ("hc", "get"):
            return json.dumps(self.terminals[args[2]])
        if args[:2] == ("hc", "ls"):
            return json.dumps({"terminals": [{"address": a} for a, t in self.terminals.items() if t["state"] == "live"]})
        if args[:2] == ("hc", "kill"):
            self.effects.append(("kill", args[2]))
            self.terminals[args[2]]["state"] = "finished"
            return '{}'
        if args[:2] == ("herdr-app", "do"):
            name, data = args[2], json.loads(args[3])
            self.effects.append((name, data))
            if name == "tab.close":
                if data["id"] == self.fail_close:
                    raise RuntimeError("Synthetic close failure")
                self.layout["spaces"][0]["tabs"] = [t for t in self.layout["spaces"][0]["tabs"] if t["id"] != data["id"]]
                self.terminals[data["id"]]["state"] = "finished"
                return '{}'
            if self.fail_open:
                raise RuntimeError("Synthetic layout failure")
            self.add_tab("created", data["folder"])
            return '{"tab":"created","space":"space"}'
        if args[0] == "wt":
            return self.real_run("wt", "--config", str(self.wt_config), *args[1:], **kwargs)
        return self.real_run(*args, **kwargs)

    def test_discovery_deduplicates_roots_and_reads_linked_head(self):
        cfg = {"roots": [str(self.root), str(self.root)], "scratch_roots": []}
        with patch.object(picker, "config", return_value=cfg):
            rows = picker.projects()
        self.assertEqual({r["name"] for r in rows}, {"repo", "feature"})
        self.assertEqual(len(rows), 2)
        self.assertTrue(next(r for r in rows if r["name"] == "feature")["detail"].startswith("feature ·"))

    def test_open_uses_foreground_and_preserves_owned_folder_after_cd(self):
        self.add_tab("existing", self.checkout)
        target = picker.open_path(self.checkout)
        self.assertEqual(target["tab"], "existing")
        picker.remember("existing", str(self.checkout))
        self.terminals["existing"]["foreground"]["cwd"] = str(self.repo)
        target = picker.open_path(self.checkout)
        self.assertEqual(target["tab"], "existing")
        self.assertEqual(self.effects, [])

    def test_primary_origin_and_mixed_checkout_are_protected(self):
        with self.assertRaisesRegex(ValueError, "primary"):
            picker.removal_plan(self.repo, self.repo, "normal", "origin")
        self.add_tab("origin", self.checkout)
        with self.assertRaisesRegex(ValueError, "Switch away"):
            picker.removal_plan(self.repo, self.checkout, "normal", "origin")
        picker.remember("origin", str(self.checkout))
        self.terminals["origin"]["foreground"]["cwd"] = str(self.repo)
        with self.assertRaisesRegex(ValueError, "another checkout"):
            picker.removal_plan(self.repo, self.checkout, "force", "elsewhere")
        self.assertEqual(self.effects, [])

    def test_scope_change_before_confirmation_has_no_effects(self):
        self.add_tab("feature-tab", self.checkout)
        plan = picker.removal_plan(self.repo, self.checkout, "keep", "origin")
        self.add_tab("new-tab", self.checkout)
        with self.assertRaisesRegex(ValueError, "scope changed"):
            picker.remove(plan)
        self.assertEqual(self.effects, [])
        self.assertTrue(self.checkout.is_dir())

    def test_partial_close_failure_stops_before_worktree_removal(self):
        self.add_tab("first", self.checkout)
        self.add_tab("second", self.checkout)
        plan = picker.removal_plan(self.repo, self.checkout, "force", "origin")
        self.fail_close = "second"
        with self.assertRaisesRegex(RuntimeError, "Earlier tabs may already be closed"):
            picker.remove(plan)
        self.assertTrue(self.checkout.is_dir())
        self.assertEqual([t["id"] for t in self.layout["spaces"][0]["tabs"]], ["second"])

    @unittest.skipUnless(shutil.which("wt"), "Worktrunk required for lifecycle integration")
    def test_keep_removes_checkout_but_retains_branch(self):
        self.add_tab("feature-tab", self.checkout)
        plan = picker.removal_plan(self.repo, self.checkout, "keep", "origin")
        picker.remove(plan)
        self.assertFalse(self.checkout.exists())
        self.assertEqual(self.git("rev-parse", "feature"), self.git("rev-parse", "main"))
        self.assertEqual(self.layout["spaces"][0]["tabs"], [])

    @unittest.skipUnless(shutil.which("wt"), "Worktrunk required for lifecycle integration")
    def test_normal_removal_refuses_dirty_files_and_force_is_explicit(self):
        (self.checkout / "file").write_text("uncommitted\n")
        plan = picker.removal_plan(self.repo, self.checkout, "normal", "origin")
        with self.assertRaisesRegex(RuntimeError, "Removal stopped"):
            picker.remove(plan)
        self.assertEqual((self.checkout / "file").read_text(), "uncommitted\n")
        picker.remove(picker.removal_plan(self.repo, self.checkout, "force", "origin"))
        self.assertFalse(self.checkout.exists())
        check = subprocess.run(["git", "-C", str(self.repo), "show-ref", "--verify", "--quiet", "refs/heads/feature"])
        self.assertEqual(check.returncode, 1)

    @unittest.skipUnless(shutil.which("wt"), "Worktrunk required for lifecycle integration")
    def test_creation_uses_fresh_origin_default_without_updating_local_branch(self):
        origin = self.root / "origin.git"
        subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True, capture_output=True)
        self.git("remote", "add", "origin", str(origin))
        self.git("push", "-u", "origin", "main")
        initial = self.git("rev-parse", "main").strip()
        (self.repo / "file").write_text("remote advance\n")
        self.git("commit", "-am", "advance")
        advanced = self.git("rev-parse", "HEAD").strip()
        self.git("push", "origin", "main")
        self.git("reset", "--hard", initial)
        self.add_tab("primary", self.repo)
        result = picker.create(self.repo, "new-work")
        self.assertEqual(self.git("rev-parse", "new-work").strip(), advanced)
        self.assertEqual(self.git("rev-parse", "main").strip(), initial)
        self.assertEqual(self.effects[0][0], "tab.new")
        setup = json.loads(self.effects[0][1]["argv"][-1])
        self.assertEqual(setup, {"path": result["path"], "base": "origin/main"})

    @unittest.skipUnless(shutil.which("wt"), "Worktrunk required for lifecycle integration")
    def test_failed_open_preserves_created_checkout_and_never_retries(self):
        origin = self.root / "origin.git"
        subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True, capture_output=True)
        self.git("remote", "add", "origin", str(origin))
        self.git("push", "-u", "origin", "main")
        self.fail_open = True
        with self.assertRaisesRegex(RuntimeError, "Checkout preserved"):
            picker.create(self.repo, "preserved")
        found = next(w for w in picker.worktrees(self.repo) if w["branch"] == "preserved")
        self.assertTrue(Path(found["path"]).is_dir())
        self.assertEqual(len(self.effects), 1)

    def test_scratch_rejects_traversal_and_preserves_existing_directory(self):
        cfg = {"roots": [], "scratch_roots": [str(self.root)]}
        with patch.object(picker, "config", return_value=cfg):
            for name in ("../escape", "two/names", "..", ".hidden"):
                with self.assertRaises(ValueError):
                    picker.scratch(self.root, name)
            with self.assertRaises(FileExistsError):
                picker.scratch(self.root, "repo")
        self.assertTrue((self.repo / "file").exists())
        self.assertEqual(self.effects, [])

    def test_job_failure_is_retained_and_does_not_retry(self):
        ident = "a" * 32
        path = picker.job_path(ident)
        picker.atomic(path / "request.json", {"action": "open", "path": str(self.checkout)})
        self.fail_open = True
        picker.worker(ident)
        status = picker.dispatch("job", {"job": ident})
        self.assertEqual(status["state"], "failed")
        self.assertIn("Synthetic layout failure", status["error"])
        picker.dispatch("job", {"job": ident})
        picker.worker(ident)
        self.assertEqual(picker.dispatch("job", {"job": ident}), status)
        self.assertEqual(len(self.effects), 1)
        with self.assertRaises(ValueError):
            picker.job_path("../other")

    def test_reopening_prefers_the_default_main_over_auxiliary_tab_order(self):
        self.add_tab("aux", self.checkout)
        self.add_tab("main", self.checkout)
        picker.atomic(self.home / "shared.json", {"toolkit.workbench.v1": {"sessions": {
            "work": {"id": "work", "main": "main", "tabs": ["main", "aux"], "folder": str(self.checkout), "machine": None}
        }}})
        self.assertEqual(picker.open_path(self.checkout)["tab"], "main")
        self.assertEqual(self.effects, [])

    @unittest.skipUnless(shutil.which("wt"), "Worktrunk required for lifecycle integration")
    def test_unpaneled_children_close_deepest_first_and_other_roots_are_protected(self):
        self.add_tab("main-tab", self.checkout)
        self.add_tab("independent", self.repo)
        self.terminals["child"] = {"cwd": str(self.checkout), "parent": "main-tab", "state": "live"}
        self.terminals["grandchild"] = {"cwd": str(self.checkout), "parent": "child", "state": "live"}
        self.terminals["independent"]["parent"] = "main-tab"
        self.terminals["protected-child"] = {"cwd": str(self.repo), "parent": "independent", "state": "live"}
        plan = picker.removal_plan(self.repo, self.checkout, "keep", "origin")
        self.assertEqual(plan["tabs"][0]["unpaneled"], ["grandchild", "child"])
        picker.remove(plan)
        self.assertEqual([effect for effect in self.effects if effect[0] == "kill"], [("kill", "grandchild"), ("kill", "child")])
        self.assertEqual(self.terminals["independent"]["state"], "live")
        self.assertEqual(self.terminals["protected-child"]["state"], "live")

    def test_pre_start_failure_does_not_run_post_hooks_or_claim_ready(self):
        calls = []
        def hook(*args, **kwargs):
            calls.append(args)
            raise RuntimeError("failed pre-start")
        with patch.object(picker, "run", side_effect=hook), patch("builtins.input", return_value=""), patch.object(picker.os, "chdir"), patch.object(picker.os, "execv") as shell, patch("builtins.print") as output:
            picker.setup({"path": str(self.checkout), "base": "origin/main"})
        self.assertEqual(len(calls), 1)
        self.assertIn("pre-start", calls[0])
        shell.assert_called_once()
        self.assertFalse(any(call.args == ("Worktree ready.",) for call in output.call_args_list))


if __name__ == "__main__":
    unittest.main()
