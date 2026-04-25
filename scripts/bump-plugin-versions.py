#!/usr/bin/env python3
"""Bump patch versions for plugin manifests touched by a change set."""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys


SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def git_changed_paths(base: str | None) -> list[pathlib.Path]:
    if base:
        cmd = ["git", "diff", "--name-only", base, "--"]
    else:
        cmd = ["git", "diff", "--name-only", "HEAD", "--"]
    unstaged = subprocess.run(cmd, check=True, text=True, stdout=subprocess.PIPE).stdout
    staged = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout
    names = {line for raw in (unstaged, staged, untracked) for line in raw.splitlines() if line}
    return [pathlib.Path(name) for name in sorted(names)]


def plugin_name_for_path(path: pathlib.Path) -> str | None:
    parts = path.parts
    if len(parts) < 2 or parts[0] != "plugins":
        return None
    return parts[1]


def bump_patch(version: str) -> str:
    match = SEMVER_RE.match(version)
    if not match:
        raise ValueError(f"expected x.y.z semver, got {version!r}")
    major, minor, patch = (int(part) for part in match.groups())
    return f"{major}.{minor}.{patch + 1}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base",
        help="Git revision to compare against. Defaults to HEAD plus staged/untracked changes.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if changed plugin contents do not already include a manifest version change.",
    )
    args = parser.parse_args()

    repo_root = pathlib.Path(
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
        ).stdout.strip()
    )

    changed_paths = git_changed_paths(args.base)
    changed_path_set = {str(path) for path in changed_paths}
    changed_plugins = {
        plugin
        for path in changed_paths
        if (plugin := plugin_name_for_path(path)) is not None
    }
    if not changed_plugins:
        print("No plugin changes found.")
        return 0

    if args.check:
        missing = []
        for plugin in sorted(changed_plugins):
            manifest_path = pathlib.Path("plugins") / plugin / ".codex-plugin" / "plugin.json"
            if str(manifest_path) in changed_path_set:
                continue
            changed_manifest = subprocess.run(
                ["git", "diff", "--quiet", "HEAD", "--", str(manifest_path)]
            ).returncode != 0
            staged_manifest = subprocess.run(
                ["git", "diff", "--cached", "--quiet", "--", str(manifest_path)]
            ).returncode != 0
            if not changed_manifest and not staged_manifest:
                missing.append(str(manifest_path))
        if missing:
            print("Plugin changes need version bumps:", file=sys.stderr)
            for path in missing:
                print(f"  {path}", file=sys.stderr)
            return 1
        print("All changed plugins include manifest version changes.")
        return 0

    for plugin in sorted(changed_plugins):
        manifest_path = repo_root / "plugins" / plugin / ".codex-plugin" / "plugin.json"
        data = json.loads(manifest_path.read_text())
        old_version = data.get("version")
        if not isinstance(old_version, str):
            raise SystemExit(f"{manifest_path} must include a string version")
        data["version"] = bump_patch(old_version)
        manifest_path.write_text(json.dumps(data, indent=2) + "\n")
        print(f"{plugin}: {old_version} -> {data['version']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
