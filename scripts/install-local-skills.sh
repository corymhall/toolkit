#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shared_source="${repo_root}/skills"
managed_source="${repo_root}/.agents/skills"
codex_source="${repo_root}/codex-skills"
shared_dest="${HOME}/.agents/skills"
codex_home="${CODEX_HOME:-${HOME}/.codex}"
codex_dest="${codex_home}/skills"
bin_dest="${HOME}/.local/bin"

check_destination() {
  local destination="$1"
  if [[ -e "${destination}" && ! -L "${destination}" ]]; then
    echo "Refusing to replace non-symlink destination: ${destination}" >&2
    return 1
  fi
}

for_each_skill() {
  local source_root="$1"
  local callback="$2"
  local destination_root="$3"
  local label="$4"

  if [[ ! -d "${source_root}" ]]; then
    echo "Missing ${label} skill directory: ${source_root}" >&2
    return 1
  fi

  local count=0
  while IFS= read -r -d '' skill_file; do
    local skill_dir
    skill_dir="$(dirname "${skill_file}")"
    "${callback}" "${skill_dir}" "${destination_root}/$(basename "${skill_dir}")"
    count=$((count + 1))
  done < <(find "${source_root}" -mindepth 2 -type f -name SKILL.md -print0 | sort -z)

  if [[ "${count}" -eq 0 ]]; then
    echo "No ${label} skills found under ${source_root}" >&2
    return 1
  fi
}

check_duplicate_skill_names() {
  local duplicates
  duplicates=$(
    for source_root in "$@"; do
      find "${source_root}" -mindepth 2 -type f -name SKILL.md -print0
    done \
      | while IFS= read -r -d '' skill_file; do basename "$(dirname "${skill_file}")"; done \
      | sort \
      | uniq -d
  )
  if [[ -n "${duplicates}" ]]; then
    echo "Duplicate skill destination names:" >&2
    echo "${duplicates}" >&2
    return 1
  fi
}

preflight_skill() {
  local _source="$1"
  local destination="$2"
  check_destination "${destination}"
}

link_path() {
  local source="$1"
  local destination="$2"

  check_destination "${destination}"
  if [[ -L "${destination}" ]]; then
    local current
    current="$(readlink "${destination}")"
    if [[ "${current}" == "${source}" ]]; then
      echo "Already linked ${destination} -> ${source}"
      return
    fi
    echo "Updating link ${destination}: ${current} -> ${source}"
  else
    echo "Linking ${destination} -> ${source}"
  fi

  ln -sfn "${source}" "${destination}"
}

# Validate every destination before changing anything so a late collision does
# not leave a partially installed skill set. Nested source groups are flattened
# by skill directory name, so reject duplicate names before linking.
check_duplicate_skill_names "${shared_source}" "${managed_source}"
check_duplicate_skill_names "${codex_source}"
for_each_skill "${shared_source}" preflight_skill "${shared_dest}" "shared"
for_each_skill "${managed_source}" preflight_skill "${shared_dest}" "managed third-party"
for_each_skill "${codex_source}" preflight_skill "${codex_dest}" "Codex-only"
make_proxy="${shared_source}/memory-guard/scripts/make"
if [[ ! -x "${make_proxy}" ]]; then
  echo "Missing executable memory guard proxy: ${make_proxy}" >&2
  exit 1
fi
check_destination "${bin_dest}/make"

mkdir -p "${shared_dest}" "${codex_dest}" "${bin_dest}"
for_each_skill "${shared_source}" link_path "${shared_dest}" "shared"
for_each_skill "${managed_source}" link_path "${shared_dest}" "managed third-party"
for_each_skill "${codex_source}" link_path "${codex_dest}" "Codex-only"

# The former plugin installer linked focused reviewer TOML files directly into
# Codex. Remove only links created from this checkout's exact former paths.
legacy_agents=(
  documentation_reviewer.toml
  error_handling_reviewer.toml
  general_reviewer.toml
  go_reviewer.toml
  repo_instructions_reviewer.toml
  spec_alignment_reviewer.toml
  test_reviewer.toml
)
for agent_name in "${legacy_agents[@]}"; do
  agent_path="${codex_home}/agents/${agent_name}"
  if [[ ! -L "${agent_path}" ]]; then
    continue
  fi
  agent_target="$(readlink "${agent_path}")"
  legacy_source_name="${agent_name//_/-}"
  expected_target="${repo_root}/plugins/engineering-review/agents/${legacy_source_name}"
  if [[ "${agent_target}" == "${expected_target}" ]]; then
    rm "${agent_path}"
    echo "Removed legacy reviewer link ${agent_path} -> ${agent_target}"
  fi
done

link_path "${make_proxy}" "${bin_dest}/make"

case ":${PATH}:" in
  *":${bin_dest}:"*) ;;
  *)
    echo "Warning: ${bin_dest} is not on PATH; the make proxy will not be used." >&2
    ;;
esac

if [[ "$(command -v make || true)" != "${bin_dest}/make" ]]; then
  echo "Warning: ${bin_dest}/make is not the first make on PATH." >&2
fi

echo "Done. Start a new agent session or reload resources to pick up skill changes."
