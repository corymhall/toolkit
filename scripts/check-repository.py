# /// script
# requires-python = ">=3.13"
# ///

"""Validate policies specific to the toolkit repository."""

from __future__ import annotations

from collections import defaultdict
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOTS = (ROOT / "skills", ROOT / "codex-skills", ROOT / ".agents" / "skills")
IGNORED_PARTS = {
    ".git",
    ".mise",
    ".worktrees",
    "apm_modules",
    "__pycache__",
    "node_modules",
}
TEXT_NAMES = {".gitignore", "AGENTS.md", "LICENSE"}
TEXT_SUFFIXES = {
    ".js",
    ".json",
    ".jsonl",
    ".md",
    ".mjs",
    ".pkl",
    ".py",
    ".sh",
    ".toml",
    ".ts",
    ".txt",
    ".yaml",
    ".yml",
}


def skill_files() -> list[Path]:
    return sorted(skill_file for root in SKILL_ROOTS for skill_file in root.rglob("SKILL.md"))


def source_files() -> list[Path]:
    files: list[Path] = []
    managed_skills = ROOT / ".agents" / "skills"
    for path in ROOT.rglob("*"):
        if (
            not path.is_file()
            or path.is_relative_to(managed_skills)
            or any(part in IGNORED_PARTS for part in path.parts)
        ):
            continue
        if path.name in TEXT_NAMES or path.suffix in TEXT_SUFFIXES:
            files.append(path)
    return sorted(files)


def check_json(errors: list[str]) -> None:
    for path in (ROOT / "package.json", ROOT / "package-lock.json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"{path.relative_to(ROOT)}: invalid JSON: {error}")


def check_skill_names(errors: list[str]) -> None:
    skills = skill_files()
    if not skills:
        errors.append("no skills found")
        return

    owners: defaultdict[str, list[Path]] = defaultdict(list)
    for skill_file in skills:
        owners[skill_file.parent.name].append(skill_file)

    for name, paths in owners.items():
        if len(paths) > 1:
            rendered = ", ".join(str(path.relative_to(ROOT)) for path in paths)
            errors.append(f"duplicate skill directory name {name}: {rendered}")


def check_text_hygiene(errors: list[str]) -> None:
    for path in source_files():
        content = path.read_bytes()
        if content and not content.endswith(b"\n"):
            errors.append(f"{path.relative_to(ROOT)}: missing final newline")

        for line_number, line in enumerate(content.splitlines(), start=1):
            if line.rstrip(b" \t") != line:
                errors.append(f"{path.relative_to(ROOT)}:{line_number}: trailing whitespace")


def main() -> int:
    errors: list[str] = []
    check_json(errors)
    check_skill_names(errors)
    check_text_hygiene(errors)

    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    print(
        f"Validated repository policy for {len(skill_files())} skills and "
        f"{len(source_files())} source files."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
