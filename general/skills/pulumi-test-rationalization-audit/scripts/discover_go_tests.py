#!/usr/bin/env python3
"""
Discover top-level Go tests and emit a JSON inventory.

This intentionally stays simple:
- it scans *_test.go files
- it finds top-level func TestXxx(t *testing.T) declarations
- it ignores subtests and benchmarks
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

TEST_RE = re.compile(r"^func (Test\w+)\(t \*testing\.T\) \{$", re.MULTILINE)
BLOCK_COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")


def strip_block_comments(source: str) -> str:
    return BLOCK_COMMENT_RE.sub("", source)


def discover_tests(root: Path, pattern: str) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for file_path in sorted(root.rglob(pattern)):
        if not file_path.is_file():
            continue
        source = strip_block_comments(file_path.read_text(encoding="utf-8"))
        for match in TEST_RE.finditer(source):
            line = source[: match.start()].count("\n") + 1
            records.append(
                {
                    "test": match.group(1),
                    "file": file_path.name,
                    "path": str(file_path),
                    "line": line,
                }
            )
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs="+", help="Root directories to scan")
    parser.add_argument("--glob", default="*_test.go", help="File glob to scan")
    parser.add_argument("--output", help="Write JSON to this path instead of stdout")
    args = parser.parse_args()

    all_records: list[dict[str, object]] = []
    for raw_root in args.roots:
        root = Path(raw_root).expanduser().resolve()
        all_records.extend(discover_tests(root, args.glob))

    all_records.sort(key=lambda item: (str(item["path"]), int(item["line"])))
    payload = json.dumps(all_records, indent=2) + "\n"

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
