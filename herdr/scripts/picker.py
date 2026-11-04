#!/usr/bin/env python3
"""JSON bridge for the native picker. Worktrunk owns checkout and hook policy."""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import tomllib
import uuid

HOME = Path(os.environ.get("HERDR_APP_HOME", Path.home() / ".config/herdr-app"))
STATE = HOME / "data/toolkit-picker"
SCRIPT = Path(__file__).resolve()


def run(*args, cwd=None, capture=True):
    result = subprocess.run(list(map(str, args)), cwd=cwd, text=True,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None,
                            env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "GH_PROMPT_DISABLED": "1"})
    if result.returncode:
        raise RuntimeError(result.stderr or f"{args[0]} exited {result.returncode}")
    return result.stdout if capture else None


def git(path, *args):
    return run("git", "-C", path, *args)


def app(command, **args):
    result = json.loads(run("herdr-app", "do", command, json.dumps(args)))
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as file:
        temporary = Path(file.name)
        json.dump(value, file)
        file.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def lock():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / "operation.lock").open("a") as file:
        try:
            fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError("Another picker operation is active. Inspect its job before retrying.") from error
        yield


def config():
    path = HOME / "config/toolkit-picker.toml"
    if not path.exists():
        path = SCRIPT.parents[1] / "config/picker.toml"
    with path.open("rb") as file:
        value = tomllib.load(file)
    for key in ("roots", "scratch_roots"):
        if not isinstance(value.get(key), list) or any(not isinstance(p, str) for p in value[key]):
            raise ValueError(f"{key} must be a list of paths")
    return value


def canonical(path):
    return str(Path(path).expanduser().resolve(strict=True))


def identity(path):
    common, top = git(path, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel").splitlines()
    return {"common": canonical(common), "path": canonical(top)}


def worktrees(repo):
    result = []
    for record in git(repo, "worktree", "list", "--porcelain", "-z").split("\0\0"):
        fields = dict(line.split(" ", 1) if " " in line else (line, "")
                      for line in record.split("\0") if line)
        if "worktree" in fields and "prunable" not in fields:
            result.append({"path": fields["worktree"], "branch": fields.get("branch", "").removeprefix("refs/heads/"),
                           "primary": not result, "locked": "locked" in fields})
    return result


def projects():
    cfg = config()
    result, seen = [], set()
    for item in cfg["scratch_roots"]:
        path = Path(item).expanduser()
        if path.is_dir():
            result.append({"id": str(path.resolve()), "path": str(path.resolve()), "name": path.name, "kind": "scratch", "detail": "Plain folders"})
    for root in cfg["roots"]:
        root = Path(root).expanduser()
        if not root.is_dir():
            continue
        for path in sorted(root.iterdir()):
            if path.name.startswith(".") or not (path / ".git").exists():
                continue
            key = str(path.resolve())
            if key in seen:
                continue
            seen.add(key)
            try:
                directory = path / ".git"
                if directory.is_file():
                    directory = path / directory.read_text().strip().removeprefix("gitdir: ")
                head = (directory / "HEAD").read_text().strip()
                branch = head.removeprefix("ref: refs/heads/") if head.startswith("ref: refs/heads/") else "detached"
            except FileNotFoundError:
                continue
            result.append({"id": key, "path": key, "name": path.name, "kind": "git", "detail": f"{branch} · {root}"})
    return result


def known_tabs():
    path = STATE / "tabs.json"
    return json.loads(path.read_text()) if path.exists() else {}


def inventory(deep=False):
    """One fresh app snapshot plus foreground cwds. Never infer status from screen text."""
    layout = json.loads(run("herdr-app", "ls"))
    known = known_tabs()
    shared = HOME / "shared.json"
    sessions = json.loads(shared.read_text()).get("toolkit.workbench.v1", {}).get("sessions", {}) if shared.exists() else {}
    ownership = {}
    for index, session in enumerate(sessions.values()):
        if not session.get("machine") and session.get("folder"):
            for tab in session.get("tabs", []):
                known.setdefault(tab, session["folder"])
                ownership[tab] = {"session": session["id"], "main": session["main"] == tab, "order": index}
    identities = {}
    current_terminals = {}
    roots = {t["terminal"]: tab["id"] for space in layout["spaces"] if not space.get("machine")
             for tab in space["tabs"] for t in tab.get("terminals", [])}
    if deep:
        # Read parentage only for destructive planning. Every pane root is an
        # ownership boundary, including independently graduated sessions.
        for terminal in json.loads(run("hc", "ls", "--json"))["terminals"]:
            address = terminal["address"]
            if "/" not in address:
                current_terminals[address] = json.loads(run("hc", "get", address, "--json"))

    def current(address):
        if address not in current_terminals:
            current_terminals[address] = json.loads(run("hc", "get", address, "--json"))
        return current_terminals[address]

    def root_of(address):
        seen = set()
        while address and address not in seen:
            seen.add(address)
            if address in roots:
                return roots[address], len(seen)
            address = current_terminals.get(address, {}).get("parent")
        return None, len(seen)

    def checkout(path):
        if path not in identities:
            try:
                identities[path] = identity(path)
            except RuntimeError as error:
                if "not a git repository" not in str(error).lower():
                    raise
                identities[path] = None
        return identities[path]

    result = []
    for space in layout["spaces"]:
        if space.get("machine"):
            continue
        for tab in space["tabs"]:
            paths, addresses, checkouts, repos = set(), [], set(), set()
            pane_addresses = {t["terminal"] for t in tab.get("terminals", [])}
            candidates = set(pane_addresses)
            if deep:
                candidates.update(a for a in current_terminals if root_of(a)[0] == tab["id"])
            for address in sorted(candidates):
                terminal = current(address)
                if terminal.get("state", "live") != "live":
                    continue
                addresses.append(address)
                path = (terminal.get("foreground") or {}).get("cwd") or terminal.get("cwd")
                if path:
                    paths.add(canonical(path))
            owned = known.get(tab["id"])
            if owned and Path(owned).exists():
                paths.add(canonical(owned))
            for path in paths:
                info = checkout(path)
                if info:
                    checkouts.add(info["path"])
                    repos.add(info["common"])
            # Stable ownership wins when a shell later changes directories.
            folder = canonical(owned) if owned and Path(owned).exists() else next(iter(checkouts or paths), None) if len(checkouts or paths) == 1 else None
            result.append({"tab": tab["id"], "space": space["id"], "name": tab["name"], "folder": folder,
                           "paths": sorted(paths), "checkouts": sorted(checkouts), "repos": sorted(repos), "terminals": sorted(addresses),
                           "unpaneled": sorted((a for a in addresses if a not in pane_addresses), key=lambda a: (-root_of(a)[1], a)),
                           **ownership.get(tab["id"], {})})
    return result


def remember(tab, path):
    values = known_tabs()
    values[tab] = path
    atomic(STATE / "tabs.json", values)


def open_path(path, origin=None, setup=None):
    path = canonical(path)
    tabs = inventory()
    existing = [t for t in tabs if t["folder"] == path or path in t["checkouts"]]
    if existing:
        if setup:
            raise ValueError(f"A tab already exists for {path}. Inspect its setup before retrying.")
        target = min(existing, key=lambda t: (not t.get("main", False), t.get("order", 1000000)))
        return {"tab": target["tab"], "space": target["space"], "path": path}
    try:
        info = identity(path)
    except RuntimeError as error:
        if "not a git repository" not in str(error).lower():
            raise
        info = None
    name = git(path, "branch", "--show-current").strip() if info else Path(path).name
    args = {"folder": path, "name": name or Path(path).name}
    if setup:
        args["argv"] = [sys.executable, str(SCRIPT), "setup", json.dumps({"path": path, "base": setup})]
    candidates = list(dict.fromkeys(t["space"] for t in tabs if info and info["common"] in t["repos"]))
    if len(candidates) == 1:
        target = app("tab.new", space=candidates[0], **args)
    else:
        # Several existing spaces for one repository are not silently merged.
        args["tab"] = args.pop("name")
        target = app("space.new", **args)
    if not target.get("tab"):
        raise RuntimeError(f"Herdr may have opened {path}, but returned no tab. Inspect Full before retrying.")
    remember(target["tab"], path)
    return {**target, "path": path, "origin": origin}


def create(repo, branch):
    repo = canonical(repo)
    branch = branch.strip()
    if not branch or branch.startswith("-"):
        raise ValueError("A branch name is required")
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
    run("wt", "-C", repo, "hook", "pre-switch", "--foreground", "--branch=" + branch, "--base=" + base, capture=False)
    try:
        created = json.loads(run("wt", "-C", repo, "switch", "--create", branch, "--base", base, "--no-hooks", "--no-cd", "--format=json"))
    except Exception as error:
        raise RuntimeError(f"Worktree creation did not finish cleanly. Inspect wt list and this job's log before retrying. {error}") from error
    if not created.get("path") or created.get("branch") != branch:
        raise RuntimeError("Worktree may have been created. Inspect wt list before retrying.")
    path = created["path"]
    try:
        return open_path(path, setup=base)
    except Exception as error:
        raise RuntimeError(f"Checkout preserved at {path}. Inspect Herdr; run setup manually if needed. {error}") from error


def scratch(root, name):
    root = canonical(root)
    allowed = {canonical(p) for p in config()["scratch_roots"] if Path(p).expanduser().is_dir()}
    if root not in allowed:
        raise ValueError("Not a configured scratch root")
    if not name or name in (".", "..") or name.startswith(".") or "/" in name or "\\" in name:
        raise ValueError("Session name must be one visible directory name")
    path = Path(root) / name
    path.mkdir()  # Never adopt an existing folder when the user requested creation.
    try:
        return open_path(path)
    except Exception as error:
        raise RuntimeError(f"Folder preserved at {path}. {error}") from error


def removal_plan(repo, path, mode, origin):
    if mode not in ("normal", "keep", "force"):
        raise ValueError("Invalid removal mode")
    repo, path = canonical(repo), canonical(path)
    listed = worktrees(repo)
    selected = next((w for w in listed if canonical(w["path"]) == path), None)
    if not selected or selected["primary"]:
        raise ValueError("The primary checkout cannot be removed, or the checkout is no longer registered")
    if selected["locked"]:
        raise ValueError("This worktree is locked. Inspect it with Worktrunk before removal.")
    tabs = [t for t in inventory(deep=True) if t["folder"] == path or path in t["checkouts"]]
    for tab in tabs:
        if tab["tab"] == origin:
            raise ValueError("Switch away from this checkout tab before removing it")
        if set(tab["checkouts"]) - {path} or any(not Path(p).is_relative_to(path) for p in tab["paths"]):
            raise ValueError("A matching tab contains another checkout or folder. Move those panes before removing it.")
    data = {"repo": repo, "path": path, "mode": mode, "origin": origin, "branch": selected["branch"], "tabs": tabs}
    data["signature"] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    return data


def remove(plan):
    fresh = removal_plan(plan["repo"], plan["path"], plan["mode"], plan["origin"])
    if fresh["signature"] != plan["signature"]:
        raise ValueError("Checkout scope changed. Review a fresh confirmation before removing it.")
    remaining = {t["tab"] for t in plan["tabs"]}

    def guard():
        current = removal_plan(plan["repo"], plan["path"], plan["mode"], plan["origin"])
        if current["branch"] != plan["branch"] or {t["tab"] for t in current["tabs"]} != remaining:
            raise ValueError("Checkout branch or tabs changed while closing")
        for tab in current["tabs"]:
            original = next(t for t in plan["tabs"] if t["tab"] == tab["tab"])
            if (tab.get("session") != original.get("session") or tab.get("main") != original.get("main")
                    or not set(tab["terminals"]).issubset(original["terminals"])
                    or not set(tab["paths"]).issubset(original["paths"])):
                raise ValueError("Checkout ownership, folders, or terminals changed while closing")
        return current

    try:
        for tab in plan["tabs"]:
            for address in tab["unpaneled"]:
                current = guard()
                if any(address in t["terminals"] for t in current["tabs"]):
                    run("hc", "kill", address)
            guard()
            app("tab.close", id=tab["tab"], confirmed=True)
            remaining.remove(tab["tab"])
        guard()
        for tab in plan["tabs"]:
            for address in tab["terminals"]:
                if json.loads(run("hc", "get", address, "--json")).get("state") == "live":
                    raise ValueError("Confirmed terminals are still live. Checkout preserved.")
        flags = {"normal": [], "keep": ["--no-delete-branch"], "force": ["--force", "--force-delete"]}[plan["mode"]]
        run("wt", "-C", plan["repo"], "remove", "--foreground", *flags, "--", plan["path"], capture=False)
        return {"removed": plan["path"]}
    except Exception as error:
        raise RuntimeError(f"Removal stopped. Earlier tabs may already be closed. Inspect Full and wt list before retrying; reopen {plan['path']} if it remains. {error}") from error


def setup(data):
    path, base = data["path"], data["base"]
    print("Preparing " + path, flush=True)
    try:
        run("wt", "-C", path, "hook", "pre-start", "--foreground", "--base=" + base, capture=False)
        for hook in ("post-start", "post-switch"):
            run("wt", "-C", path, "hook", hook, "--base=" + base, capture=False)
    except Exception as error:
        print(f"Setup stopped: {error}\nCheckout preserved at {path}. Fix the hook, then run setup manually.", flush=True)
        input("Press Enter to open a recovery shell, without retrying setup.")
    else:
        print("Worktree ready.", flush=True)
    os.chdir(path)
    shell = os.environ.get("SHELL", "/bin/sh")
    os.execv(shell, [shell, "-l"])


def job_path(ident):
    if not re.fullmatch(r"[0-9a-f]{32}", ident):
        raise ValueError("Invalid job ID")
    return STATE / "jobs" / ident


def submit(data):
    if data.get("action") not in ("open", "create", "scratch", "remove"):
        raise ValueError("Invalid operation")
    ident = uuid.uuid4().hex
    path = job_path(ident)
    path.mkdir(parents=True, mode=0o700)
    atomic(path / "request.json", data)
    atomic(path / "status.json", {"state": "running", "job": ident})
    try:
        with (path / "output.log").open("wb") as log:
            os.chmod(path / "output.log", 0o600)
            subprocess.Popen([sys.executable, str(SCRIPT), "worker", json.dumps({"job": ident})], stdin=subprocess.DEVNULL,
                             stdout=log, stderr=log, start_new_session=True, close_fds=True)
    except Exception as error:
        atomic(path / "status.json", {"state": "failed", "job": ident, "error": str(error)})
        raise
    return {"job": ident}


def worker(ident):
    path = job_path(ident)
    # A durable claim makes even an accidental second worker invocation inert.
    # Never resume by replaying a request whose earlier effects are uncertain.
    try:
        with (path / "claimed").open("x") as file:
            file.write(str(os.getpid()))
    except FileExistsError:
        return
    try:
        data = json.loads((path / "request.json").read_text())
        atomic(path / "status.json", {"state": "running", "job": ident, "pid": os.getpid()})
        with lock():
            action = data["action"]
            if action == "open":
                result = open_path(data["path"], data.get("origin"))
            elif action == "create":
                result = create(data["repo"], data["name"])
            elif action == "scratch":
                result = scratch(data["root"], data["name"])
            elif action == "remove":
                if data.get("confirmation") != "yes":
                    raise ValueError("Removal requires typing yes")
                result = remove(data["plan"])
            else:
                raise ValueError("Invalid job action")
        atomic(path / "status.json", {"state": "done", "job": ident, "result": result})
    except Exception as error:
        atomic(path / "status.json", {"state": "failed", "job": ident, "error": str(error)})


def dispatch(command, data):
    if command == "projects":
        return projects()
    if command == "worktrees":
        return [{**w, "id": w["path"], "name": w["branch"] or Path(w["path"]).name, "kind": "git",
                 "detail": " · ".join(filter(None, ["primary" if w["primary"] else "", w["path"]]))}
                for w in worktrees(data["path"])]
    if command == "scratch":
        return [{"id": str(p), "path": str(p), "name": p.name, "kind": "scratch", "detail": str(p)}
                for p in sorted(Path(data["path"]).iterdir()) if p.is_dir() and not p.name.startswith(".")]
    if command == "preview":
        path = canonical(data["path"])
        if data.get("kind") == "git":
            return path + "\n\n" + git(path, "--no-optional-locks", "status", "--short", "--branch") + "\n" + git(path, "worktree", "list")
        return path + "\n\n" + "\n".join(p.name + ("/" if p.is_dir() else "") for p in sorted(Path(path).iterdir()))
    if command == "plan":
        return removal_plan(data["repo"], data["path"], data["mode"], data.get("origin"))
    if command == "submit":
        return submit(data)
    if command == "job":
        path = job_path(data["job"])
        status = json.loads((path / "status.json").read_text())
        if status["state"] == "running" and status.get("pid"):
            try:
                os.kill(status["pid"], 0)
            except ProcessLookupError:
                status = {**status, "state": "failed", "error": "Worker exited without recording an outcome. Inspect the job log, Herdr, and wt list before starting another operation. It may have partially completed."}
        log = path / "output.log"
        if log.exists():
            with log.open("rb") as file:
                file.seek(max(0, log.stat().st_size - 12000))
                status["log"] = file.read(12000).decode(errors="replace")
        return status
    if command == "worker":
        worker(data["job"])
        return None
    if command == "setup":
        setup(data)
        return None
    raise ValueError("Unknown picker command")


if __name__ == "__main__":
    try:
        result = dispatch(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv) > 2 else {})
        if result is not None:
            print(json.dumps(result))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
