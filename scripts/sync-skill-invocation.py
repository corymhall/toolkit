# /// script
# requires-python = ">=3.13"
# dependencies = ["PyYAML==6.0.2"]
# ///

"""Synchronize cross-harness model invocation metadata for Agent Skills."""

from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
import re
import sys
from typing import Any

import yaml

DEFAULT_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOTS = ("skills", "codex-skills", ".agents/skills")
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---(?=\n|\Z)", re.DOTALL)
PI_FIELD = "disable-model-invocation"
OPENAI_FIELD = "allow_implicit_invocation"
PI_LINE = re.compile(rf"(?m)^{re.escape(PI_FIELD)}:\s*[^\n]+$")
OPENAI_POLICY_LINE = re.compile(r"(?m)^policy:\s*(?:#.*)?$")
OPENAI_FIELD_LINE = re.compile(
    rf"(?m)^  {re.escape(OPENAI_FIELD)}:\s*[^\n]+$"
)


class ConfigurationError(ValueError):
    """Raised when policy or skill metadata cannot be synchronized safely."""


@dataclass(frozen=True)
class Skill:
    name: str
    directory: Path
    skill_file: Path


@dataclass(frozen=True)
class SkillPolicy:
    model_invocable: bool
    codex_model_invocable: bool
    openai: dict[str, Any] | None


def relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def load_mapping(path: Path, label: str) -> dict[str, Any]:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ConfigurationError(f"{label}: cannot read {path}: {error}") from error
    except yaml.YAMLError as error:
        raise ConfigurationError(f"{label}: invalid YAML in {path}: {error}") from error
    if not isinstance(value, dict):
        raise ConfigurationError(f"{label}: {path} must contain a YAML mapping")
    return value


def parse_frontmatter(skill_file: Path, root: Path) -> tuple[str, dict[str, Any], re.Match[str]]:
    text = skill_file.read_text(encoding="utf-8")
    match = FRONTMATTER.match(text)
    if match is None:
        raise ConfigurationError(
            f"{relative(skill_file, root)}: invalid or missing YAML frontmatter"
        )
    try:
        frontmatter = yaml.safe_load(match.group(1))
    except yaml.YAMLError as error:
        raise ConfigurationError(
            f"{relative(skill_file, root)}: invalid YAML frontmatter: {error}"
        ) from error
    if not isinstance(frontmatter, dict):
        raise ConfigurationError(
            f"{relative(skill_file, root)}: frontmatter must be a mapping"
        )
    name = frontmatter.get("name")
    if not isinstance(name, str) or not name:
        raise ConfigurationError(
            f"{relative(skill_file, root)}: frontmatter name must be a string"
        )
    return text, frontmatter, match


def discover_skills(root: Path) -> dict[str, Skill]:
    skills: dict[str, Skill] = {}
    for root_name in SKILL_ROOTS:
        skill_root = root / root_name
        if not skill_root.is_dir():
            raise ConfigurationError(f"missing skill root: {relative(skill_root, root)}")
        for skill_file in sorted(skill_root.rglob("SKILL.md")):
            _, _, match = parse_frontmatter(skill_file, root)
            frontmatter = yaml.safe_load(match.group(1))
            name = frontmatter["name"]
            if name in skills:
                first = relative(skills[name].skill_file, root)
                second = relative(skill_file, root)
                raise ConfigurationError(
                    f"duplicate skill name {name}: {first}, {second}"
                )
            skills[name] = Skill(name, skill_file.parent, skill_file)
    if not skills:
        raise ConfigurationError("no skills found")
    return skills


def load_policy(config_file: Path) -> dict[str, SkillPolicy]:
    config = load_mapping(config_file, "invocation policy")
    unknown_top_level = set(config) - {"version", "skills"}
    if unknown_top_level:
        rendered = ", ".join(sorted(unknown_top_level))
        raise ConfigurationError(f"invocation policy: unknown field(s): {rendered}")
    if config.get("version") != 1:
        raise ConfigurationError("invocation policy: version must be 1")
    entries = config.get("skills")
    if not isinstance(entries, dict):
        raise ConfigurationError("invocation policy: skills must be a mapping")

    policies: dict[str, SkillPolicy] = {}
    for name, raw_policy in entries.items():
        if not isinstance(name, str) or not name:
            raise ConfigurationError("invocation policy: skill names must be strings")
        if not isinstance(raw_policy, dict):
            raise ConfigurationError(
                f"invocation policy: {name} must contain a mapping"
            )
        unknown = set(raw_policy) - {
            "model_invocable",
            "codex_model_invocable",
            "openai",
        }
        if unknown:
            rendered = ", ".join(sorted(unknown))
            raise ConfigurationError(
                f"invocation policy: {name} has unknown field(s): {rendered}"
            )
        model_invocable = raw_policy.get("model_invocable")
        if not isinstance(model_invocable, bool):
            raise ConfigurationError(
                f"invocation policy: {name}.model_invocable must be a boolean"
            )
        codex_model_invocable = raw_policy.get(
            "codex_model_invocable", model_invocable
        )
        if not isinstance(codex_model_invocable, bool):
            raise ConfigurationError(
                f"invocation policy: {name}.codex_model_invocable must be a boolean"
            )
        openai = raw_policy.get("openai")
        if openai is not None and not isinstance(openai, dict):
            raise ConfigurationError(
                f"invocation policy: {name}.openai must be a mapping"
            )
        policies[name] = SkillPolicy(
            model_invocable, codex_model_invocable, openai
        )
    return policies


def validate_coverage(
    skills: dict[str, Skill], policies: dict[str, SkillPolicy]
) -> None:
    missing = sorted(set(skills) - set(policies))
    stale = sorted(set(policies) - set(skills))
    errors: list[str] = []
    if missing:
        errors.append(f"skills missing policy: {', '.join(missing)}")
    if stale:
        errors.append(f"policy references missing skills: {', '.join(stale)}")
    if errors:
        raise ConfigurationError("; ".join(errors))


def render_skill_file(skill: Skill, policy: SkillPolicy, root: Path) -> str:
    text, frontmatter, match = parse_frontmatter(skill.skill_file, root)
    current = frontmatter.get(PI_FIELD)
    if current is not None and not isinstance(current, bool):
        raise ConfigurationError(
            f"{relative(skill.skill_file, root)}: {PI_FIELD} must be a boolean"
        )

    if policy.model_invocable:
        rendered_frontmatter, replacements = PI_LINE.subn("", match.group(1))
        rendered_frontmatter = rendered_frontmatter.rstrip("\n")
    else:
        field_line = f"{PI_FIELD}: true"
        rendered_frontmatter, replacements = PI_LINE.subn(
            field_line, match.group(1)
        )
        if replacements == 0:
            rendered_frontmatter = f"{rendered_frontmatter}\n{field_line}"
    if replacements > 1:
        raise ConfigurationError(
            f"{relative(skill.skill_file, root)}: duplicate {PI_FIELD} fields"
        )
    return f"{text[:match.start(1)]}{rendered_frontmatter}{text[match.end(1):]}"


def parse_openai(text: str, path: Path, root: Path) -> dict[str, Any]:
    try:
        value = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise ConfigurationError(
            f"{relative(path, root)}: invalid YAML: {error}"
        ) from error
    if not isinstance(value, dict):
        raise ConfigurationError(f"{relative(path, root)}: must contain a mapping")
    policy = value.get("policy")
    if policy is not None and not isinstance(policy, dict):
        raise ConfigurationError(f"{relative(path, root)}: policy must be a mapping")
    if isinstance(policy, dict):
        current = policy.get(OPENAI_FIELD)
        if current is not None and not isinstance(current, bool):
            raise ConfigurationError(
                f"{relative(path, root)}: policy.{OPENAI_FIELD} must be a boolean"
            )
    return value


def render_existing_openai(text: str, path: Path, root: Path, value: bool) -> str:
    data = parse_openai(text, path, root)
    policy = data.get("policy")
    has_policy_field = isinstance(policy, dict) and OPENAI_FIELD in policy
    field_matches = list(OPENAI_FIELD_LINE.finditer(text))
    if len(field_matches) > 1:
        raise ConfigurationError(
            f"{relative(path, root)}: duplicate policy.{OPENAI_FIELD} fields"
        )
    if field_matches and not has_policy_field:
        raise ConfigurationError(
            f"{relative(path, root)}: {OPENAI_FIELD} must be under policy"
        )
    if has_policy_field and not field_matches:
        raise ConfigurationError(
            f"{relative(path, root)}: policy.{OPENAI_FIELD} must use block YAML"
        )

    if value:
        if not has_policy_field:
            return text
        if len(policy) == 1:
            policy_block = re.compile(
                rf"(?m)^policy:\s*(?:#.*)?\n"
                rf"  {re.escape(OPENAI_FIELD)}:\s*[^\n]+\n?"
            )
            rendered, replacements = policy_block.subn("", text)
            if replacements != 1:
                raise ConfigurationError(
                    f"{relative(path, root)}: cannot remove empty policy block"
                )
            return rendered
        field_line = re.compile(
            rf"(?m)^  {re.escape(OPENAI_FIELD)}:\s*[^\n]+\n?"
        )
        return field_line.sub("", text, count=1)

    field_line = f"  {OPENAI_FIELD}: false"
    if has_policy_field:
        return OPENAI_FIELD_LINE.sub(field_line, text, count=1)

    policy_matches = list(OPENAI_POLICY_LINE.finditer(text))
    if len(policy_matches) > 1:
        raise ConfigurationError(f"{relative(path, root)}: duplicate policy fields")
    if policy_matches:
        position = policy_matches[0].end()
        return f"{text[:position]}\n{field_line}{text[position:]}"

    separator = "" if text.endswith("\n") else "\n"
    return f"{text}{separator}policy:\n{field_line}\n"


def render_template_openai(template: dict[str, Any], value: bool) -> str:
    rendered = deepcopy(template)
    policy = rendered.get("policy")
    if policy is None:
        policy = {}
        rendered["policy"] = policy
    if not isinstance(policy, dict):
        raise ConfigurationError("openai template policy must be a mapping")
    policy[OPENAI_FIELD] = value
    return yaml.safe_dump(rendered, sort_keys=False, allow_unicode=True)


def desired_files(
    root: Path, skills: dict[str, Skill], policies: dict[str, SkillPolicy]
) -> dict[Path, str]:
    files: dict[Path, str] = {}
    for name, skill in sorted(skills.items()):
        policy = policies[name]
        files[skill.skill_file] = render_skill_file(skill, policy, root)

        openai_file = skill.directory / "agents" / "openai.yaml"
        if policy.openai is not None:
            try:
                files[openai_file] = render_template_openai(
                    policy.openai, policy.codex_model_invocable
                )
            except ConfigurationError as error:
                raise ConfigurationError(
                    f"invocation policy: {name}.openai: {error}"
                ) from error
        elif openai_file.is_file():
            text = openai_file.read_text(encoding="utf-8")
            files[openai_file] = render_existing_openai(
                text, openai_file, root, policy.codex_model_invocable
            )
        elif not policy.codex_model_invocable:
            raise ConfigurationError(
                f"{relative(openai_file, root)}: missing; add an openai template "
                f"for {name} to the invocation policy"
            )
    return files


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="report stale files without changing them"
    )
    parser.add_argument(
        "--root", type=Path, default=DEFAULT_ROOT, help=argparse.SUPPRESS
    )
    parser.add_argument("--config", type=Path, help=argparse.SUPPRESS)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    config_file = args.config or root / "skill-invocation.yaml"
    if not config_file.is_absolute():
        config_file = root / config_file

    try:
        skills = discover_skills(root)
        policies = load_policy(config_file)
        validate_coverage(skills, policies)
        files = desired_files(root, skills, policies)
    except (ConfigurationError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    stale = [
        path
        for path, content in files.items()
        if not path.is_file() or path.read_text(encoding="utf-8") != content
    ]
    if args.check:
        if stale:
            for path in stale:
                print(f"error: invocation metadata is stale: {relative(path, root)}", file=sys.stderr)
            print(
                "Run 'mise run skills:sync-invocation' to synchronize metadata.",
                file=sys.stderr,
            )
            return 1
        print(f"Validated invocation metadata for {len(skills)} skills.")
        return 0

    for path in stale:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(files[path], encoding="utf-8")
        print(f"Updated {relative(path, root)}")
    print(f"Synchronized invocation metadata for {len(skills)} skills.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
