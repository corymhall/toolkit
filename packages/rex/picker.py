#!/usr/bin/env python3
"""Television channels and Worktrunk lifecycle for the local Rex server."""
import base64
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
import tomllib

ROOT = Path(__file__).resolve().parent
RANK = {"done": 0, "error": 0, "blocked": 1, "working": 2, "idle": 3, "unknown": 4}
_SNAPSHOT = None


@contextmanager
def snapshot():
    """Reuse one live Lua snapshot for a source refresh, never for mutations."""
    global _SNAPSHOT
    previous = _SNAPSHOT
    _SNAPSHOT = json.loads(run("rex", "do", str(ROOT / "picker-snapshot.lua"), "--json"))
    try:
        yield
    finally:
        _SNAPSHOT = previous


def run(*args, capture=True, cwd=None):
    result = subprocess.run(list(map(str, args)), cwd=cwd, text=True,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None)
    if result.returncode:
        raise RuntimeError(f"{shlex.join(list(map(str, args)))}: {result.stderr or result.returncode}")
    return result.stdout if capture else None


def api(method, **args):
    if _SNAPSHOT is not None:
        if method == "session.list":
            return {"sessions": _SNAPSHOT["sessions"]}
        if method == "session.view" and args["session_id"] in _SNAPSHOT["views"]:
            return _SNAPSHOT["views"][args["session_id"]]
        prefix = "com.superlogical.terminal."
        if method.startswith(prefix):
            values = _SNAPSHOT["blocks"].get(args["session_id"], {}).get(args["block_id"], {})
            if method[len(prefix):] in values:
                return values[method[len(prefix):]]
    return json.loads(run("rex", "api", "call", method, json.dumps(args)))


def block(session, ident, method):
    return api("com.superlogical.terminal." + method, session_id=session,
               block_id=ident, args={})


def enc(value):
    return base64.b64encode(str(value).encode()).decode()


def dec(value):
    return base64.b64decode(value, validate=True).decode()


def clean(value):
    return re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", str(value))


def screen(value):
    # Keep line breaks and tabs, strip terminal escapes and other controls.
    return re.sub(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]", "", str(value))


def row(*values):
    print("\t".join(clean(v) for v in values))


def sessions():
    return api("session.list").get("sessions", [])


def panes(view):
    for window in view.get("windows") or []:
        for layer in window.get("layers") or []:
            for pane in layer.get("blocks") or []:
                yield window, pane


def remember_tab(client, session, window):
    with registry("navigation") as history:
        history[client] = {"session_id": session, "window_id": window}


def previous_tab(client):
    with registry("navigation") as history:
        return history.get(client)


def select(session, window=None):
    origin = os.environ.get("REX_PICKER_ORIGIN")
    origin_window = os.environ.get("REX_PICKER_ORIGIN_WINDOW")
    client = os.environ.get("REX_CLIENT")
    if window is None:
        # Preserve the originating tab even if server focus changed while picking.
        window = origin_window if session == origin and origin_window else api("session.view", session_id=session).get("active_window_id")
    args = ["session_id=" + session]
    if window:
        args.append("window_id=" + window)
    run("rex", "do", "session.select", *args, capture=False)
    if client and origin and origin_window and window and (origin, origin_window) != (session, window):
        remember_tab(client, origin, origin_window)


def directory(session, pane):
    process = block(session, pane["block_id"], "process")
    for candidate in [process.get("foreground"), process.get("child"), *(process.get("ancestors") or [])]:
        if candidate and candidate.get("cwd"):
            return candidate["cwd"]
    return block(session, pane["block_id"], "pwd").get("pwd", "")


@contextmanager
def registry(name="registry"):
    # Stable tab ownership and navigation survive reloads and concurrent pickers.
    root = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "rex/picker"
    root.mkdir(parents=True, exist_ok=True)
    with (root / (name + ".lock")).open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        file = root / (name + ".json")
        state = json.loads(file.read_text()) if file.exists() else {}
        try:
            yield state
        finally:
            temporary = root / (name + ".json.tmp")
            temporary.write_text(json.dumps(state, indent=2) + "\n")
            temporary.replace(file)


def checkout_identity(path):
    common, checkout = git(path, "rev-parse", "--path-format=absolute",
                           "--git-common-dir", "--show-toplevel").splitlines()
    return str(Path(common).resolve()), str(Path(checkout).resolve())


def git_identity(path):
    """Return shared repository identity, primary checkout, and this checkout."""
    common, checkout = checkout_identity(path)
    primary = Path(worktrees(path)[0][0]).resolve()
    return common, primary, checkout


def inventory(state):
    live = sessions()
    live_ids = {s["session_id"] for s in live}
    for sid in list(state):
        if sid not in live_ids:
            del state[sid]
    tabs = []
    identities = {}
    for session in live:
        sid = session["session_id"]
        view = api("session.view", session_id=sid)
        known = state.get(sid, {}).get("windows", {})
        windows = view.get("windows") or []
        for wid in list(known):
            if not any(w["window_id"] == wid for w in windows):
                del known[wid]
        for window in windows:
            wid = window["window_id"]
            paths, repos, checkouts = set(), set(), set()
            for candidate_window, pane in panes(view):
                if candidate_window["window_id"] != wid or pane["block_id"] == os.environ.get("REX_PICKER_BLOCK"):
                    continue
                pwd = directory(sid, pane)
                if not pwd:
                    continue
                paths.add(str(Path(pwd).resolve()))
                if pwd not in identities:
                    try:
                        identities[pwd] = checkout_identity(pwd)
                    except RuntimeError:
                        identities[pwd] = None
                if identities[pwd] is not None:
                    identity, checkout = identities[pwd]
                    repos.add(identity)
                    checkouts.add(checkout)
            inferred = checkouts if checkouts else paths
            checkout = known.get(wid) or (next(iter(inferred)) if len(inferred) == 1 else None)
            tabs.append({"session_id": sid, "window_id": wid, "checkout": checkout,
                         "repos": repos, "checkouts": checkouts, "label": session.get("label", "")})
    return tabs


def matching(path):
    path = str(Path(path).resolve())
    with registry() as state:
        return [tab for tab in inventory(state) if tab["checkout"] == path or path in tab["checkouts"]]


def open_path(path, label, setup=None, repository=True):
    path = Path(path).resolve(strict=True)
    identity, primary, _ = git_identity(path) if repository else (None, path, str(path))
    if identity:
        label = git(path, "branch", "--show-current").strip() or path.name
    options = {"cwd": str(path)}
    if setup:
        options.update(command=["env", "PATH=" + os.environ["PATH"], sys.executable,
                                str(ROOT / "picker.py"), "setup", *setup],
                       shell="none", exit={"on_completion": False})
    layout = {"block": {"flavor": "com.superlogical.terminal.shell", "options": options}}
    with registry() as state:
        tabs = inventory(state)
        existing = [tab for tab in tabs if tab["checkout"] == str(path)]
        if existing:
            if setup:
                raise RuntimeError("A tab already exists for this checkout. Inspect its setup before retrying.")
            sid, wid = existing[0]["session_id"], existing[0]["window_id"]
            group = [tab for tab in tabs if tab["session_id"] == sid]
            repos = set().union(*(tab["repos"] for tab in group))
            if sid in state or (identity and existing[0]["label"] == primary.name and repos == {identity}):
                item = state.setdefault(sid, {"repo": identity, "windows": {}})
                item["windows"][wid] = str(path)
        else:
            # Adopt only unambiguous repo-named sessions, never arbitrary mixed workspaces.
            candidates = []
            if identity:
                live_ids = {tab["session_id"] for tab in tabs}
                candidates = [sid for sid, item in state.items() if item.get("repo") == identity and sid in live_ids]
                if not candidates:
                    for sid in dict.fromkeys(tab["session_id"] for tab in tabs):
                        group = [tab for tab in tabs if tab["session_id"] == sid]
                        repos = set().union(*(tab["repos"] for tab in group))
                        if group[0]["label"] == primary.name and repos == {identity}:
                            candidates.append(sid)
            if len(candidates) > 1:
                raise RuntimeError("Multiple repository sessions found. Resolve duplicate sessions before opening another checkout.")
            if candidates:
                sid = candidates[0]
                window = api("session.new_window", session_id=sid, window_label=label,
                             focus=False, layout=layout)
                wid = window["window_id"]
            else:
                created = api("session.create", label=primary.name if identity else label,
                              initial_windows=[{"window_label": label, "layout": layout}])
                sid = created["session_id"]
                wid = created["initial_windows"][0]["window_id"]
            item = state.setdefault(sid, {"repo": identity, "windows": {}})
            item["repo"] = identity
            item["windows"][wid] = str(path)
    # Let the app learn about new tabs before selecting one. Never retry setup.
    time.sleep(0.2)
    select(sid, wid)


def tv(channel, **env):
    args = ["tv", "--cable-dir", str(ROOT / "cables"), "--no-remote", "--show-preview"]
    result = subprocess.run([*args, channel],
                            env={**os.environ, "REX_PICKER_ROOT": str(ROOT), **env})
    if result.returncode not in (0, 130):
        raise RuntimeError(f"Television exited with {result.returncode}")


def config():
    with (ROOT / "picker.toml").open("rb") as file:
        return tomllib.load(file)


def git(path, *args):
    return run("git", "-C", path, *args)


def branch_name(path):
    """Read HEAD without spawning Git, including linked worktree gitdir files."""
    directory = Path(path) / ".git"
    if directory.is_file():
        marker = directory.read_text().strip()
        if not marker.startswith("gitdir: "):
            raise ValueError(f"Invalid Git directory file: {directory}")
        directory = Path(path) / marker.removeprefix("gitdir: ")
    head = (directory / "HEAD").read_text().strip()
    return head.removeprefix("ref: refs/heads/") if head.startswith("ref: refs/heads/") else "detached"


def worktrees(repo):
    records = []
    for entry in git(repo, "worktree", "list", "--porcelain", "-z").split("\0\0"):
        fields = dict(line.split(" ", 1) if " " in line else (line, "")
                      for line in entry.split("\0") if line)
        if "worktree" in fields:
            records.append((fields["worktree"], fields.get("branch", "").removeprefix("refs/heads/")))
    return records


def launch_command(command):
    # Keep an interactive shell waiting for the job. Direct exec inherits login's
    # process group, so Rex sees login rather than the agent as the foreground app.
    shell = os.environ.get("SHELL", "/bin/sh")
    os.execv(shell, [shell, "-i", "-l", "-c", '"$@"; exit $?', "rex-delegate", *command])


def create_worktree(repo, command=None, branch=None):
    branch = (input("Branch name: ") if branch is None else branch).strip()
    if not branch:
        raise ValueError("Branch name is required")
    git(repo, "check-ref-format", "--branch", branch)
    check = subprocess.run(["git", "-C", repo, "show-ref", "--verify", "--quiet", "refs/heads/" + branch])
    if check.returncode != 1:
        raise ValueError("Branch exists or Git could not check it")
    remote = git(repo, "ls-remote", "--symref", "origin", "HEAD")
    match = re.search(r"^ref: refs/heads/(.+)\s+HEAD$", remote, re.M)
    if not match:
        raise ValueError("Origin HEAD does not identify a default branch")
    default = match[1]
    git(repo, "fetch", "--no-tags", "origin", f"+refs/heads/{default}:refs/remotes/origin/{default}")
    base = "origin/" + default
    run("wt", "-C", repo, "hook", "pre-switch", "--foreground", "--branch=" + branch,
        "--base=" + base, capture=False)
    created = json.loads(run("wt", "-C", repo, "switch", "--create", branch, "--base", base,
                             "--no-hooks", "--no-cd", "--format=json"))
    if not created.get("path") or created.get("branch") != branch:
        raise RuntimeError("Worktree may have been created. Inspect wt list before retrying.")
    path = created["path"]
    try:
        setup = [path, base]
        if command is not None:
            setup.append(json.dumps(command))
        open_path(path, branch, setup)
    except Exception as error:
        raise RuntimeError(f"Checkout preserved at {path}. Inspect Rex and run setup manually if needed: {error}") from error


def remove_worktree(repo, path, target, mode):
    if mode not in ("normal", "keep", "force"):
        raise ValueError("Invalid removal mode")
    listed = worktrees(repo)
    if not listed or Path(path).resolve() == Path(listed[0][0]).resolve():
        raise ValueError("The primary checkout cannot be removed")
    if not any(Path(p).resolve() == Path(path).resolve() for p, _ in listed):
        raise ValueError("Selected checkout is no longer registered")
    attached = matching(path)
    print(f"Remove {path} with mode {mode}?")
    if attached:
        print("This also closes checkout tabs: " + ", ".join(tab["window_id"] for tab in attached))
    if input("Type yes to proceed: ").strip() != "yes":
        return
    refreshed = matching(path)
    if {(t["session_id"], t["window_id"]) for t in refreshed} != {(t["session_id"], t["window_id"]) for t in attached}:
        raise ValueError("Checkout tabs changed during confirmation. Reopen the picker and try again.")
    # A checkout tab may have acquired panes working in another checkout.
    for tab in refreshed:
        if tab["checkouts"] - {str(Path(path).resolve())}:
            raise ValueError("A matching tab contains another checkout. Move those panes before removing it.")
        if (tab["session_id"] == os.environ.get("REX_PICKER_ORIGIN")
                and tab["window_id"] == os.environ.get("REX_PICKER_ORIGIN_WINDOW")):
            raise ValueError("Switch away from this checkout tab before removing it")
        if any(pane["block_id"] in {os.environ.get("REX_BLOCK"), os.environ.get("REX_PICKER_BLOCK")}
               for window, pane in panes(api("session.view", session_id=tab["session_id"]))
               if window["window_id"] == tab["window_id"]):
            raise ValueError("Cannot close the tab running this picker")
    for tab in attached:
        api("session.close_window", session_id=tab["session_id"], window_id=tab["window_id"])
    flags = {"normal": [], "keep": ["--no-delete-branch"], "force": ["--force", "--force-delete"]}[mode]
    try:
        run("wt", "-C", repo, "remove", "--foreground", *flags, "--", path, capture=False)
    except RuntimeError as error:
        raise RuntimeError(f"Removal failed. Any listed checkout tabs were closed; reopen {path} from the repository picker. {error}") from error


def status_info(session, window_id=None):
    sid = session["session_id"]
    view = api("session.view", session_id=sid)
    details = []
    for window, pane in panes(view):
        if window_id and window["window_id"] != window_id:
            continue
        if pane["block_id"] == os.environ.get("REX_PICKER_BLOCK"):
            continue
        records = block(sid, pane["block_id"], "program_status").get("records", [])
        state = min((r.get("state", "unknown") for r in records), key=lambda s: RANK.get(s, 4), default="unknown")
        details.append((window, pane, state))
    state = min((d[2] for d in details), key=lambda s: RANK.get(s, 4), default="unknown")
    return view, details, state


def tab_label(session, window, details):
    wid = window["window_id"]
    label = window.get("label", "")
    # Restored default labels retain the old window ID's suffix.
    if label and not re.fullmatch(r"Window [0-9a-fA-F]{8}", label):
        return label
    candidates = [d for d in details if d[0]["window_id"] == wid]
    candidates.sort(key=lambda d: (d[1]["block_id"] != window.get("focused_block_id"), RANK.get(d[2], 4)))
    for _, pane, _ in candidates:
        try:
            path = directory(session, pane)
        except RuntimeError:
            continue
        if path:
            return Path(path).name or path
    for _, pane, _ in candidates:
        try:
            title = block(session, pane["block_id"], "title").get("title", "").strip()
        except RuntimeError:
            continue
        if title:
            return title
    return label or wid


def close_picker_popup():
    """Close the layer explicitly, preserving focus unlike natural block exit."""
    sid = os.environ.get("REX_PICKER_ORIGIN")
    bid = os.environ.get("REX_BLOCK")
    wid = os.environ.get("REX_PICKER_ORIGIN_WINDOW")
    if not sid or not bid or not wid:
        return
    view = api("session.view", session_id=sid)
    for window in view.get("windows") or []:
        if window["window_id"] != wid:
            continue
        for layer in window.get("layers") or []:
            if layer.get("kind") == "floating" and any(
                    pane["block_id"] == bid for pane in layer.get("blocks") or []):
                # Closing our layer also terminates this process. Do not rely on
                # code after this request running or perform another selection.
                api("session.close_layer", session_id=sid, layer_id=layer["layer_id"])
                return


def main(args):
    if args[0] in ("sessions", "worktrees"):
        with snapshot():
            dispatch(args)
    elif args[0] == "picker":
        try:
            dispatch(args)
        finally:
            close_picker_popup()
    else:
        dispatch(args)


def dispatch(args):
    command, *args = args
    if command == "previous-tab":
        print(json.dumps(previous_tab(args[0])))
    elif command == "remember-tab":
        remember_tab(*args)
    elif command == "picker":
        os.environ["REX_PICKER_BLOCK"] = os.environ.get("REX_BLOCK", "")
        try:
            tv(args[0])
        except Exception:
            # Preserve the diagnostic in the popup until acknowledged.
            import traceback
            traceback.print_exc()
            input("Picker failed. Press Enter to close.")
            raise
    elif command == "repos":
        cfg = config()
        for root in cfg["scratch_roots"]:
            path = Path(root).expanduser()
            if path.is_dir():
                row(path.name, "scratch", "plain folders", enc(path), enc(path.name), "scratch")
        for root in cfg["roots"]:
            root = Path(root).expanduser()
            if not root.is_dir():
                continue
            for path in sorted(root.iterdir()):
                if path.name.startswith(".") or not (path / ".git").exists():
                    continue
                try:
                    branch = branch_name(path)
                except OSError:
                    continue  # A checkout may disappear during discovery.
                row(path.name, root, branch, enc(path), enc(path.name), "git")
    elif command in ("project-preview", "worktree-preview", "scratch-preview"):
        path = dec(args[0])
        print(clean(path))
        if command == "worktree-preview" or (command == "project-preview" and args[1] == "git"):
            print(screen(git(path, "status", "--short", "--branch")))
            print(screen(git(path, "worktree", "list")))
        else:
            for entry in sorted(Path(path).iterdir()):
                print(clean(entry.name + ("/" if entry.is_dir() else "")))
    elif command in ("open-project", "open-worktree"):
        repository = command == "open-worktree" or args[2] == "git"
        open_path(dec(args[0]), dec(args[1]), repository=repository)
    elif command == "browse-project":
        path, label, kind = dec(args[0]), dec(args[1]), args[2]
        tv("rex-worktrees" if kind == "git" else "rex-scratch",
           REX_PROJECT_PATH=path, REX_PROJECT_NAME=label, REX_SCRATCH_ROOT=path)
    elif command in ("create-project-child", "create-worktree", "create-session"):
        path = dec(args[0])
        kind = args[1] if command == "create-project-child" else ("scratch" if command == "create-session" else "git")
        if kind == "git":
            create_worktree(path)
        else:
            name = input("Session name: ").strip()
            if not name or name in (".", "..") or Path(name).name != name:
                raise ValueError("Session name must be one directory name")
            child = Path(path) / name
            child.mkdir()
            open_path(child, name, repository=False)
    elif command == "worktrees":
        repo = os.environ["REX_PROJECT_PATH"]
        listed = worktrees(repo)
        # One live inventory per refresh, not a full server scan per worktree.
        with registry() as state:
            tabs = inventory(state)
        opened = {path for tab in tabs for path in tab["checkouts"]}
        opened.update(tab["checkout"] for tab in tabs if tab["checkout"])
        for path, branch in listed:
            label = branch or Path(path).name
            row(label, branch, "open" if str(Path(path).resolve()) in opened else "",
                enc(path), enc(label), enc(branch or path), enc(repo))
    elif command == "remove-worktree":
        remove_worktree(*map(dec, args[:3]), args[3])
    elif command == "scratch":
        root = Path(os.environ["REX_SCRATCH_ROOT"])
        for child in sorted(root.iterdir()):
            if child.is_dir() and not child.name.startswith("."):
                row(child.name, enc(child), enc(child.name), enc(root))
    elif command == "sessions":
        entries = []
        for session in sessions():
            view, details, _ = status_info(session)
            sid = session["session_id"]
            repo = session.get("label", sid)
            for window in view.get("windows") or []:
                wid = window["window_id"]
                tab_details = [d for d in details if d[0]["window_id"] == wid]
                # Do not list the temporary picker tab as a navigation target.
                if not tab_details and any(pane["block_id"] == os.environ.get("REX_PICKER_BLOCK")
                                           for layer in window.get("layers") or []
                                           for pane in layer.get("blocks") or []):
                    continue
                state = min((d[2] for d in tab_details), key=lambda s: RANK.get(s, 4), default="unknown")
                primary = min(tab_details, key=lambda d: RANK.get(d[2], 4)) if tab_details else None
                path = directory(sid, primary[1]) if primary else ""
                label = repo + " / " + tab_label(sid, window, tab_details)
                current = (sid, wid) == (os.environ.get("REX_PICKER_ORIGIN"), os.environ.get("REX_PICKER_ORIGIN_WINDOW"))
                display = ("• " if current else "") + label + "  [" + state + "]"
                entries.append((RANK.get(state, 4), len(entries), display, label, state, sid, path, wid))
        for _, index, display, label, state, sid, path, wid in sorted(entries):
            row(display, label, state, sid, index + 1, path, wid)
    elif command == "session-preview":
        session = {"session_id": args[0]}
        selected_window = args[1] if len(args) > 1 else None
        view, details, state = status_info(session, selected_window)
        label = view.get("label", args[0])
        tab_labels = {w["window_id"]: tab_label(args[0], w, details)
                      for w in view.get("windows") or []
                      if not selected_window or w["window_id"] == selected_window}
        if selected_window:
            window = next((w for w in view.get("windows") or [] if w["window_id"] == selected_window), None)
            if not window:
                print("This tab has closed. Refresh the picker.")
                return
            label += " / " + tab_labels[selected_window]
        print(clean(label), "[" + state + "]")
        for window, pane, pane_state in details:
            print(clean(tab_labels[window["window_id"]]), clean(pane.get("label", "Terminal")), "[" + pane_state + "]")
        active_window = selected_window or view.get("active_window_id")
        if not selected_window and args[0] == os.environ.get("REX_PICKER_ORIGIN"):
            active_window = os.environ.get("REX_PICKER_ORIGIN_WINDOW") or active_window
        active = [d for d in details if d[0]["window_id"] == active_window]
        if active:
            _, pane, _ = min(active, key=lambda d: RANK.get(d[2], 4))
            path = directory(args[0], pane)
            print(clean(path))
            if path and (Path(path) / ".git").exists():
                print(screen(git(path, "status", "--short", "--branch")))
            print("\nCurrent screen\n--------------")
            print("\n".join(screen(block(args[0], pane["block_id"], "format").get("content", "")).splitlines()[-80:]))
    elif command == "select-session":
        select(args[0], args[1] if len(args) > 1 else None)
    elif command == "setup":
        path, base = args[:2]
        command = json.loads(args[2]) if len(args) == 3 else None
        if command is not None and (not isinstance(command, list) or not command
                                    or not all(isinstance(arg, str) and arg for arg in command)):
            raise ValueError("Setup command must be a nonempty argv list")
        print("Preparing " + path, flush=True)
        run("wt", "-C", path, "hook", "pre-start", "--foreground", "--base=" + base, capture=False)
        for hook in ("post-start", "post-switch"):
            # A delegated process must not race background setup or miss its failure.
            foreground = ["--foreground"] if command is not None else []
            run("wt", "-C", path, "hook", hook, *foreground, "--base=" + base, capture=False)
        print("Worktree ready.", flush=True)
        os.chdir(path)
        if command is not None:
            launch_command(command)
        else:
            shell = os.environ.get("SHELL", "/bin/sh")
            os.execv(shell, [shell, "-l"])
    else:
        raise ValueError("Unknown command: " + command)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (RuntimeError, ValueError, OSError, KeyError) as error:
        print(f"Rex picker: {error}", file=sys.stderr)
        sys.exit(1)
