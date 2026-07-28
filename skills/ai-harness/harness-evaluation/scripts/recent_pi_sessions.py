#!/usr/bin/env python3

import argparse
import datetime as dt
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CURRENT_SESSION_VERSION = 3
KNOWN_SESSION_VERSIONS = {1, 2, 3}
RECOVERY_PAT = re.compile(
    r"\b(stale|missing|fallback|falling back|retry|recover|drift|trust gate|no such)\b",
    re.IGNORECASE,
)
SKILL_TAG_PAT = re.compile(r"<skill\b[^>]*\bname=[\"']([^\"']+)[\"']", re.IGNORECASE)
SKILL_BLOCK_PAT = re.compile(r"<skill\b[^>]*>.*?</skill>", re.IGNORECASE | re.DOTALL)


@dataclass
class ParsedSession:
    path: Path
    header: dict[str, Any]
    entries: list[dict[str, Any]]
    malformed_lines: int


@dataclass
class SessionSummary:
    path: Path
    started: dt.datetime
    activity: dt.datetime
    cwd: str
    version: int
    total_entries: int
    active_entries: int
    ask: str
    followups: list[str]
    skills: list[str]
    failures: list[str]
    recoveries: list[str]
    warnings: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize recent Pi agent sessions on their active branches."
    )
    parser.add_argument(
        "--root",
        default=os.environ.get(
            "PI_SESSION_DIR", str(Path.home() / ".pi" / "agent" / "sessions")
        ),
        help="Session root to scan. Defaults to $PI_SESSION_DIR or ~/.pi/agent/sessions.",
    )
    parser.add_argument(
        "--hours",
        type=float,
        default=24.0,
        help="How many recent hours to include based on latest user/assistant activity.",
    )
    parser.add_argument(
        "--since",
        help="Include activity at or after this ISO-8601 timestamp instead of --hours.",
    )
    parser.add_argument(
        "--until",
        help="Exclude activity after this ISO-8601 timestamp.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON instead of the human summary.",
    )
    return parser.parse_args()


def parse_timestamp(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


def clean_text(text: str) -> str:
    return " ".join(text.split())


def message_text(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return "\n".join(
        item.get("text", "")
        for item in content
        if isinstance(item, dict) and item.get("type") == "text"
    )


def read_session(path: Path) -> ParsedSession | None:
    rows: list[dict[str, Any]] = []
    malformed_lines = 0
    with path.open(errors="replace") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                malformed_lines += 1
                continue
            if isinstance(value, dict):
                rows.append(value)

    if not rows or rows[0].get("type") != "session":
        return None

    header = rows[0]
    entries = normalize_entries(rows[1:], int(header.get("version", 1)))
    return ParsedSession(path, header, entries, malformed_lines)


def normalize_entries(
    entries: list[dict[str, Any]], version: int
) -> list[dict[str, Any]]:
    if version != 1:
        return [entry for entry in entries if entry.get("id")]

    normalized: list[dict[str, Any]] = []
    previous_id: str | None = None
    for index, entry in enumerate(entries):
        copied = dict(entry)
        copied.setdefault("id", f"v1-{index}")
        copied.setdefault("parentId", previous_id)
        previous_id = copied["id"]
        normalized.append(copied)
    return normalized


def active_branch(
    entries: list[dict[str, Any]], through: dt.datetime | None = None
) -> tuple[list[dict[str, Any]], list[str]]:
    if not entries:
        return [], []

    by_id = {entry["id"]: entry for entry in entries}
    if through is None:
        current = entries[-1]
    else:
        current = None
        for entry in reversed(entries):
            timestamp = entry.get("timestamp")
            if not isinstance(timestamp, str):
                continue
            try:
                if parse_timestamp(timestamp) <= through:
                    current = entry
                    break
            except ValueError:
                continue
        if current is None:
            return [], []
    branch: list[dict[str, Any]] = []
    seen: set[str] = set()
    warnings: list[str] = []

    while current:
        entry_id = current["id"]
        if entry_id in seen:
            warnings.append(f"active branch contains a cycle at entry {entry_id}")
            break
        seen.add(entry_id)
        branch.append(current)
        parent_id = current.get("parentId")
        if not parent_id:
            break
        parent = by_id.get(parent_id)
        if parent is None:
            warnings.append(f"active branch is missing parent entry {parent_id}")
            break
        current = parent

    branch.reverse()
    return branch, warnings


def latest_activity(entries: list[dict[str, Any]]) -> dt.datetime | None:
    timestamps: list[dt.datetime] = []
    for entry in entries:
        if entry.get("type") != "message":
            continue
        role = entry.get("message", {}).get("role")
        if role not in {"user", "assistant"}:
            continue
        timestamp = entry.get("timestamp")
        if not isinstance(timestamp, str):
            continue
        try:
            timestamps.append(parse_timestamp(timestamp))
        except ValueError:
            continue
    return max(timestamps) if timestamps else None


def skill_from_read_path(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    path = Path(value)
    if path.name == "SKILL.md":
        return path.parent.name
    if path.name.endswith("-SKILL.md"):
        return path.name[: -len("-SKILL.md")]
    return None


def dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value and value not in result:
            result.append(value)
    return result


def entries_through(
    entries: list[dict[str, Any]], through: dt.datetime | None
) -> list[dict[str, Any]]:
    if through is None:
        return entries

    bounded: list[dict[str, Any]] = []
    for entry in entries:
        timestamp = entry.get("timestamp")
        if not isinstance(timestamp, str):
            continue
        try:
            if parse_timestamp(timestamp) <= through:
                bounded.append(entry)
        except ValueError:
            continue
    return bounded


def summarize_session(
    parsed: ParsedSession, through: dt.datetime | None = None
) -> SessionSummary | None:
    bounded_entries = entries_through(parsed.entries, through)
    branch, warnings = active_branch(bounded_entries)
    activity = latest_activity(branch)
    if activity is None:
        return None

    version = int(parsed.header.get("version", 1))
    if version not in KNOWN_SESSION_VERSIONS:
        warnings.append(
            f"unsupported session version {version}; current Pi version is {CURRENT_SESSION_VERSION}"
        )
    if parsed.malformed_lines and through is None:
        warnings.append(f"skipped {parsed.malformed_lines} malformed JSON line(s)")

    asks: list[str] = []
    skills: list[str] = []
    failures: list[str] = []
    recoveries: list[str] = []

    for entry in branch:
        if entry.get("type") != "message":
            continue
        message = entry.get("message", {})
        role = message.get("role")

        if role == "user":
            text = message_text(message)
            skills.extend(SKILL_TAG_PAT.findall(text))
            ask = clean_text(SKILL_BLOCK_PAT.sub("", text))
            if ask:
                asks.append(ask)
        elif role == "assistant":
            visible_text = clean_text(message_text(message))
            if visible_text and RECOVERY_PAT.search(visible_text):
                recoveries.append(visible_text)
            content = message.get("content", [])
            if not isinstance(content, list):
                continue
            for item in content:
                if not isinstance(item, dict) or item.get("type") != "toolCall":
                    continue
                if item.get("name") != "read":
                    continue
                arguments = item.get("arguments", {})
                if not isinstance(arguments, dict):
                    continue
                skill = skill_from_read_path(
                    arguments.get("path")
                    or arguments.get("file_path")
                    or arguments.get("filePath")
                )
                if skill:
                    skills.append(skill)
        elif role == "toolResult" and message.get("isError") is True:
            tool_name = message.get("toolName") or "unknown tool"
            detail = clean_text(message_text(message)) or "(no visible error text)"
            failures.append(f"{tool_name}: {detail}")

    try:
        started = parse_timestamp(parsed.header["timestamp"])
    except (KeyError, TypeError, ValueError):
        started = activity
        warnings.append("session header has no valid start timestamp")

    return SessionSummary(
        path=parsed.path,
        started=started,
        activity=activity,
        cwd=str(parsed.header.get("cwd", "")),
        version=version,
        total_entries=len(bounded_entries),
        active_entries=len(branch),
        ask=asks[0] if asks else "(none)",
        followups=asks[1:],
        skills=dedupe(skills),
        failures=failures,
        recoveries=recoveries,
        warnings=warnings,
    )


def scan_sessions(
    root: Path, cutoff: dt.datetime, through: dt.datetime | None = None
) -> list[SessionSummary]:
    summaries: list[SessionSummary] = []
    for path in sorted(root.rglob("*.jsonl")):
        try:
            parsed = read_session(path)
        except OSError:
            continue
        if parsed is None:
            continue
        summary = summarize_session(parsed, through)
        if summary is not None and summary.activity >= cutoff:
            summaries.append(summary)
    return sorted(summaries, key=lambda item: (item.activity, str(item.path)))


def summary_dict(summary: SessionSummary) -> dict[str, Any]:
    return {
        "path": str(summary.path),
        "started": summary.started.isoformat(),
        "activity": summary.activity.isoformat(),
        "cwd": summary.cwd,
        "version": summary.version,
        "total_entries": summary.total_entries,
        "active_entries": summary.active_entries,
        "ask": summary.ask,
        "followups": summary.followups,
        "skills": summary.skills,
        "failures": summary.failures,
        "recoveries": summary.recoveries,
        "warnings": summary.warnings,
    }


def print_summary(summary: SessionSummary) -> None:
    print()
    print(summary.path)
    print(f"  started: {summary.started.isoformat()}")
    print(f"  latest activity: {summary.activity.isoformat()}")
    print(f"  cwd: {summary.cwd or '(unknown)'}")
    print(f"  ask: {summary.ask[:220]}")
    if summary.followups:
        print("  user follow-ups:")
        for followup in summary.followups[:5]:
            print(f"    - {followup[:220]}")
    print(f"  active branch entries: {summary.active_entries}/{summary.total_entries}")
    if summary.skills:
        print(f"  skills: {', '.join(summary.skills[:8])}")
    if summary.failures:
        print("  failures:")
        for failure in summary.failures[:5]:
            print(f"    - {failure[:220]}")
    if summary.recoveries:
        print("  recoveries:")
        for recovery in summary.recoveries[:3]:
            print(f"    - {recovery[:220]}")
    if summary.warnings:
        print("  warnings:")
        for warning in summary.warnings:
            print(f"    - {warning}")


def main() -> int:
    args = parse_args()
    now = dt.datetime.now(dt.timezone.utc)
    through = parse_timestamp(args.until) if args.until else now
    cutoff = (
        parse_timestamp(args.since)
        if args.since
        else through - dt.timedelta(hours=args.hours)
    )
    if through < cutoff:
        raise SystemExit("--until must be at or after --since")
    root = Path(args.root).expanduser()
    summaries = scan_sessions(root, cutoff, through)
    if args.json:
        print(
            json.dumps(
                {
                    "runtime": "pi",
                    "root": str(root),
                    "cutoff": cutoff.isoformat(),
                    "through": through.isoformat(),
                    "count": len(summaries),
                    "resumed_count": sum(
                        summary.started < cutoff for summary in summaries
                    ),
                    "sessions": [
                        {
                            **summary_dict(summary),
                            "resumed": summary.started < cutoff,
                        }
                        for summary in summaries
                    ],
                },
                indent=2,
            )
        )
        return 0
    window = f"from {cutoff.isoformat()} through {through.isoformat()}"
    print(
        f"Recent Pi sessions {window} by latest user/assistant activity: {len(summaries)}"
    )
    for summary in summaries:
        print_summary(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
