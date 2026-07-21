#!/usr/bin/env python3

import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
import uuid
from pathlib import Path
from typing import Any

import recent_pi_sessions
import recent_rollouts


OPEN_STATUSES = {
    "needs-discussion",
    "watching",
    "auto-fix-in-progress",
    "auto-fix-awaiting-review",
    "auto-fix-review-passed",
    "auto-fix-review-failed",
    "approved-for-implementation",
}
ALL_STATUSES = OPEN_STATUSES | {"resolved", "dismissed", "superseded"}
KINDS = {"objective-fix", "discussion", "watching"}
SCOPES = {"personal", "repo-local", "tool", "environment", "task-local"}
REVIEW_RESULTS = {"passed", "failed", "needs-discussion"}
DECISIONS = {"approve", "dismiss", "watch", "revise"}
TERMINAL_STATUSES = {"resolved", "dismissed", "superseded"}


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).isoformat()


def parse_timestamp(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def default_state_root() -> Path:
    base = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
    return base / "toolkit" / "harness-evaluation"


def connect(state_root: Path) -> sqlite3.Connection:
    state_root.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(state_root / "state.db")
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    initialize(connection)
    return connection


def initialize(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            scan_through TEXT NOT NULL,
            codex_since TEXT NOT NULL,
            pi_since TEXT NOT NULL,
            status TEXT NOT NULL,
            completed_at TEXT,
            report TEXT,
            scan_result_json TEXT
        );

        CREATE TABLE IF NOT EXISTS run_sessions (
            run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
            runtime TEXT NOT NULL,
            path TEXT NOT NULL,
            activity TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            PRIMARY KEY (run_id, runtime, path, activity)
        );

        CREATE TABLE IF NOT EXISTS findings (
            key TEXT PRIMARY KEY,
            skill TEXT NOT NULL,
            scope TEXT NOT NULL,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            repository TEXT,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            occurrences INTEGER NOT NULL,
            evidence_json TEXT NOT NULL,
            last_run_id TEXT REFERENCES runs(id),
            worktree TEXT,
            branch TEXT,
            commit_sha TEXT,
            validation TEXT,
            review_notes TEXT,
            decision_notes TEXT,
            resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            finding_key TEXT REFERENCES findings(key),
            at TEXT NOT NULL,
            event TEXT NOT NULL,
            note TEXT
        );
        """
    )
    run_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(runs)")
    }
    if "scan_result_json" not in run_columns:
        connection.execute("ALTER TABLE runs ADD COLUMN scan_result_json TEXT")
    connection.commit()


def get_meta(connection: sqlite3.Connection, key: str) -> str | None:
    row = connection.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_meta(connection: sqlite3.Connection, key: str, value: str) -> None:
    connection.execute(
        "INSERT INTO meta(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def add_event(
    connection: sqlite3.Connection,
    finding_key: str | None,
    event: str,
    note: str | None = None,
) -> None:
    connection.execute(
        "INSERT INTO events(finding_key, at, event, note) VALUES(?, ?, ?, ?)",
        (finding_key, iso(utc_now()), event, note),
    )


def begin_run(connection: sqlite3.Connection, hours: float, overlap_hours: float) -> dict[str, Any]:
    now = utc_now()
    run_id = f"{now.strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    since: dict[str, str] = {}
    for runtime in ("codex", "pi"):
        cursor = get_meta(connection, f"cursor_{runtime}")
        if cursor:
            start = parse_timestamp(cursor) - dt.timedelta(hours=overlap_hours)
        else:
            start = now - dt.timedelta(hours=hours)
            prior = connection.execute(
                f"SELECT MIN({runtime}_since) AS since FROM runs"
            ).fetchone()["since"]
            if prior:
                start = min(start, parse_timestamp(prior))
        since[runtime] = iso(start)
    connection.execute(
        "INSERT INTO runs(id, started_at, scan_through, codex_since, pi_since, status) "
        "VALUES(?, ?, ?, ?, ?, 'started')",
        (run_id, iso(now), iso(now), since["codex"], since["pi"]),
    )
    connection.commit()
    return {
        "run_id": run_id,
        "started_at": iso(now),
        "scan_through": iso(now),
        "codex_since": since["codex"],
        "pi_since": since["pi"],
    }


def load_run(connection: sqlite3.Connection, run_id: str) -> sqlite3.Row:
    row = connection.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise ValueError(f"unknown run: {run_id}")
    return row


def completed_snapshot_exists(
    connection: sqlite3.Connection, runtime: str, path: str, activity: str
) -> bool:
    row = connection.execute(
        """
        SELECT 1
        FROM run_sessions s
        JOIN runs r ON r.id = s.run_id
        WHERE r.status = 'completed' AND s.runtime = ? AND s.path = ? AND s.activity = ?
        LIMIT 1
        """,
        (runtime, path, activity),
    ).fetchone()
    return row is not None


def scan_run(
    connection: sqlite3.Connection,
    run_id: str,
    codex_root: Path,
    pi_root: Path,
) -> dict[str, Any]:
    run = load_run(connection, run_id)
    if run["status"] != "started":
        raise ValueError(f"run {run_id} is {run['status']}, not started")
    if run["scan_result_json"]:
        return json.loads(run["scan_result_json"])

    results: dict[str, Any] = {
        "run_id": run_id,
        "scan_through": run["scan_through"],
        "runtimes": {},
    }
    scan_through = parse_timestamp(run["scan_through"])

    pi_cutoff = parse_timestamp(run["pi_since"])
    pi_all = [
        summary
        for summary in recent_pi_sessions.scan_sessions(pi_root.expanduser(), pi_cutoff)
        if summary.activity <= scan_through
    ]
    pi_unseen = []
    for summary in pi_all:
        item = recent_pi_sessions.summary_dict(summary)
        if completed_snapshot_exists(connection, "pi", item["path"], item["activity"]):
            continue
        pi_unseen.append(item)
        connection.execute(
            "INSERT OR IGNORE INTO run_sessions VALUES(?, 'pi', ?, ?, ?)",
            (run_id, item["path"], item["activity"], json.dumps(item, sort_keys=True)),
        )
    results["runtimes"]["pi"] = {
        "root": str(pi_root.expanduser()),
        "since": run["pi_since"],
        "matched": len(pi_all),
        "unseen": len(pi_unseen),
        "sessions": pi_unseen,
    }

    codex_cutoff = parse_timestamp(run["codex_since"])
    codex_all = [
        item
        for item in recent_rollouts.iter_recent_rollouts(
            codex_root.expanduser(), codex_cutoff
        )
        if item[2] <= scan_through
    ]
    codex_unseen = []
    for path, started, activity, cwd in codex_all:
        item = {
            "path": str(path),
            "started": started.isoformat(),
            "activity": activity.isoformat(),
            "cwd": cwd,
            **recent_rollouts.summarize_rollout(path),
        }
        if completed_snapshot_exists(connection, "codex", item["path"], item["activity"]):
            continue
        codex_unseen.append(item)
        connection.execute(
            "INSERT OR IGNORE INTO run_sessions VALUES(?, 'codex', ?, ?, ?)",
            (run_id, item["path"], item["activity"], json.dumps(item, sort_keys=True)),
        )
    results["runtimes"]["codex"] = {
        "root": str(codex_root.expanduser()),
        "since": run["codex_since"],
        "matched": len(codex_all),
        "unseen": len(codex_unseen),
        "sessions": codex_unseen,
    }
    connection.execute(
        "UPDATE runs SET scan_result_json = ? WHERE id = ?",
        (json.dumps(results, sort_keys=True), run_id),
    )
    connection.commit()
    return results


def finish_run(connection: sqlite3.Connection, run_id: str, report: str | None) -> None:
    run = load_run(connection, run_id)
    if run["status"] != "started":
        raise ValueError(f"run {run_id} is {run['status']}, not started")
    completed = iso(utc_now())
    connection.execute(
        "UPDATE runs SET status = 'completed', completed_at = ?, report = ? WHERE id = ?",
        (completed, report, run_id),
    )
    set_meta(connection, "cursor_codex", run["scan_through"])
    set_meta(connection, "cursor_pi", run["scan_through"])
    connection.commit()


def fail_run(connection: sqlite3.Connection, run_id: str, note: str | None) -> None:
    run = load_run(connection, run_id)
    if run["status"] != "started":
        raise ValueError(f"run {run_id} is {run['status']}, not started")
    connection.execute(
        "UPDATE runs SET status = 'failed', completed_at = ?, report = ? WHERE id = ?",
        (iso(utc_now()), note, run_id),
    )
    connection.commit()


def parse_evidence(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        cleaned = value.strip()
        if cleaned and cleaned not in result:
            result.append(cleaned)
    return result


def record_finding(connection: sqlite3.Connection, args: argparse.Namespace) -> None:
    now = iso(utc_now())
    evidence = parse_evidence(args.evidence)
    existing = connection.execute("SELECT * FROM findings WHERE key = ?", (args.key,)).fetchone()
    if existing:
        combined = json.loads(existing["evidence_json"])
        for item in evidence:
            if item not in combined:
                combined.append(item)
        connection.execute(
            """
            UPDATE findings
            SET skill = ?, scope = ?, kind = ?, status = ?, title = ?, summary = ?,
                repository = COALESCE(?, repository), last_seen = ?,
                occurrences = occurrences + 1, evidence_json = ?, last_run_id = ?,
                resolved_at = NULL
            WHERE key = ?
            """,
            (
                args.skill,
                args.scope,
                args.kind,
                args.status,
                args.title,
                args.summary,
                args.repository,
                now,
                json.dumps(combined),
                args.run_id,
                args.key,
            ),
        )
        add_event(connection, args.key, "observed-again", args.summary)
    else:
        connection.execute(
            """
            INSERT INTO findings(
                key, skill, scope, kind, status, title, summary, repository,
                first_seen, last_seen, occurrences, evidence_json, last_run_id
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                args.key,
                args.skill,
                args.scope,
                args.kind,
                args.status,
                args.title,
                args.summary,
                args.repository,
                now,
                now,
                json.dumps(evidence),
                args.run_id,
            ),
        )
        add_event(connection, args.key, "created", args.summary)
    connection.commit()


def require_finding(connection: sqlite3.Connection, key: str) -> sqlite3.Row:
    row = connection.execute("SELECT * FROM findings WHERE key = ?", (key,)).fetchone()
    if row is None:
        raise ValueError(f"unknown finding: {key}")
    return row


def attach_change(connection: sqlite3.Connection, args: argparse.Namespace) -> None:
    require_finding(connection, args.key)
    connection.execute(
        """
        UPDATE findings
        SET status = 'auto-fix-awaiting-review', worktree = ?, branch = ?,
            commit_sha = ?, validation = ?, last_seen = ?, resolved_at = NULL
        WHERE key = ?
        """,
        (args.worktree, args.branch, args.commit, args.validation, iso(utc_now()), args.key),
    )
    add_event(connection, args.key, "change-attached", args.commit)
    connection.commit()


def review_result(connection: sqlite3.Connection, args: argparse.Namespace) -> None:
    require_finding(connection, args.key)
    status = {
        "passed": "auto-fix-review-passed",
        "failed": "auto-fix-review-failed",
        "needs-discussion": "needs-discussion",
    }[args.result]
    connection.execute(
        "UPDATE findings SET status = ?, review_notes = ?, last_seen = ? WHERE key = ?",
        (status, args.note, iso(utc_now()), args.key),
    )
    add_event(connection, args.key, f"review-{args.result}", args.note)
    connection.commit()


def decide(connection: sqlite3.Connection, args: argparse.Namespace) -> None:
    require_finding(connection, args.key)
    status = {
        "approve": "approved-for-implementation",
        "dismiss": "dismissed",
        "watch": "watching",
        "revise": "needs-discussion",
    }[args.decision]
    resolved_at = iso(utc_now()) if status == "dismissed" else None
    connection.execute(
        "UPDATE findings SET status = ?, decision_notes = ?, last_seen = ?, resolved_at = ? WHERE key = ?",
        (status, args.note, iso(utc_now()), resolved_at, args.key),
    )
    add_event(connection, args.key, f"decision-{args.decision}", args.note)
    connection.commit()


def close_finding(connection: sqlite3.Connection, args: argparse.Namespace) -> None:
    require_finding(connection, args.key)
    connection.execute(
        "UPDATE findings SET status = ?, decision_notes = COALESCE(?, decision_notes), "
        "last_seen = ?, resolved_at = ? WHERE key = ?",
        (args.status, args.note, iso(utc_now()), iso(utc_now()), args.key),
    )
    add_event(connection, args.key, args.status, args.note)
    connection.commit()


def finding_dict(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    result["evidence"] = json.loads(result.pop("evidence_json"))
    return result


def list_findings(
    connection: sqlite3.Connection,
    include_resolved: bool,
    since_last_human_review: bool,
) -> list[dict[str, Any]]:
    clauses = []
    values: list[str] = []
    placeholders = ",".join("?" for _ in OPEN_STATUSES)
    open_values = sorted(OPEN_STATUSES)
    reviewed = get_meta(connection, "last_human_review") if since_last_human_review else None
    if not include_resolved:
        clauses.append(f"status IN ({placeholders})")
        values.extend(open_values)
    elif reviewed:
        clauses.append(f"(status IN ({placeholders}) OR last_seen >= ?)")
        values.extend(open_values)
        values.append(reviewed)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = connection.execute(
        f"SELECT * FROM findings {where} ORDER BY first_seen, key", values
    ).fetchall()
    return [finding_dict(row) for row in rows]


def print_queue(findings: list[dict[str, Any]]) -> None:
    print(f"Harness evaluation findings: {len(findings)}")
    grouped: dict[str, list[dict[str, Any]]] = {}
    for finding in findings:
        grouped.setdefault(finding["status"], []).append(finding)
    for status in sorted(grouped):
        print(f"\n## {status}")
        for finding in grouped[status]:
            print(f"- [{finding['key']}] {finding['title']}")
            print(
                f"  skill={finding['skill']} scope={finding['scope']} "
                f"occurrences={finding['occurrences']} last={finding['last_seen']}"
            )
            print(f"  {finding['summary']}")
            if finding["worktree"] or finding["commit_sha"]:
                print(
                    f"  change: worktree={finding['worktree'] or '-'} "
                    f"branch={finding['branch'] or '-'} commit={finding['commit_sha'] or '-'}"
                )
            for evidence in finding["evidence"][-3:]:
                print(f"  evidence: {evidence}")


def pending_auto(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        "SELECT * FROM findings WHERE status IN "
        "('auto-fix-awaiting-review', 'auto-fix-review-passed', 'auto-fix-review-failed') "
        "ORDER BY first_seen, key"
    ).fetchall()
    return [finding_dict(row) for row in rows]


def mark_human_review(connection: sqlite3.Connection, note: str | None) -> str:
    now = iso(utc_now())
    set_meta(connection, "last_human_review", now)
    add_event(connection, None, "human-review", note)
    connection.commit()
    return now


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Persist harness evaluation runs and decisions.")
    parser.add_argument(
        "--state-root",
        type=Path,
        default=default_state_root(),
        help="State directory. Defaults to $XDG_STATE_HOME/toolkit/harness-evaluation.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init")

    begin = subparsers.add_parser("begin-run")
    begin.add_argument("--hours", type=float, default=24.0)
    begin.add_argument("--overlap-hours", type=float, default=1.0)
    begin.add_argument("--json", action="store_true")

    scan = subparsers.add_parser("scan")
    scan.add_argument("--run-id", required=True)
    scan.add_argument("--codex-root", type=Path, default=Path.home() / ".codex" / "sessions")
    scan.add_argument("--pi-root", type=Path, default=Path.home() / ".pi" / "agent" / "sessions")
    scan.add_argument("--json", action="store_true")

    finish = subparsers.add_parser("finish-run")
    finish.add_argument("--run-id", required=True)
    finish.add_argument("--report")

    fail = subparsers.add_parser("fail-run")
    fail.add_argument("--run-id", required=True)
    fail.add_argument("--note")

    record = subparsers.add_parser("record-finding")
    record.add_argument("--key", required=True)
    record.add_argument("--skill", required=True)
    record.add_argument("--scope", choices=sorted(SCOPES), required=True)
    record.add_argument("--kind", choices=sorted(KINDS), required=True)
    record.add_argument("--status", choices=sorted(ALL_STATUSES), required=True)
    record.add_argument("--title", required=True)
    record.add_argument("--summary", required=True)
    record.add_argument("--repository")
    record.add_argument("--evidence", action="append", default=[])
    record.add_argument("--run-id")

    attach = subparsers.add_parser("attach-change")
    attach.add_argument("--key", required=True)
    attach.add_argument("--worktree", required=True)
    attach.add_argument("--branch")
    attach.add_argument("--commit", required=True)
    attach.add_argument("--validation", required=True)

    review = subparsers.add_parser("review-result")
    review.add_argument("--key", required=True)
    review.add_argument("--result", choices=sorted(REVIEW_RESULTS), required=True)
    review.add_argument("--note", required=True)

    decision = subparsers.add_parser("decide")
    decision.add_argument("--key", required=True)
    decision.add_argument("--decision", choices=sorted(DECISIONS), required=True)
    decision.add_argument("--note", required=True)

    close = subparsers.add_parser("close")
    close.add_argument("--key", required=True)
    close.add_argument("--status", choices=sorted(TERMINAL_STATUSES), required=True)
    close.add_argument("--note")

    queue = subparsers.add_parser("queue")
    queue.add_argument("--include-resolved", action="store_true")
    queue.add_argument("--since-last-human-review", action="store_true")
    queue.add_argument("--json", action="store_true")

    pending = subparsers.add_parser("pending-auto")
    pending.add_argument("--json", action="store_true")

    human = subparsers.add_parser("mark-human-review")
    human.add_argument("--note")

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    connection = connect(args.state_root.expanduser())
    try:
        if args.command == "init":
            print(args.state_root.expanduser())
        elif args.command == "begin-run":
            result = begin_run(connection, args.hours, args.overlap_hours)
            print(json.dumps(result, indent=2) if args.json else result["run_id"])
        elif args.command == "scan":
            result = scan_run(connection, args.run_id, args.codex_root, args.pi_root)
            if args.json:
                print(json.dumps(result, indent=2))
            else:
                for runtime, data in result["runtimes"].items():
                    print(
                        f"{runtime}: {data['unseen']} unseen of {data['matched']} matched "
                        f"since {data['since']}"
                    )
        elif args.command == "finish-run":
            finish_run(connection, args.run_id, args.report)
        elif args.command == "fail-run":
            fail_run(connection, args.run_id, args.note)
        elif args.command == "record-finding":
            if args.run_id:
                load_run(connection, args.run_id)
            record_finding(connection, args)
        elif args.command == "attach-change":
            attach_change(connection, args)
        elif args.command == "review-result":
            review_result(connection, args)
        elif args.command == "decide":
            decide(connection, args)
        elif args.command == "close":
            close_finding(connection, args)
        elif args.command == "queue":
            findings = list_findings(
                connection, args.include_resolved, args.since_last_human_review
            )
            print(json.dumps(findings, indent=2) if args.json else "", end="")
            if not args.json:
                print_queue(findings)
        elif args.command == "pending-auto":
            findings = pending_auto(connection)
            print(json.dumps(findings, indent=2) if args.json else "", end="")
            if not args.json:
                print_queue(findings)
        elif args.command == "mark-human-review":
            print(mark_human_review(connection, args.note))
        return 0
    except (OSError, ValueError, sqlite3.Error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
