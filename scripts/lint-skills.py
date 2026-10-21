# /// script
# requires-python = ">=3.13"
# dependencies = ["PyYAML==6.0.2"]
# ///

"""Validate toolkit skills against the Agent Skills specification."""

from __future__ import annotations

from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOTS = (ROOT / "skills", ROOT / ".agents" / "skills")
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---(?=\n|\Z)", re.DOTALL)
PI_ONLY_FIELD = "disable-model-invocation"


def normalized_skill(skill_file: Path, destination: Path) -> tuple[Path | None, str | None]:
    text = skill_file.read_text(encoding="utf-8")
    match = FRONTMATTER.match(text)
    if match is None:
        return None, f"{skill_file.relative_to(ROOT)}: invalid or missing YAML frontmatter"

    try:
        frontmatter = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        return None, f"{skill_file.relative_to(ROOT)}: invalid YAML: {error}"
    if not isinstance(frontmatter, dict):
        return None, f"{skill_file.relative_to(ROOT)}: frontmatter must be a mapping"

    if PI_ONLY_FIELD in frontmatter:
        value = frontmatter.pop(PI_ONLY_FIELD)
        if not isinstance(value, bool):
            return None, (
                f"{skill_file.relative_to(ROOT)}: {PI_ONLY_FIELD} must be a boolean"
            )

    target = destination / skill_file.parent.name
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir()
    rendered = yaml.safe_dump(frontmatter, sort_keys=False, allow_unicode=True).rstrip()
    body = text[match.end() :]
    (target / "SKILL.md").write_text(
        f"---\n{rendered}\n---{body}", encoding="utf-8"
    )
    return target, None


def main() -> int:
    skill_files = sorted(
        skill_file
        for root in SKILL_ROOTS
        for skill_file in root.rglob("SKILL.md")
    )
    if not skill_files:
        print("No skills found", file=sys.stderr)
        return 1

    failures = 0
    with tempfile.TemporaryDirectory(prefix="toolkit-skill-lint-") as temp_dir:
        destination = Path(temp_dir)
        for skill_file in skill_files:
            target, error = normalized_skill(skill_file, destination)
            if error is not None:
                print(f"error: {error}", file=sys.stderr)
                failures += 1
                continue
            result = subprocess.run(["agentskills", "validate", str(target)], check=False)
            if result.returncode != 0:
                print(
                    f"error: specification validation failed for "
                    f"{skill_file.relative_to(ROOT)}",
                    file=sys.stderr,
                )
                failures += 1

    if failures:
        print(f"Skill validation failed for {failures} skill(s).", file=sys.stderr)
        return 1

    print(f"Validated {len(skill_files)} skills against the Agent Skills specification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
