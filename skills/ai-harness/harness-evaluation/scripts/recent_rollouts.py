#!/usr/bin/env python3

import argparse
import datetime as dt
import json
import os
import re
from pathlib import Path


RECOVERY_PAT = re.compile(
    r"\b(stale|missing|fallback|falling back|retry|recover|drift|trust gate|no such)\b",
    re.IGNORECASE,
)
EXIT_PAT = re.compile(r"^Process exited with code ([1-9][0-9]*)$", re.MULTILINE)
SKILL_TAG_PAT = re.compile(r"<name>([^<]+)</name>")
SKILL_PATH_PAT = re.compile(r"/([^/]+)/SKILL\.md")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize recent Codex rollout files without session_meta noise."
    )
    parser.add_argument(
        "--root",
        default=f"{os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))}/sessions",
        help="Session root to scan. Defaults to ${CODEX_HOME:-$HOME/.codex}/sessions.",
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


def latest_activity(path: Path, started: dt.datetime) -> dt.datetime:
    activity = started
    with path.open(errors="replace") as handle:
        for line in handle:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            payload = obj.get("payload", {})
            is_message = (
                obj.get("type") == "response_item"
                and payload.get("type") == "message"
                and payload.get("role") in {"user", "assistant"}
            )
            is_agent_message = (
                obj.get("type") == "event_msg"
                and payload.get("type") == "agent_message"
            )
            if not (is_message or is_agent_message):
                continue
            timestamp = obj.get("timestamp")
            if not isinstance(timestamp, str):
                continue
            try:
                activity = max(activity, parse_timestamp(timestamp))
            except ValueError:
                continue
    return activity


def iter_recent_rollouts(root: Path, cutoff: dt.datetime):
    for path in sorted(root.rglob("*.jsonl")):
        try:
            with path.open() as handle:
                first_line = handle.readline()
            first = json.loads(first_line)
        except Exception:
            continue
        if first.get("type") != "session_meta":
            continue
        payload = first.get("payload", {})
        timestamp = payload.get("timestamp")
        if not timestamp:
            continue
        started = parse_timestamp(timestamp)
        activity = latest_activity(path, started)
        if activity >= cutoff:
            yield path, started, activity, payload.get("cwd", "")


def clean_text(text: str) -> str:
    return " ".join(text.split())


def stringify(value) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(stringify(item) for item in value)
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True)
    return str(value)


def summarize_rollout(path: Path) -> dict:
    asks = []
    skills = []
    failures = []
    recoveries = []

    with path.open() as handle:
        for line in handle:
            try:
                obj = json.loads(line)
            except Exception:
                continue

            if obj.get("type") == "response_item":
                payload = obj.get("payload", {})
                item_type = payload.get("type")
                if item_type == "message" and payload.get("role") == "user":
                    texts = [
                        chunk.get("text", "")
                        for chunk in payload.get("content", [])
                        if chunk.get("type") in {"input_text", "output_text"}
                    ]
                    text = clean_text(" ".join(texts))
                    if text and not text.startswith("# AGENTS.md instructions"):
                        asks.append(text)
                        skills.extend(SKILL_TAG_PAT.findall(text))
                elif item_type == "function_call" and payload.get("name") == "exec_command":
                    matches = SKILL_PATH_PAT.findall(payload.get("arguments", ""))
                    skills.extend(matches)
                elif item_type == "function_call_output":
                    output = stringify(payload.get("output", ""))
                    header = "\n".join(output.splitlines()[:5])
                    match = EXIT_PAT.search(header)
                    if match:
                        head = " | ".join(header.splitlines())
                        failures.append(clean_text(head))
            elif obj.get("type") == "event_msg":
                event = obj.get("payload", {})
                if event.get("type") == "agent_message":
                    message = clean_text(event.get("message", ""))
                    if RECOVERY_PAT.search(message):
                        recoveries.append(message)

    deduped_skills = []
    for skill in skills:
        if skill not in deduped_skills:
            deduped_skills.append(skill)

    return {
        "ask": asks[0] if asks else "(none)",
        "followups": asks[1:],
        "skills": deduped_skills,
        "failures": failures,
        "recoveries": recoveries,
    }


def main() -> int:
    args = parse_args()
    now = dt.datetime.now(dt.timezone.utc)
    cutoff = parse_timestamp(args.since) if args.since else now - dt.timedelta(hours=args.hours)
    root = Path(args.root).expanduser()

    rollouts = list(iter_recent_rollouts(root, cutoff))
    summarized = []
    for path, started, activity, cwd in rollouts:
        summarized.append({
            "path": str(path),
            "started": started.isoformat(),
            "activity": activity.isoformat(),
            "cwd": cwd,
            **summarize_rollout(path),
        })
    if args.json:
        print(json.dumps({
            "runtime": "codex",
            "root": str(root),
            "cutoff": cutoff.isoformat(),
            "count": len(summarized),
            "sessions": summarized,
        }, indent=2))
        return 0
    window = f"since {cutoff.isoformat()}" if args.since else f"from the last {args.hours:g}h"
    print(
        f"Recent Codex sessions {window} by latest user/assistant activity: {len(summarized)}"
    )

    for item in summarized:
        summary = item
        print()
        print(item["path"])
        print(f"  started: {item['started']}")
        print(f"  latest activity: {item['activity']}")
        print(f"  cwd: {item['cwd'] or '(unknown)'}")
        print(f"  ask: {summary['ask'][:220]}")
        if summary["followups"]:
            print("  user follow-ups:")
            for followup in summary["followups"][:5]:
                print(f"    - {followup[:220]}")
        if summary["skills"]:
            print(f"  skills: {', '.join(summary['skills'][:6])}")
        if summary["failures"]:
            print("  failures:")
            for failure in summary["failures"][:5]:
                print(f"    - {failure[:220]}")
        if summary["recoveries"]:
            print("  recoveries:")
            for recovery in summary["recoveries"][:3]:
                print(f"    - {recovery[:220]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
