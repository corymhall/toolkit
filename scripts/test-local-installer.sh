#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
installer="${repo_root}/scripts/install-local-skills.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

home="${tmp_dir}/home"
codex_home="${tmp_dir}/codex"
mkdir -p "${home}" "${codex_home}/agents"

legacy_link="${codex_home}/agents/general_reviewer.toml"
unrelated_link="${codex_home}/agents/test_reviewer.toml"
ln -s "${repo_root}/plugins/engineering-review/agents/general-reviewer.toml" "${legacy_link}"
ln -s "/other/toolkit/plugins/engineering-review/agents/test-reviewer.toml" "${unrelated_link}"

run_installer() {
  HOME="${home}" \
  CODEX_HOME="${codex_home}" \
  PATH="${home}/.local/bin:${PATH}" \
    "${installer}"
}

run_installer >"${tmp_dir}/first.out"

shared_expected=$(
  find "${repo_root}/skills" "${repo_root}/.agents/skills" \
    -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print | wc -l | tr -d ' '
)
shared_actual=$(find "${home}/.agents/skills" -mindepth 1 -maxdepth 1 -type l | wc -l | tr -d ' ')
codex_expected=$(find "${repo_root}/codex-skills" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print | wc -l | tr -d ' ')
codex_actual=$(find "${codex_home}/skills" -mindepth 1 -maxdepth 1 -type l | wc -l | tr -d ' ')

[[ "${shared_actual}" == "${shared_expected}" ]]
[[ "${codex_actual}" == "${codex_expected}" ]]
[[ "$(readlink "${home}/.agents/skills/herdr")" == "${repo_root}/.agents/skills/herdr" ]]
[[ "$(readlink "${home}/.local/bin/make")" == "${repo_root}/skills/memory-guard/scripts/make" ]]
[[ ! -L "${legacy_link}" ]]
[[ -L "${unrelated_link}" ]]
[[ "$(readlink "${unrelated_link}")" == "/other/toolkit/plugins/engineering-review/agents/test-reviewer.toml" ]]

run_installer >"${tmp_dir}/second.out"
grep -q "Already linked" "${tmp_dir}/second.out"

# A collision found during preflight must fail before any links are created.
collision_home="${tmp_dir}/collision-home"
collision_codex="${tmp_dir}/collision-codex"
mkdir -p "${collision_home}/.local/bin" "${collision_codex}"
printf '%s\n' "user-owned make" >"${collision_home}/.local/bin/make"
if HOME="${collision_home}" CODEX_HOME="${collision_codex}" PATH="${collision_home}/.local/bin:${PATH}" \
  "${installer}" >"${tmp_dir}/collision.out" 2>"${tmp_dir}/collision.err"; then
  echo "Installer unexpectedly replaced a non-symlink destination" >&2
  exit 1
fi
grep -q "Refusing to replace non-symlink destination" "${tmp_dir}/collision.err"
[[ ! -d "${collision_home}/.agents/skills" ]]
[[ ! -d "${collision_codex}/skills" ]]
grep -q "user-owned make" "${collision_home}/.local/bin/make"

echo "Local skill installer tests passed."
