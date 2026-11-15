"""Safety and lifecycle regression checks. Run with python3 -B -m unittest discover -s config/rex."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import picker


def checkout_tab(session="session:one", window="window:feature", path="/feature"):
    return {"session_id": session, "window_id": window, "checkout": path,
            "checkouts": {path}, "repos": {"/repo/.git"}, "label": "repo"}


class WorktreeSafety(unittest.TestCase):
    def test_primary_checkout_cannot_be_removed_even_with_force(self):
        with patch.object(picker, "worktrees", return_value=[("/repo", "main")]), \
             patch.object(picker, "run") as run, patch("builtins.input") as prompt:
            with self.assertRaisesRegex(ValueError, "primary"):
                picker.remove_worktree("/repo/subdir", "/repo", "main", "force")
            prompt.assert_not_called()
            run.assert_not_called()

    def test_cancellation_does_not_close_sessions_or_remove_checkout(self):
        with patch.object(picker, "worktrees", return_value=[("/repo", "main"), ("/feature", "feature")]), \
             patch.object(picker, "matching", return_value=[checkout_tab()]), \
             patch.object(picker, "api") as api, patch.object(picker, "run") as run, \
             patch("builtins.input", return_value="no"), contextlib.redirect_stdout(io.StringIO()):
            picker.remove_worktree("/repo", "/feature", "feature", "force")
            api.assert_not_called()
            run.assert_not_called()

    def test_origin_checkout_tab_is_never_closed_by_removal(self):
        with patch.object(picker, "worktrees", return_value=[("/repo", "main"), ("/feature", "feature")]), \
             patch.object(picker, "matching", return_value=[checkout_tab()]), \
             patch.dict(os.environ, {"REX_PICKER_ORIGIN": "session:one",
                                     "REX_PICKER_ORIGIN_WINDOW": "window:feature"}), \
             patch.object(picker, "api") as api, patch.object(picker, "run") as run, \
             patch("builtins.input", return_value="yes"), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, "Switch away"):
                picker.remove_worktree("/repo", "/feature", "feature", "force")
            api.assert_not_called()
            run.assert_not_called()

    def test_failed_setup_does_not_run_post_hooks_or_start_shell(self):
        with patch.object(picker, "run", side_effect=RuntimeError("pre-start failed")) as run, \
             patch.object(picker.os, "execv") as shell, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, "pre-start failed"):
                picker.main(["setup", "/checkout", "origin/main"])
            self.assertEqual(run.call_count, 1)
            shell.assert_not_called()

    def test_creation_fetches_remote_default_before_worktrunk_and_preserves_failed_open(self):
        calls = []

        def execute(*args, **kwargs):
            calls.append(args)
            if "ls-remote" in args:
                return "ref: refs/heads/trunk\tHEAD\n123\tHEAD\n"
            if "switch" in args:
                return json.dumps({"path": "/new-checkout", "branch": "feature"})
            return ""

        with patch.object(picker, "run", side_effect=execute), \
             patch.object(picker.subprocess, "run") as check, \
             patch("builtins.input", return_value="feature"), \
             patch.object(picker, "open_path", side_effect=RuntimeError("focus failed")):
            check.return_value.returncode = 1
            with self.assertRaisesRegex(RuntimeError, "Checkout preserved"):
                picker.create_worktree("/repo")
        fetch = next(i for i, c in enumerate(calls) if "fetch" in c)
        pre = next(i for i, c in enumerate(calls) if "pre-switch" in c)
        create = next(i for i, c in enumerate(calls) if "switch" in c)
        self.assertLess(fetch, pre)
        self.assertLess(pre, create)
        self.assertIn("+refs/heads/trunk:refs/remotes/origin/trunk", calls[fetch])
        self.assertFalse(any("remove" in c or "session.destroy" in c for c in calls))

    def test_real_git_worktree_paths_with_spaces_round_trip(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary) / "repo with spaces"
            repo.mkdir()
            picker.git(repo, "init", "-q")
            picker.git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com",
                       "commit", "--allow-empty", "-qm", "initial")
            checkout = Path(temporary) / "linked checkout"
            picker.git(repo, "worktree", "add", "-qb", "feature", str(checkout))
            listed = picker.worktrees(repo)
            self.assertEqual([Path(p).resolve() for p, _ in listed], [repo.resolve(), checkout.resolve()])
            self.assertEqual(listed[1][1], "feature")
            self.assertEqual(picker.dec(picker.enc(checkout)), str(checkout))
            with patch.object(picker, "run", side_effect=AssertionError("branch lookup launched Git")):
                self.assertEqual(picker.branch_name(checkout), "feature")
                self.assertEqual(picker.branch_name(repo), listed[0][1])
            picker.git(checkout, "checkout", "--detach", "-q")
            self.assertEqual(picker.branch_name(checkout), "detached")


class WorktreeSource(unittest.TestCase):
    def setUp(self):
        context = patch.object(picker, "snapshot", side_effect=contextlib.nullcontext)
        context.start()
        self.addCleanup(context.stop)

    def test_listing_scans_rex_once_and_marks_registered_and_live_checkouts(self):
        listed = [("/repo", "main"), ("/feature", "feature"), ("/closed", "closed")]
        tabs = [{"checkout": "/repo", "checkouts": {"/feature"}}]
        with patch.dict(os.environ, {"REX_PROJECT_PATH": "/repo"}), \
             patch.object(picker, "worktrees", return_value=listed), \
             patch.object(picker, "registry", return_value=contextlib.nullcontext({})), \
             patch.object(picker, "inventory", return_value=tabs) as inventory, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            picker.main(["worktrees"])
        rows = [line.split("\t") for line in output.getvalue().splitlines()]
        self.assertEqual([(r[0], r[2]) for r in rows], [("main", "open"), ("feature", "open"), ("closed", "")])
        self.assertEqual(inventory.call_count, 1)

    def test_inventory_reuses_git_discovery_for_panes_in_the_same_directory(self):
        view = {"windows": [{"window_id": "window:main", "layers": [{"blocks": [
            {"block_id": "block:one"}, {"block_id": "block:two"}]}]}]}
        with patch.object(picker, "sessions", return_value=[{"session_id": "session:repo"}]), \
             patch.object(picker, "api", return_value=view), \
             patch.object(picker, "directory", return_value="/repo/src"), \
             patch.object(picker, "checkout_identity", return_value=("/repo/.git", "/repo")) as identity:
            tabs = picker.inventory({})
        self.assertEqual(tabs[0]["checkout"], "/repo")
        self.assertEqual(identity.call_count, 1)


class TabPicker(unittest.TestCase):
    def setUp(self):
        context = patch.object(picker, "snapshot", side_effect=contextlib.nullcontext)
        context.start()
        self.addCleanup(context.stop)
        self.windows = [
            {"window_id": "window:main", "label": "main", "layers": [
                {"blocks": [{"block_id": "block:main"}]}]},
            {"window_id": "window:feature", "label": "feature", "layers": [
                {"blocks": [{"block_id": "block:feature"}]}]},
            {"window_id": "window:picker", "label": "picker", "layers": [
                {"blocks": [{"block_id": "block:picker"}]}]},
        ]
        self.view = {"label": "repo", "windows": self.windows, "active_window_id": "window:main"}

    def block(self, sid, bid, method):
        if method == "program_status":
            return {"records": [{"state": "done" if bid == "block:main" else "working"}]}
        if method == "format":
            return {"content": "SCREEN " + bid}
        self.fail("Unexpected method " + method)

    def rows(self):
        with patch.object(picker, "sessions", return_value=[{"session_id": "session:repo", "label": "repo"}]), \
             patch.object(picker, "api", return_value=self.view), \
             patch.object(picker, "block", side_effect=self.block), \
             patch.object(picker, "directory", return_value=""), \
             patch.dict(os.environ, {"REX_PICKER_BLOCK": "block:picker",
                                     "REX_PICKER_ORIGIN": "session:repo",
                                     "REX_PICKER_ORIGIN_WINDOW": "window:feature"}), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            picker.main(["sessions"])
        return [line.split("\t") for line in output.getvalue().splitlines()]

    def test_rows_expose_each_tab_with_independent_status_and_exclude_picker(self):
        rows = self.rows()
        self.assertEqual(len(rows), 2)
        self.assertEqual([(r[1], r[2], r[6]) for r in rows],
                         [("repo / main", "done", "window:main"),
                          ("repo / feature", "working", "window:feature")])
        self.assertFalse(rows[0][0].startswith("•"))
        self.assertTrue(rows[1][0].startswith("•"))

    def test_restored_default_label_uses_folder_and_preserves_explicit_names(self):
        window = {"window_id": "window:new-12345678", "label": "Window efa618e9",
                  "focused_block_id": "block:main"}
        details = [(window, {"block_id": "block:main"}, "working")]
        with patch.object(picker, "directory", return_value="/work/example"), \
             patch.object(picker, "block") as block:
            self.assertEqual(picker.tab_label("session:repo", window, details), "example")
            window["label"] = "awsx-next/deployment-strat"
            self.assertEqual(picker.tab_label("session:repo", window, details), "awsx-next/deployment-strat")
            block.assert_not_called()

    def test_preview_uses_selected_tab_not_sessions_active_tab(self):
        with patch.object(picker, "api", return_value=self.view), \
             patch.object(picker, "block", side_effect=self.block), \
             patch.object(picker, "directory", return_value=""), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            picker.main(["session-preview", "session:repo", "window:feature"])
        self.assertIn("repo / feature [working]", output.getvalue())
        self.assertIn("SCREEN block:feature", output.getvalue())
        self.assertNotIn("SCREEN block:main", output.getvalue())

    def test_cable_selection_passes_both_session_and_tab_ids(self):
        row = self.rows()[1]
        cable = picker.tomllib.loads((picker.ROOT / "cables/rex-sessions.toml").read_text())
        command = cable["actions"]["workspace"]["command"]
        for index, value in enumerate(row):
            command = command.replace("{split:\\t:" + str(index) + "}", value)
        args = picker.shlex.split(command)[2:]
        with patch.object(picker, "select") as select:
            picker.main(args)
        select.assert_called_once_with("session:repo", "window:feature")


class Snapshot(unittest.TestCase):
    def test_read_queries_share_one_process_and_cache_is_cleared_on_failure(self):
        data = {"sessions": [{"session_id": "s", "label": "repo"}],
                "views": {"s": {"windows": []}},
                "blocks": {"s": {"b": {"process": {"foreground": {"cwd": "/repo"}},
                                          "program_status": {"records": [{"state": "working"}]}}}}}
        with patch.object(picker, "run", return_value=json.dumps(data)) as run:
            with self.assertRaisesRegex(ValueError, "render failed"):
                with picker.snapshot():
                    self.assertEqual(picker.sessions(), data["sessions"])
                    self.assertEqual(picker.api("session.view", session_id="s"), {"windows": []})
                    self.assertEqual(picker.directory("s", {"block_id": "b"}), "/repo")
                    self.assertEqual(picker.block("s", "b", "program_status")["records"][0]["state"], "working")
                    self.assertEqual(run.call_count, 1)
                    raise ValueError("render failed")
            self.assertIsNone(picker._SNAPSHOT)
            picker.sessions()
            self.assertEqual(run.call_count, 2)


class PickerNavigation(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        context = patch.dict(os.environ, {"XDG_STATE_HOME": temporary.name,
            "REX_CLIENT": "client:one", "REX_PICKER_ORIGIN": "session:a",
            "REX_PICKER_ORIGIN_WINDOW": "window:a"})
        context.start()
        self.addCleanup(context.stop)

    def test_cross_session_selection_records_origin_not_picker_and_is_per_client(self):
        with patch.object(picker, "run"):
            picker.select("session:b", "window:b")
        self.assertEqual(picker.previous_tab("client:one"),
                         {"session_id": "session:a", "window_id": "window:a"})
        self.assertIsNone(picker.previous_tab("client:two"))

    def test_reselecting_origin_session_keeps_history_and_avoids_picker_window(self):
        picker.remember_tab("client:one", "session:previous", "window:previous")
        with patch.object(picker, "run") as run, patch.object(picker, "api") as api:
            picker.select("session:a")
        api.assert_not_called()
        self.assertIn("window_id=window:a", run.call_args.args)
        self.assertEqual(picker.previous_tab("client:one")["session_id"], "session:previous")

    def test_failed_selection_does_not_overwrite_previous_tab(self):
        picker.remember_tab("client:one", "session:previous", "window:previous")
        with patch.object(picker, "run", side_effect=RuntimeError("Remote Control disabled")):
            with self.assertRaises(RuntimeError):
                picker.select("session:b", "window:b")
        self.assertEqual(picker.previous_tab("client:one")["session_id"], "session:previous")

    def test_popup_cleanup_closes_only_its_own_floating_layer(self):
        view = {"windows": [{"window_id": "window:a", "layers": [
            {"kind": "tiled", "layer_id": "tiled", "blocks": [{"block_id": "shell"}]},
            {"kind": "floating", "layer_id": "other", "blocks": [{"block_id": "other"}]},
            {"kind": "floating", "layer_id": "picker", "blocks": [{"block_id": "popup"}]},
        ]}]}
        with patch.dict(os.environ, {"REX_BLOCK": "popup"}), \
             patch.object(picker, "api", return_value=view) as api, \
             patch.object(picker, "dispatch"):
            picker.main(["picker", "rex-sessions"])
            self.assertEqual([c.args[0] for c in api.call_args_list],
                             ["session.view", "session.close_layer"])
            api.assert_called_with("session.close_layer", session_id="session:a", layer_id="picker")
        with patch.dict(os.environ, {"REX_BLOCK": "shell"}), \
             patch.object(picker, "api", return_value=view) as api:
            picker.close_picker_popup()
            self.assertEqual([c.args[0] for c in api.call_args_list], ["session.view"])

    def test_popup_remembers_invoking_pane_before_taking_focus(self):
        script = r'''
local actions = {}
local remembered = "block:other"
rex = {
  action = function(a) actions[a.name] = a.run end,
  session = {
    focus_block = function(args)
      remembered = args.block_id
      return { revision = 1 }
    end,
    view = function()
      return { active_window_id = "window:one", windows = {} }
    end,
    new_layer = function(args)
      assert(remembered == "block:origin", "popup lost the invoking pane")
      assert(args.focus == true and args.window_id == "window:one")
      return { layer_id = "layer:popup" }
    end,
  },
  layout = { block = function(args) return args end },
}
dofile(arg[1])
remembered = "block:other"
actions.repository_picker({ session_id = "session:one", client_id = "client:one", block_id = "block:origin" })
assert(remembered == "block:origin")
'''
        result = subprocess.run(["lua", "-", str(picker.ROOT / "actions.lua")],
                                input=script, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_native_picker_receives_origin_and_last_tab_errors_are_not_retried(self):
        script = r'''
local actions, calls = {}, {}
local outcome = { ok = true, stderr = "" }
local function check(argv, options)
  assert(argv[1]:match("rex%-picker$"))
  assert(argv[2] == "--client" and argv[3] == "client:one")
  assert(argv[4] == "--origin" and argv[5] == "session:one")
  assert(argv[6] == "--origin-window" and argv[7] == "window:origin")
  assert(argv[8] == "--origin-pane" and argv[9] == "block:origin")
  assert(options.env.REX_PICKER_REX:match("/rex$"))
end
rex = {
  action = function(a) actions[a.name] = a.run end,
  exec = setmetatable({ start = function(argv, options)
    check(argv, options)
    assert(options.detach == true and #argv == 9)
    calls[#calls + 1] = "start"
    return { pid = 1 }
  end }, { __call = function(_, argv, options)
    check(argv, options)
    assert(argv[10] == "--previous" and options.timeout == 120)
    calls[#calls + 1] = "previous"
    return outcome
  end }),
  session = { view = function()
    return { active_window_id = "window:other", windows = {
      { window_id = "window:origin", layers = {
        { blocks = { { block_id = "block:origin" } } }
      } }
    } }
  end },
}
dofile(arg[1])
local context = { client_id = "client:one", session_id = "session:one", block_id = "block:origin" }
actions.session_picker(context)
actions.last_tab(context)
assert(#calls == 2)
outcome = { timed_out = true }
local ok, err = pcall(actions.last_tab, context)
assert(not ok and err:match("outcome is unknown"))
assert(#calls == 3, "uncertain navigation must not be retried")
outcome = { ok = false, stderr = "native failure" }
ok, err = pcall(actions.last_tab, context)
assert(not ok and err:match("native failure") and #calls == 4)
'''
        result = subprocess.run(["lua", "-", str(picker.ROOT / "actions.lua")],
                                input=script, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class RepositoryTabs(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo with spaces"
        self.repo.mkdir()
        picker.git(self.repo, "init", "-q")
        picker.git(self.repo, "-c", "user.name=Test", "-c", "user.email=test@example.com",
                   "commit", "--allow-empty", "-qm", "initial")
        self.checkout = self.root / "feature checkout"
        picker.git(self.repo, "worktree", "add", "-qb", "feature", str(self.checkout))
        self.live = {}
        self.calls = []
        self.next_window = 0
        self.enter(patch.dict(os.environ, {"XDG_STATE_HOME": str(self.root / "state")}))
        self.enter(patch.object(picker, "api", side_effect=self.api))
        self.select = self.enter(patch.object(picker, "select"))
        self.enter(patch.object(picker.time, "sleep"))

    def enter(self, context):
        value = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)
        return value

    def new_window(self, session, label, layout):
        self.next_window += 1
        wid = f"window:{self.next_window}"
        window = {"window_id": wid, "label": label, "cwd": layout["block"]["options"]["cwd"],
                  "layers": [{"blocks": [{"block_id": wid}]}]}
        session["windows"].append(window)
        return window

    def api(self, method, **args):
        self.calls.append((method, args))
        if method == "session.list":
            return {"sessions": [{"session_id": sid, "label": s["label"]} for sid, s in self.live.items()]}
        if method == "session.create":
            sid = f"session:{len(self.live) + 1}"
            session = {"label": args["label"], "windows": []}
            self.live[sid] = session
            initial = args["initial_windows"][0]
            window = self.new_window(session, initial["window_label"], initial["layout"])
            return {"session_id": sid, "initial_windows": [{"window_id": window["window_id"]}]}
        if method == "session.new_window":
            window = self.new_window(self.live[args["session_id"]], args["window_label"], args["layout"])
            return {"window_id": window["window_id"]}
        if method == "session.view":
            return self.live[args["session_id"]]
        if method == "com.superlogical.terminal.process":
            window = next(w for w in self.live[args["session_id"]]["windows"] if w["window_id"] == args["block_id"])
            return {"foreground": {"cwd": window["cwd"]}}
        self.fail("Unexpected API call: " + method)

    def test_linked_checkout_uses_repo_session_and_reopening_reuses_tab_after_cd(self):
        picker.open_path(self.repo, "repo")
        picker.open_path(self.checkout, "feature")
        self.assertEqual(len(self.live), 1)
        session = self.live["session:1"]
        self.assertEqual(session["label"], self.repo.name)
        self.assertEqual(len(session["windows"]), 2)
        self.assertEqual(session["windows"][1]["label"], "feature")
        session["windows"][1]["cwd"] = str(self.root)
        picker.open_path(self.checkout, "feature")
        self.assertEqual(len(session["windows"]), 2)
        self.select.assert_called_with("session:1", "window:2")

    def test_same_named_independent_repository_gets_its_own_session(self):
        picker.open_path(self.repo, "repo")
        other = self.root / "other" / self.repo.name
        other.mkdir(parents=True)
        picker.git(other, "init", "-q")
        picker.git(other, "-c", "user.name=Test", "-c", "user.email=test@example.com",
                   "commit", "--allow-empty", "-qm", "initial")
        picker.open_path(other, "repo")
        self.assertEqual(len(self.live), 2)
        self.assertEqual([len(s["windows"]) for s in self.live.values()], [1, 1])

    def test_worktree_opened_first_still_names_session_after_repo(self):
        picker.open_path(self.checkout, "feature")
        self.assertEqual(self.live["session:1"]["label"], self.repo.name)
        picker.open_path(self.repo, "repo")
        self.assertEqual(len(self.live), 1)
        self.assertEqual(len(self.live["session:1"]["windows"]), 2)

    def test_removal_closes_only_checkout_tab_even_within_originating_repo_session(self):
        target = checkout_tab()
        with patch.object(picker, "worktrees", return_value=[("/repo", "main"), ("/feature", "feature")]), \
             patch.object(picker, "matching", return_value=[target]), \
             patch.object(picker, "api", return_value={"windows": []}) as api, \
             patch.object(picker, "run") as run, patch("builtins.input", return_value="yes"), \
             patch.dict(os.environ, {"REX_PICKER_ORIGIN": "session:one",
                                     "REX_PICKER_ORIGIN_WINDOW": "window:main"}), \
             contextlib.redirect_stdout(io.StringIO()):
            picker.remove_worktree("/repo", "/feature", "feature", "keep")
        self.assertEqual([call.args[0] for call in api.call_args_list], ["session.view", "session.close_window"])
        api.assert_called_with("session.close_window", session_id="session:one", window_id="window:feature")
        self.assertIn("--no-delete-branch", run.call_args.args)

    def test_mixed_checkout_tab_cannot_be_removed(self):
        target = checkout_tab()
        target["checkouts"].add("/other-checkout")
        with patch.object(picker, "worktrees", return_value=[("/repo", "main"), ("/feature", "feature")]), \
             patch.object(picker, "matching", return_value=[target]), \
             patch.object(picker, "api") as api, patch("builtins.input", return_value="yes"), \
             contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(ValueError, "another checkout"):
                picker.remove_worktree("/repo", "/feature", "feature", "force")
            api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
