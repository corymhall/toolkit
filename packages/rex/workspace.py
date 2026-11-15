#!/usr/bin/env python3
"""Explicit, local-server workspace snapshots. Never save or replay arbitrary commands."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import unquote, urlparse

CONTROL_LABELS = {"Rex workspace control", "Rex picker"}
SHELLS = {"sh", "bash", "zsh", "fish", "login"}
_TRACE = None


def trace(event, **fields):
    """Allowlisted restore metadata only. Never pass terminal contents or argv."""
    if _TRACE is not None:
        _TRACE.write(json.dumps({"time": datetime.now(timezone.utc).isoformat(),
                                 "event": event, **fields}) + "\n")
        _TRACE.flush()


def state_root():
    root = Path(os.environ.get("REX_WORKSPACE_STATE_DIR", str(
        Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) / "rex/workspace")))
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".write-")
    try:
        with os.fdopen(fd, "w") as file:
            json.dump(data, file, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def locked():
    with (state_root() / ".lock").open("a") as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        yield


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


class Client:
    def __init__(self, server=None):
        self.server = server or os.environ.get("REX_SERVER")
        if not self.server or not self.server.startswith(("unix://", "/")):
            raise ValueError("An explicit local Unix server address is required, via --server or REX_SERVER")
        binary = Path(os.environ.get("REX_BIN_DIR", "/nonexistent")) / "rex"
        self.binary = str(binary) if binary.is_file() else shutil.which("rex")
        if not self.binary:
            raise ValueError("Rex CLI not found")

    def call(self, method, **args):
        trace("api_request", method=method, session_id=args.get("session_id"))
        result = subprocess.run([self.binary, "--autostart=false", "--server", self.server,
                                 "api", "call", method, json.dumps(args)],
                                text=True, capture_output=True, timeout=30)
        trace("api_result", method=method, exit_code=result.returncode)
        if result.returncode:
            raise RuntimeError(f"{method}: {result.stderr.strip()[:1000]}")
        return json.loads(result.stdout)

    def terminal(self, sid, bid, method):
        return self.call("com.superlogical.terminal." + method, session_id=sid, block_id=bid, args={})


def processes(process):
    return [p for p in [process.get("foreground"), process.get("child"),
                        *(process.get("ancestors") or [])] if p]


def process_start(pid):
    result = subprocess.run(["ps", "-p", str(pid), "-o", "lstart="], text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def startup_agent(process, kind, sender=None):
    """Verify local foreground ancestry when Rex still caches the login process."""
    child = process.get("child") or {}
    if child.get("name") != "login":
        return None
    pid = int(sender or os.getppid())
    found = None
    for _ in range(32):
        if pid == child.get("pid"):
            return found
        result = subprocess.run(["ps", "-p", str(pid), "-o", "ppid=,pgid=,tpgid=,ucomm="],
                                text=True, capture_output=True)
        fields = result.stdout.strip().split(maxsplit=3)
        if result.returncode or len(fields) != 4:
            return None
        parent, group, foreground, command = fields
        # macOS can report tpgid=0 for a headless Rex PTY. In that case
        # require a single agent in the verified chain to the terminal child.
        if Path(command).name == kind and (group == foreground or foreground == "0"):
            if found:
                return None
            found = {"pid": pid, "name": kind}
        pid = int(parent)
        if pid <= 1:
            return None
    return None


def register(client, kind, payload, remove=False):
    sid, bid = os.environ.get("REX_SESSION"), os.environ.get("REX_BLOCK")
    if not sid or not bid:
        return
    status = client.call("server.status")
    instance = status["instance_id"]
    file = state_root() / "agents.json"
    key = instance + "/" + bid
    with locked():
        agents = read(file, {})
        if remove:
            old = agents.get(key)
            if old and old["pid"] == payload.get("pid"):
                del agents[key]
                atomic(file, agents)
            return
        proc = client.terminal(sid, bid, "process")
        candidates = [p for p in processes(proc) if p.get("name") == kind]
        if payload.get("pid"):
            candidates = [p for p in candidates if p["pid"] == payload["pid"]]
        if not candidates:
            verified = startup_agent(proc, kind, payload.get("pid"))
            if verified:
                candidates = [verified]
        if not candidates:
            raise ValueError(f"Agent is not the foreground process or one of its ancestors: sender={payload.get('pid')}, seen={[(p['pid'], p.get('name')) for p in processes(proc)]}")
        pid = candidates[0]["pid"]
        started = process_start(pid)
        if not started:
            raise ValueError("Cannot establish agent process identity")
        conversation = payload.get("session_id")
        if not isinstance(conversation, str) or not conversation or any(ord(c) < 32 for c in conversation):
            raise ValueError("Missing or invalid conversation ID")
        if kind == "codex":
            uuid.UUID(conversation)
        path = payload.get("file") if kind == "pi" else None
        if path and (not isinstance(path, str) or not Path(path).is_absolute()):
            raise ValueError("Pi session file must be an absolute path")
        agents[key] = {"kind": kind, "session_id": conversation, "file": path,
                       "pid": pid, "started": started, "rex_session": sid,
                       "cwd": payload.get("cwd") or candidates[0].get("cwd")}
        atomic(file, agents)
        remember_agent(status, bid, agents[key])


def remember_agent(server, bid, agent):
    """Persist resume metadata, not process identity. Caller holds the state lock."""
    host = server.get("host_id")
    if not host:
        return  # Without persistent Rex state there is no durable pane identity.
    path = state_root() / "tracked.json"
    tracked = read(path, {"version": 1, "hosts": {}})
    if tracked.get("version") != 1:
        raise ValueError("Unsupported agent tracking format")
    records = tracked["hosts"].setdefault(host, {})
    cwd = agent.get("cwd")
    recorded = False
    if agent["kind"] == "pi" and not agent.get("file"):
        records.pop(bid, None)  # A new --no-session Pi must not resurrect its predecessor.
    elif cwd and Path(cwd).is_absolute():
        identity = (agent["kind"], agent["session_id"])
        for previous in list(records):
            if (records[previous]["agent"]["kind"], records[previous]["agent"]["session_id"]) == identity:
                del records[previous]  # The last verified pane owns this conversation.
        recorded = True
        records[bid] = {"cwd": cwd, "rex_session": agent["rex_session"],
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "agent": {k: agent.get(k) for k in ("kind", "session_id", "file")}}
    else:
        # Do not retain an older conversation when a replacement cannot be resumed safely.
        records.pop(bid, None)
    atomic(path, tracked)
    return recorded


def forget_agent(client, bid):
    host = client.call("server.status").get("host_id")
    if not host:
        raise ValueError("Persistent Rex host identity is required")
    with locked():
        path = state_root() / "tracked.json"
        tracked = read(path, {"version": 1, "hosts": {}})
        if tracked.get("version") != 1:
            raise ValueError("Unsupported agent tracking format")
        tracked["hosts"].get(host, {}).pop(bid, None)
        atomic(path, tracked)


def track_running(client):
    """Backfill only verified agents in the current server instance, never old PIDs."""
    server = client.call("server.status")
    running = live_registrations(client, server)
    count = 0
    with locked():
        registrations = read(state_root() / "agents.json", {})
        for identity, (sid, bid) in running.items():
            agent = registrations.get(server["instance_id"] + "/" + bid)
            if not agent or (agent["kind"], agent["session_id"]) != identity:
                continue
            if process_start(agent["pid"]) != agent["started"]:
                continue
            count += bool(remember_agent(server, bid, agent))
    return count


def tracked_snapshot(client):
    """Resolve tracked pane IDs against today's layout. No snapshot is written."""
    server = client.call("server.status")
    host = server.get("host_id")
    if not host:
        raise ValueError("Persistent Rex host identity is required for agent tracking")
    tracked = read(state_root() / "tracked.json", {"version": 1, "hosts": {}})
    if tracked.get("version") != 1:
        raise ValueError("Unsupported agent tracking format")
    records = tracked["hosts"].get(host, {})
    if not records:
        raise ValueError("No tracked agents. Start Pi or run workspace.py track to register current agents.")
    source = {"id": "tracked-" + hashlib.sha256(host.encode()).hexdigest()[:16],
              "host_id": host, "tracked": True, "sessions": [], "warnings": []}
    seen = set()
    for session in client.call("session.list").get("sessions", []):
        sid = session["session_id"]
        view = client.call("session.view", session_id=sid)
        saved = {"id": sid, "label": view.get("label", ""), "windows": []}
        for window in view.get("windows") or []:
            tiled = [layer for layer in window.get("layers") or [] if layer["kind"] == "tiled"]
            if len(tiled) != 1:
                continue
            panes = {}
            for block in tiled[0].get("blocks") or []:
                bid = block["block_id"]
                if bid in records:
                    panes[bid] = {"cwd": records[bid]["cwd"], "agent": records[bid]["agent"]}
                    seen.add(bid)
            if panes:
                saved["windows"].append({"id": window["window_id"], "label": window.get("label", ""),
                                         "layout": tiled[0]["layout"], "panes": panes})
        if saved["windows"]:
            source["sessions"].append(saved)
    if len(seen) != len(records):
        source["warnings"].append(f"{len(records) - len(seen)} tracked panes are closed or not tiled; skipped")
    return source


def leaves(node):
    if not node:
        return []
    if node.get("block_id"):
        return [node["block_id"]]
    split = node.get("split")
    if not split:
        raise ValueError("Unsupported or empty pane layout")
    return leaves(split["before"]) + leaves(split["after"])


def capture(client):
    server = client.call("server.status")
    registrations = read(state_root() / "agents.json", {})
    snapshot = {"version": 1, "id": uuid.uuid4().hex, "saved_at": datetime.now(timezone.utc).isoformat(),
                "host_id": server.get("host_id"), "source_instance": server["instance_id"],
                "sessions": [], "warnings": []}
    initial_sessions = client.call("session.list").get("sessions", [])
    for session in initial_sessions:
        sid = session["session_id"]
        view = client.call("session.view", session_id=sid)
        active = view.get("active_window_id")
        if sid == os.environ.get("REX_WORKSPACE_ORIGIN_SESSION"):
            active = os.environ.get("REX_WORKSPACE_ORIGIN_WINDOW") or active
        managed = read(Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state"))) /
                       "rex/picker/registry.json", {}).get(sid, {})
        saved = {"id": sid, "label": view.get("label", ""), "active": active, "windows": []}
        for window in view.get("windows") or []:
            if window.get("label") in CONTROL_LABELS:
                continue
            tiled = [layer for layer in window.get("layers") or [] if layer["kind"] == "tiled"]
            if len(tiled) != 1:
                raise ValueError("Expected one tiled layer per window")
            layer = tiled[0]
            if len(window["layers"]) > 1:
                snapshot["warnings"].append(f"Floating layers omitted in {sid}/{window['window_id']}")
            panes = {}
            for block in layer.get("blocks") or []:
                bid = block["block_id"]
                if block.get("creator_name") != "com.superlogical.terminal":
                    raise ValueError("Snapshot supports terminal blocks only")
                proc = client.terminal(sid, bid, "process")
                all_processes = processes(proc)
                cwd = next((p["cwd"] for p in all_processes if p.get("cwd")), None)
                agent = registrations.get(server["instance_id"] + "/" + bid)
                if agent and not any(p["pid"] == agent["pid"] and p.get("name") == agent["kind"]
                                     for p in all_processes):
                    if not startup_agent(proc, agent["kind"], agent["pid"]):
                        agent = None
                if agent and process_start(agent["pid"]) != agent["started"]:
                    agent = None
                if not cwd:
                    reported = client.terminal(sid, bid, "pwd").get("pwd", "")
                    cwd = unquote(urlparse(reported).path) if reported.startswith("file://") else reported
                if not cwd and agent:
                    cwd = agent.get("cwd")
                if not cwd or not Path(cwd).is_absolute():
                    raise ValueError(f"No working directory for {bid}; snapshot was not saved")
                foreground = proc.get("foreground") or proc.get("child") or {}
                if not agent and foreground.get("name") not in SHELLS:
                    snapshot["warnings"].append(f"{bid}: {foreground.get('name', 'unknown program')} will reopen as a shell")
                panes[bid] = {"cwd": cwd, "label": block.get("label", ""),
                              "agent": {k: agent[k] for k in ("kind", "session_id", "file")} if agent else None}
            if set(leaves(layer["layout"])) != set(panes):
                raise ValueError("Layout changed during snapshot; save again")
            saved["windows"].append({"id": window["window_id"], "label": window.get("label", ""),
                                     "layout": layer["layout"], "panes": panes,
                                     "focused": window.get("focused_block_id"), "zoomed": window.get("zoomed_block_id"),
                                     "checkout": managed.get("windows", {}).get(window["window_id"])})
        if saved["windows"]:
            # Do not save the control or picker tab as the selected tab.
            if saved["active"] not in {w["id"] for w in saved["windows"]}:
                saved["active"] = saved["windows"][0]["id"]
            saved["repo"] = managed.get("repo")
            snapshot["sessions"].append(saved)
        if client.call("session.view", session_id=sid)["revision"] != view["revision"]:
            raise ValueError("Workspace changed during snapshot; save again")
    if not snapshot["sessions"]:
        raise ValueError("No restorable sessions; previous snapshots were preserved")
    if {s["session_id"] for s in client.call("session.list").get("sessions", [])} != {s["session_id"] for s in initial_sessions}:
        raise ValueError("Sessions changed during snapshot; save again")
    with locked():
        atomic(state_root() / "snapshots" / (snapshot["id"] + ".json"), snapshot)
        atomic(state_root() / "latest.json", {"id": snapshot["id"]})
    return snapshot


def load_snapshot(identifier=None):
    identifier = identifier or read(state_root() / "latest.json", {}).get("id")
    if not identifier or len(identifier) != 32 or any(c not in "0123456789abcdef" for c in identifier):
        raise ValueError("No snapshot, or invalid snapshot ID")
    snapshot = read(state_root() / "snapshots" / (identifier + ".json"))
    if not snapshot or snapshot.get("version") != 1 or snapshot.get("id") != identifier:
        raise ValueError("Missing snapshot or unsupported snapshot format")
    return snapshot


def resume_command(pane, warnings):
    """Build only a known resume argv. Missing prerequisites leave the pane alone."""
    cwd = pane["cwd"]
    if not Path(cwd).is_dir():
        warnings.append(f"{cwd}: working directory no longer exists; leaving the shell alone")
        return None
    agent = pane.get("agent")
    if not agent:
        return None
    kind = agent.get("kind")
    binary = shutil.which(kind) if kind in ("pi", "codex") else None
    trace("agent_plan", cwd=cwd, kind=kind, conversation=agent.get("session_id"),
          executable=binary, file_exists=Path(agent.get("file") or "/nonexistent").is_file())
    if not binary:
        warnings.append(f"{cwd}: agent executable unavailable; leaving the shell alone")
        return None
    if kind == "pi":
        file = Path(agent.get("file") or "/nonexistent")
        if not file.is_file():
            warnings.append(f"{cwd}: Pi session file is missing; leaving the shell alone")
            return None
        with file.open() as stream:
            header = json.loads(stream.readline())
        if header.get("type") != "session" or header.get("id") != agent["session_id"]:
            raise ValueError("Pi session file does not match the saved conversation")
        return ["/usr/bin/env", "PI_PROGRAM_STATUS=1", binary, "--session", str(file), "--tui-mode", "fullscreen"]
    uuid.UUID(agent["session_id"])
    return [binary, "resume", agent["session_id"]]


def live_registrations(client, server):
    live = {}
    for key, agent in read(state_root() / "agents.json", {}).items():
        if not key.startswith(server["instance_id"] + "/"):
            continue
        if process_start(agent["pid"]) != agent["started"]:
            continue
        bid = key.split("/", 1)[1]
        try:
            proc = client.terminal(agent["rex_session"], bid, "process")
        except RuntimeError:
            continue
        if any(p.get("pid") == agent["pid"] and p.get("name") == agent["kind"]
               for p in processes(proc)) or startup_agent(proc, agent["kind"], agent["pid"]):
            live[(agent["kind"], agent["session_id"])] = (agent["rex_session"], bid)
    return live


def shape(node):
    if node.get("block_id"):
        return "pane"
    split = node["split"]
    return (split["direction"], shape(split["before"]), shape(split["after"]))


def targets(client, snapshot, running):
    """Prefer native stable IDs. Legacy journals are provenance, never labels."""
    live_ids = {s["session_id"] for s in client.call("session.list").get("sessions", [])}
    journals = [read(path, {}) for path in (state_root() / "restores").glob(snapshot["id"] + "-*.json")]
    mapped = {}
    for saved in snapshot["sessions"]:
        pending = {bid for w in saved["windows"] for bid, p in w["panes"].items()
                   if p.get("agent") and (p["agent"]["kind"], p["agent"]["session_id"]) not in running}
        if not pending:
            continue
        candidates = {saved["id"]} & live_ids
        for journal in journals:
            prior = journal.get(saved["id"], {})
            if prior.get("complete") and prior.get("session_id") in live_ids:
                candidates.add(prior["session_id"])
        if len(candidates) != 1:
            raise ValueError(f"{saved['label']}: no unique restored session. Nothing will be recreated.")
        sid = candidates.pop()
        view = client.call("session.view", session_id=sid)
        windows = [w for w in view.get("windows") or [] if w.get("label") not in CONTROL_LABELS]
        by_id = {w["window_id"]: w for w in windows}
        legacy = sid != saved["id"]
        if legacy and (len(windows) != len(saved["windows"]) or
                       [w.get("label") for w in windows] != [w["label"] for w in saved["windows"]]):
            raise ValueError(f"{saved['label']}: legacy layout changed; inspect targets manually")
        for index, source in enumerate(saved["windows"]):
            if not pending.intersection(source["panes"]):
                continue
            target = windows[index] if legacy else by_id.get(source["id"])
            if not target:
                raise ValueError(f"{saved['label']}: a saved tab is missing")
            tiled = [layer for layer in target.get("layers") or [] if layer["kind"] == "tiled"]
            if len(tiled) != 1 or shape(tiled[0]["layout"]) != shape(source["layout"]):
                raise ValueError(f"{saved['label']}: pane layout changed; inspect targets manually")
            current = leaves(tiled[0]["layout"])
            old = leaves(source["layout"])
            if not legacy and set(current) != set(old):
                raise ValueError(f"{saved['label']}: saved pane IDs changed")
            mapping = dict(zip(old, current)) if legacy else {bid: bid for bid in old}
            for bid, pane in source["panes"].items():
                if bid in pending:
                    mapped[bid] = {"session_id": sid, "block_id": mapping[bid],
                                   "pane": pane, "label": saved["label"] + " / " + source["label"]}
    return mapped


def local_login_shell(process):
    """Resolve cached login metadata conservatively through local PTY wrappers."""
    child = process.get("child") or {}
    if child.get("name") != "login" or not child.get("pid"):
        return {}
    result = subprocess.run(["ps", "-axo", "pid=,ppid=,pgid=,tpgid=,ucomm="],
                            text=True, capture_output=True)
    if result.returncode:
        return {}
    rows = {}
    for line in result.stdout.splitlines():
        fields = line.split(maxsplit=4)
        if len(fields) == 5:
            pid, parent, group, foreground, name = fields
            rows[int(pid)] = (int(parent), int(group), int(foreground), name.strip())
    pid = child["pid"]
    for _ in range(32):
        children = [(candidate, row) for candidate, row in rows.items() if row[0] == pid]
        if len(children) != 1:
            return {}
        pid, (_, group, foreground, name) = children[0]
        if name in {"sh", "bash", "zsh", "fish"}:
            if group != foreground or any(row[0] == pid for row in rows.values()):
                return {}
            cwd = subprocess.run(["/usr/sbin/lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
                                 text=True, capture_output=True)
            paths = [line[1:] for line in cwd.stdout.splitlines() if line.startswith("n")]
            if cwd.returncode == 0 and len(paths) == 1:
                return {"pid": pid, "name": name, "cwd": paths[0]}
            return {}
        if name not in {"login", "atuin"}:
            return {}
    return {}


def ready_shell(client, entry):
    """Refuse TUIs, busy shells, changed directories, and visible shell drafts."""
    sid, bid = entry["session_id"], entry["block_id"]
    proc = client.terminal(sid, bid, "process")
    foreground = proc.get("foreground") or {}
    if foreground.get("name") == "login":
        foreground = local_login_shell(proc)
    if foreground.get("name") not in {"sh", "bash", "zsh", "fish"}:
        raise ValueError(f"{entry['label']}: target is not an idle shell")
    if Path(foreground.get("cwd", "/nonexistent")).resolve() != Path(entry["pane"]["cwd"]).resolve():
        raise ValueError(f"{entry['label']}: target directory differs from the snapshot")
    if client.terminal(sid, bid, "modes").get("screen") == "alternate":
        raise ValueError(f"{entry['label']}: target has a fullscreen application")
    content = client.terminal(sid, bid, "format").get("content", "")
    last = next((line.strip() for line in reversed(content.splitlines()) if line.strip()), "")
    if last not in {"❯", "$", "%", "#", ">", "➜"} and not re.fullmatch(r"(?:ba|z|fi)?sh-[0-9.]+[$#%]", last):
        raise ValueError(f"{entry['label']}: cannot confirm an empty shell prompt. Clear any draft and retry.")
    return foreground["pid"]


def plan(client, snapshot):
    server = client.call("server.status")
    if not snapshot.get("host_id") or snapshot["host_id"] != server.get("host_id"):
        raise ValueError("Snapshot belongs to a different server state directory or host")
    # Capture-time warnings about non-agent programs are not resume actions.
    warnings = list(snapshot.get("warnings", [])) if snapshot.get("tracked") else []
    running = live_registrations(client, server)
    entries = []
    scheduled = set()
    for saved in snapshot["sessions"]:
        for window in saved["windows"]:
            for bid, pane in window["panes"].items():
                agent = pane.get("agent")
                identity = (agent["kind"], agent["session_id"]) if agent else None
                location = running.get(identity)
                if identity and not location:
                    if identity in scheduled:
                        raise ValueError("Snapshot maps the same conversation to multiple panes; inspect before resuming")
                    scheduled.add(identity)
                if location:
                    entries.append({"state": "running", "saved_block": bid, "agent": agent,
                                    "session_id": location[0], "block_id": location[1],
                                    "label": saved["label"] + " / " + window["label"]})
    for old, entry in targets(client, snapshot, running).items():
        agent = entry["pane"]["agent"]
        entry.update(saved_block=old, agent=agent)
        command = resume_command(entry["pane"], warnings)
        if command is None:
            entry["state"] = "unavailable"
        else:
            try:
                shell_pid = ready_shell(client, entry)
            except ValueError as error:
                entry["state"] = "unsafe"
                warnings.append(f"{error}; skipping this pane")
            else:
                entry.update(state="resume", command=command, shell_pid=shell_pid)
        entries.append(entry)
    return server, entries, warnings


def resume_key(snapshot, entry):
    if snapshot.get("tracked"):
        agent = entry["agent"]
        return entry["saved_block"] + "/" + agent["kind"] + "/" + agent["session_id"]
    return entry["saved_block"]


def restore(client, snapshot):
    """Resume only. Never create, close, rename, or focus a session or pane."""
    global _TRACE
    directory = state_root() / "diagnostics"
    directory.mkdir(mode=0o700, exist_ok=True)
    fd, filename = tempfile.mkstemp(prefix="resume-", suffix=".jsonl", dir=directory)
    print("Resume diagnostics: " + filename, flush=True)
    with os.fdopen(fd, "w") as log:
        _TRACE = log
        try:
            server, entries, warnings = plan(client, snapshot)
            trace("resume_start", snapshot=snapshot["id"], server_instance=server["instance_id"])
            journal_path = state_root() / "resumes" / (snapshot["id"] + "-" + server["instance_id"] + ".json")
            with locked():
                journal = read(journal_path, {})
                for entry in entries:
                    previous = journal.get(resume_key(snapshot, entry))
                    if (entry["state"] == "resume" and previous
                            and not (snapshot.get("tracked") and previous.get("state") == "confirmed")):
                        raise ValueError(f"{entry['label']}: previous launch is unconfirmed or already attempted. Inspect before retrying.")
                for entry in entries:
                    if entry["state"] != "resume":
                        key = resume_key(snapshot, entry)
                        if (entry["state"] == "running" and key in journal
                                and journal[key].get("block_id") == entry["block_id"]):
                            journal[key]["state"] = "confirmed"
                            atomic(journal_path, journal)
                        trace("agent_skipped", block_id=entry["block_id"], state=entry["state"])
                        continue
                    # Recheck immediately before each write. Registration hooks
                    # use this lock too, so release it before waiting for proof.
                    try:
                        if ready_shell(client, entry) != entry["shell_pid"]:
                            raise ValueError(f"{entry['label']}: target shell process changed")
                    except ValueError as error:
                        entry["state"] = "unsafe"
                        warnings.append(f"{error}; skipping this pane")
                        trace("agent_skipped", block_id=entry["block_id"], state=entry["state"])
                        continue
                    old = resume_key(snapshot, entry)
                    journal[old] = {"session_id": entry["session_id"], "block_id": entry["block_id"],
                                    "conversation": entry["agent"]["session_id"], "state": "attempted"}
                    atomic(journal_path, journal)
                    data = "\x1b[200~ " + shlex.join(entry["command"]) + "\x1b[201~\r"
                    trace("agent_write", block_id=entry["block_id"], kind=entry["agent"]["kind"])
                    result = client.call("com.superlogical.terminal.write", session_id=entry["session_id"],
                                         block_id=entry["block_id"], args={"data": data})
                    if result.get("bytes_written") != len(data.encode()):
                        raise RuntimeError("Partial or uncertain launch. Inspect the pane before retrying.")
            pending = [entry for entry in entries if entry["state"] == "resume"]
            deadline = time.monotonic() + 15
            while pending:
                running = live_registrations(client, server)
                for entry in list(pending):
                    identity = (entry["agent"]["kind"], entry["agent"]["session_id"])
                    if running.get(identity) == (entry["session_id"], entry["block_id"]):
                        with locked():
                            journal = read(journal_path, {})
                            journal[resume_key(snapshot, entry)]["state"] = "confirmed"
                            atomic(journal_path, journal)
                        trace("agent_confirmed", block_id=entry["block_id"])
                        pending.remove(entry)
                if not pending or time.monotonic() >= deadline:
                    break
                time.sleep(.3)
            for entry in pending:
                proc = client.terminal(entry["session_id"], entry["block_id"], "process")
                trace("agent_unconfirmed", block_id=entry["block_id"],
                      processes=[{k: p.get(k) for k in ("pid", "name", "path", "cwd")} for p in processes(proc)])
                warnings.append(f"{entry['label']}: launch not confirmed. Inspect this pane; no automatic retry.")
            return read(journal_path, {}), warnings
        except Exception as error:
            trace("resume_failed", error_type=type(error).__name__)
            raise
        finally:
            _TRACE = None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server")
    parser.add_argument("command", choices=["save", "preview", "restore", "track", "forget", "register-pi", "register-codex", "unregister-pi"])
    parser.add_argument("snapshot", nargs="?")
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()
    if args.command.startswith(("register-", "unregister-")) and not os.environ.get("REX_BLOCK"):
        return
    client = Client(args.server)
    if args.command in ("register-pi", "register-codex", "unregister-pi"):
        payload = json.load(sys.stdin)
        register(client, "codex" if args.command == "register-codex" else "pi", payload, args.command == "unregister-pi")
    elif args.command == "track":
        print(f"Tracked {track_running(client)} verified running agents")
    elif args.command == "forget":
        bid = args.snapshot or os.environ.get("REX_BLOCK")
        if not bid:
            raise ValueError("Supply a pane ID or run forget from the pane to forget")
        forget_agent(client, bid)
        print("Forgot tracked agent for " + bid)
    elif args.command == "save":
        snapshot = capture(client)
        print(f"Saved {snapshot['id']} with {len(snapshot['sessions'])} sessions")
        for warning in snapshot["warnings"]:
            print("Warning: " + warning)
    else:
        snapshot = load_snapshot(args.snapshot) if args.snapshot else tracked_snapshot(client)
        _, entries, warnings = plan(client, snapshot)
        for entry in entries:
            print(f"{entry['label']}: {entry['agent']['kind']} [{entry['state']}]")
        for warning in warnings:
            print("Warning: " + warning)
        if args.command == "restore":
            if not args.yes and input("Type restore to resume saved agents in existing panes: ").strip() != "restore":
                return
            journal, warnings = restore(client, snapshot)
            print(f"Resume finished. {sum(p.get('state') == 'confirmed' for p in journal.values())} agent launches confirmed.")
            for warning in warnings:
                print("Warning: " + warning)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.TimeoutExpired) as error:
        print("Rex workspace: " + str(error), file=sys.stderr)
        sys.exit(1)
