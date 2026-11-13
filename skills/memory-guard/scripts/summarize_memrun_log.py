#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def fmt_size(size: int) -> str:
    for label, scale in (("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
        if size >= scale:
            return f"{size / scale:.1f} {label}"
    return f"{size} B"


def load_events(path: Path) -> list[dict]:
    events = []
    with path.open(encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_no}: invalid JSON: {exc}") from exc
    return events


def top_process(event: dict) -> dict | None:
    processes = event.get("processes") or event.get("peak_processes") or []
    if not processes:
        return None
    return max(processes, key=lambda proc: int(proc.get("memory") or proc.get("rss") or 0))


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: summarize_memrun_log.py <memrun.jsonl>")

    path = Path(sys.argv[1]).expanduser()
    events = load_events(path)
    if not events:
        raise SystemExit(f"{path}: empty log")

    start = next((event for event in events if event.get("event") == "start"), {})
    kill = next((event for event in events if event.get("event") == "kill"), None)
    exit_event = next((event for event in reversed(events) if event.get("event") == "exit"), None)
    interrupt = next((event for event in events if event.get("event") == "interrupt"), None)
    rss_events = [event for event in events if event.get("event") == "rss"]
    sample_events = [event for event in events if event.get("event") == "sample"]

    peak_event = None
    if rss_events:
        peak_event = max(rss_events, key=lambda event: int(event.get("total_rss") or 0))
    for terminal_event in (exit_event, interrupt):
        if terminal_event and int(terminal_event.get("peak_rss") or 0) > int(
            (peak_event or {}).get("total_rss") or (peak_event or {}).get("peak_rss") or 0
        ):
            peak_event = terminal_event
    if kill and int(kill.get("total_rss") or 0) >= int((peak_event or {}).get("total_rss") or 0):
        peak_event = kill

    peak_rss = int((peak_event or {}).get("total_rss") or (peak_event or {}).get("peak_rss") or 0)
    proc = top_process(peak_event or {})

    print(f"log: {path}")
    if start:
        print(f"command: {' '.join(start.get('command') or [])}")
        print(f"cwd: {start.get('cwd', '')}")
        print(f"rss_limit: {fmt_size(int(start.get('rss_limit') or 0))}")
        print(f"sample_at: {fmt_size(int(start.get('sample_at') or 0))}")
    outcome = "killed" if kill else "interrupted" if interrupt else "exited" if exit_event else "incomplete"
    print(f"outcome: {outcome}")
    if exit_event:
        print(f"returncode: {exit_event.get('returncode')}")
    print(f"peak_rss: {fmt_size(peak_rss)}")
    memory_events = [event for event in events if event.get("total_memory") is not None or event.get("peak_memory") is not None]
    if memory_events:
        memory_peak = max(memory_events, key=lambda event: int(event.get("total_memory") or event.get("peak_memory") or 0))
        print(f"memory_metric: {start.get('memory_metric', 'rss')}")
        print(f"peak_memory: {fmt_size(int(memory_peak.get('total_memory') or memory_peak.get('peak_memory') or 0))}")
        proc = top_process(memory_peak)
    if proc:
        print(f"largest_pid: {proc.get('pid')}")
        print(f"largest_rss: {fmt_size(int(proc.get('rss') or 0))}")
        if proc.get("physical_footprint") is not None:
            print(f"largest_physical_footprint: {fmt_size(int(proc['physical_footprint']))}")
        print(f"largest_command: {proc.get('command', '')}")
    if sample_events:
        for sample in sample_events:
            print(f"sample: {sample.get('path')}")
    else:
        print("sample: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
