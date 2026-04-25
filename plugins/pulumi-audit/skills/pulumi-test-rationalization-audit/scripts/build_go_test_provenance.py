#!/usr/bin/env python3
"""
Build machine-readable provenance for Go test suites in Pulumi repos.

This script is intentionally generic but opinionated:
- read repo-audit.yaml
- discover top-level Go tests
- trace introducing commits from git history
- resolve commits to PRs with gh api
- materialize joined JSON for report generation
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any

import yaml

TEST_RE = re.compile(r"^func (Test\w+)\(t \*testing\.T\) \{$", re.MULTILINE)
BLOCK_COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/")


def strip_block_comments(source: str) -> str:
    return BLOCK_COMMENT_RE.sub("", source)


def load_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"expected mapping in {path}")
    return data


def resolve_path(base_dir: Path, raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return (base_dir / path).resolve()


def run(repo_root: Path, argv: list[str]) -> str:
    return subprocess.check_output(argv, cwd=repo_root, text=True, stderr=subprocess.DEVNULL)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [json.loads(line) for line in lines]


def append_jsonl(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value) + "\n")


def parse_pr_number_from_subject(subject: str | None) -> int | None:
    if not subject:
        return None
    match = re.search(r"\(#(\d+)\)$", subject)
    return int(match.group(1)) if match else None


def parse_intro_line(line: str | None) -> dict[str, Any]:
    if not line:
        return {"intro_commit": None, "intro_subject": None, "intro_pr_hint": None}
    tab = line.find("\t")
    intro_commit = line if tab == -1 else line[:tab]
    intro_subject = None if tab == -1 else line[tab + 1 :]
    return {
        "intro_commit": intro_commit,
        "intro_subject": intro_subject,
        "intro_pr_hint": parse_pr_number_from_subject(intro_subject),
    }


def git_log_for_intro(repo_root: Path, regex: str, paths: list[str]) -> str:
    try:
        return run(
            repo_root,
            [
                "git",
                "log",
                "--all",
                "--reverse",
                "-G",
                regex,
                "--format=%H%x09%s",
                "--",
                *paths,
            ],
        )
    except subprocess.CalledProcessError:
        return ""


def first_nonempty_line(output: str) -> str | None:
    for line in output.splitlines():
        line = line.strip()
        if line:
            return line
    return None


def discover_tests(repo_root: Path, roots: list[str], include_patterns: list[str]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for raw_root in roots:
        root = resolve_path(repo_root, raw_root)
        for pattern in include_patterns:
            for file_path in sorted(root.rglob(pattern)):
                if not file_path.is_file():
                    continue
                source = strip_block_comments(file_path.read_text(encoding="utf-8"))
                relative_path = file_path.relative_to(repo_root).as_posix()
                for match in TEST_RE.finditer(source):
                    line = source[: match.start()].count("\n") + 1
                    records.append(
                        {
                            "test": match.group(1),
                            "file": file_path.name,
                            "path": relative_path,
                            "line": line,
                        }
                    )
    records.sort(key=lambda item: (str(item["path"]), int(item["line"])))
    return records


def moved_hint_paths(test_path: str, moved_hints: list[dict[str, Any]]) -> list[str]:
    extra: list[str] = []
    for hint in moved_hints:
        match = str(hint.get("match", ""))
        if match and test_path.endswith(match):
            for candidate in hint.get("also_search", []):
                extra.append(str(candidate))
    return extra


def find_intro_commit(repo_root: Path, test: dict[str, Any], moved_hints: list[dict[str, Any]]) -> dict[str, Any]:
    regex = rf"func {re.escape(str(test['test']))}\(t \*testing\.T\)"
    extra_paths = moved_hint_paths(str(test["path"]), moved_hints)
    search_paths = [str(test["path"]), *extra_paths]
    return parse_intro_line(first_nonempty_line(git_log_for_intro(repo_root, regex, search_paths)))


def fetch_commit_prs(repo_root: Path, repo_slug: str, commit: str) -> list[dict[str, Any]]:
    output = run(
        repo_root,
        [
            "gh",
            "api",
            "-H",
            "Accept: application/vnd.github+json",
            f"/repos/{repo_slug}/commits/{commit}/pulls",
        ],
    )
    payload = json.loads(output)
    if not isinstance(payload, list):
        return []
    return [{"number": item["number"], "title": item["title"], "url": item["html_url"]} for item in payload]


def config_paths(config_path: Path, config: dict[str, Any]) -> dict[str, Path]:
    config_dir = config_path.parent
    path_cfg = config.get("paths", {})
    report_cfg = config.get("report", {})
    return {
        "introductions_jsonl": resolve_path(config_dir, str(path_cfg.get("introductions_jsonl", "test-introductions.jsonl"))),
        "commit_prs_jsonl": resolve_path(config_dir, str(path_cfg.get("commit_prs_jsonl", "commit-prs.jsonl"))),
        "machine_json": resolve_path(config_dir, str(report_cfg.get("machine_json_path", "test-provenance.json"))),
    }


def scan_tests(repo_root: Path, config: dict[str, Any], paths: dict[str, Path], limit: int | None, rewrite: bool) -> None:
    if rewrite:
        paths["introductions_jsonl"].unlink(missing_ok=True)
    existing = [] if rewrite else read_jsonl(paths["introductions_jsonl"])
    seen = {f"{row['file']}:{row['test']}" for row in existing}

    discovery = config.get("discovery", {})
    tests = discover_tests(
        repo_root,
        [str(item) for item in discovery.get("roots", ["examples"])],
        [str(item) for item in discovery.get("include", ["*_test.go"])],
    )
    pending = [test for test in tests if f"{test['file']}:{test['test']}" not in seen]
    if limit is not None:
        pending = pending[:limit]

    moved_hints = list(config.get("history", {}).get("moved_path_hints", []))
    for test in pending:
        intro = find_intro_commit(repo_root, test, moved_hints)
        record = {**test, **intro}
        append_jsonl(paths["introductions_jsonl"], record)


def scan_prs(repo_root: Path, config: dict[str, Any], paths: dict[str, Path], limit: int | None, rewrite: bool) -> None:
    if rewrite:
        paths["commit_prs_jsonl"].unlink(missing_ok=True)
    existing = [] if rewrite else read_jsonl(paths["commit_prs_jsonl"])
    seen = {row["commit"] for row in existing}

    intros = read_jsonl(paths["introductions_jsonl"])
    commits = [row["intro_commit"] for row in intros if row.get("intro_commit")]
    unique_commits = [commit for commit in sorted(set(commits)) if commit not in seen]
    if limit is not None:
        unique_commits = unique_commits[:limit]

    repo_slug = str(config["repo"])
    for commit in unique_commits:
        append_jsonl(paths["commit_prs_jsonl"], {"commit": commit, "prs": fetch_commit_prs(repo_root, repo_slug, commit)})


def materialize(paths: dict[str, Path]) -> None:
    intros = read_jsonl(paths["introductions_jsonl"])
    prs_by_commit = {row["commit"]: row["prs"] for row in read_jsonl(paths["commit_prs_jsonl"])}
    combined = []
    for row in intros:
        combined.append(
            {
                **row,
                "introPrs": prs_by_commit.get(row.get("intro_commit"), []),
            }
        )
    paths["machine_json"].write_text(json.dumps(combined, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["scan-tests", "scan-prs", "materialize", "all"])
    parser.add_argument("config", help="Path to repo-audit.yaml")
    parser.add_argument("--repo-root", help="Repo root; defaults to the current working directory")
    parser.add_argument("--limit", type=int, help="Limit the number of pending items processed")
    parser.add_argument("--rewrite", action="store_true", help="Rewrite caches for the chosen step")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).expanduser().resolve() if args.repo_root else Path.cwd().resolve()
    config_path = Path(args.config).expanduser().resolve()
    config = load_yaml(config_path)
    paths = config_paths(config_path, config)

    if args.command in {"scan-tests", "all"}:
        scan_tests(repo_root, config, paths, args.limit, args.rewrite)
    if args.command in {"scan-prs", "all"}:
        scan_prs(repo_root, config, paths, args.limit, args.rewrite)
    if args.command in {"materialize", "all"}:
        materialize(paths)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
