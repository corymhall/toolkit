#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi is not installed or not on PATH" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

export HOME="${tmp_dir}/home"
export PI_CODING_AGENT_DIR="${tmp_dir}/agent"
export PI_OFFLINE=1
mkdir -p "${HOME}"

python3 - "${repo_root}" <<'PY'
import glob
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "package.json").read_text())
entries = manifest.get("pi", {}).get("skills")
if not isinstance(entries, list) or not entries:
    raise SystemExit("package.json must expose Pi skills")

def discover_skills(resource: pathlib.Path) -> set[pathlib.Path]:
    if resource.is_file():
        return {resource.parent} if resource.name == "SKILL.md" else set()
    if not resource.is_dir():
        return set()
    return {skill_file.parent.resolve() for skill_file in resource.rglob("SKILL.md")}

selected: set[pathlib.Path] = set()
for entry in entries:
    if not isinstance(entry, str) or not entry:
        raise SystemExit(f"invalid Pi skill entry: {entry!r}")
    excluded = entry.startswith("!")
    pattern = entry[1:] if excluded else entry
    matches = {pathlib.Path(match).resolve() for match in glob.glob(str(root / pattern))}
    if not excluded and not matches:
        raise SystemExit(f"Pi skill pattern matched nothing: {entry}")
    discovered = {skill for match in matches for skill in discover_skills(match)}
    selected = selected - discovered if excluded else selected | discovered

if not selected:
    raise SystemExit("Pi skill manifest resolves to no skills")

for skill in selected:
    if root / "codex-skills" in skill.parents:
        raise SystemExit(f"Codex-only skill was exposed to Pi: {skill}")

spec_to_goal = (root / "codex-skills/spec-to-goal").resolve()
if spec_to_goal in selected:
    raise SystemExit("Codex-only spec-to-goal skill was exposed to Pi")

extensions = manifest.get("pi", {}).get("extensions")
expected_extensions = [
    "extensions/web-access/index.ts",
    "extensions/codex-commentary/index.ts",
    "extensions/codex-fast-mode/index.ts",
    "extensions/skill-autocomplete/index.ts",
    "extensions/system-prompt/index.ts",
    "extensions/status-footer/index.ts",
    "extensions/delegate/index.ts",
    "extensions/herdr-command/index.ts",
]
if extensions != expected_extensions:
    raise SystemExit(f"unexpected Pi extensions manifest: {extensions!r}")
for extension in extensions:
    if not (root / extension).is_file():
        raise SystemExit(f"Pi extension does not exist: {extension}")
PY

# Run package commands outside the source tree so validation never needs to
# approve project-local resources merely to install this explicit package path.
cd "${tmp_dir}"
pi install "${repo_root}"
pi list
pi --list-models >/dev/null

python3 - "${repo_root}" <<'PY'
import glob
import json
import os
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "package.json").read_text())
expected: set[str] = set()
for entry in manifest["pi"]["skills"]:
    if entry.startswith("!"):
        continue
    for match in glob.glob(str(root / entry)):
        resource = pathlib.Path(match)
        skill_files = [resource] if resource.is_file() and resource.name == "SKILL.md" else resource.rglob("SKILL.md")
        for skill_file in skill_files:
            frontmatter = skill_file.read_text()
            name = re.search(r"^name:\s*[\"']?([^\"'\n]+)", frontmatter, re.MULTILINE)
            if not name:
                raise SystemExit(f"skill has no parseable name: {skill_file}")
            expected.add(name.group(1).strip())

command = {"id": "commands", "type": "get_commands"}
result = subprocess.run(
    [
        "pi",
        "--mode",
        "rpc",
        "--no-session",
        "--no-extensions",
        "--no-prompt-templates",
        "--no-context-files",
    ],
    cwd=os.environ["HOME"],
    env=os.environ.copy(),
    input=json.dumps(command) + "\n",
    text=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    timeout=30,
)
if result.returncode != 0:
    raise SystemExit(f"Pi RPC startup failed:\n{result.stderr}")

response = None
for line in result.stdout.splitlines():
    event = json.loads(line)
    if event.get("type") == "response" and event.get("id") == "commands":
        response = event
        break
if not response or not response.get("success"):
    raise SystemExit(f"Pi get_commands failed: {response!r}\n{result.stderr}")

loaded = {
    command["name"].removeprefix("skill:")
    for command in response["data"]["commands"]
    if command.get("source") == "skill"
}
missing = expected - loaded
if missing:
    raise SystemExit(f"Pi did not load expected skills: {sorted(missing)}")
if "spec-to-goal" in loaded:
    raise SystemExit("Pi loaded Codex-only spec-to-goal")
if "herdr" not in loaded:
    raise SystemExit("Pi did not load the managed Herdr skill")
PY

echo "Pi skill package smoke test passed."
