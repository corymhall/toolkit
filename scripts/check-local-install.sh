#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
shared_dest="${HOME}/.agents/skills"
codex_home="${CODEX_HOME:-${HOME}/.codex}"
codex_dest="${codex_home}/skills"
make_dest="${HOME}/.local/bin/make"
errors=0

check_link() {
  local source="$1"
  local destination="$2"
  local label="$3"

  if [[ ! -L "${destination}" ]]; then
    if [[ -e "${destination}" ]]; then
      echo "error: ${label} destination is not a symlink: ${destination}" >&2
    else
      echo "error: missing ${label} link: ${destination}" >&2
    fi
    errors=$((errors + 1))
    return
  fi

  local actual
  actual="$(readlink "${destination}")"
  if [[ "${actual}" != "${source}" ]]; then
    echo "error: misdirected ${label} link: ${destination}" >&2
    echo "  expected: ${source}" >&2
    echo "  actual:   ${actual}" >&2
    errors=$((errors + 1))
  fi
}

check_skill_tree() {
  local source_root="$1"
  local destination_root="$2"
  local label="$3"
  local count=0

  while IFS= read -r -d '' skill_file; do
    local skill_dir
    skill_dir="$(dirname "${skill_file}")"
    check_link \
      "${skill_dir}" \
      "${destination_root}/$(basename "${skill_dir}")" \
      "${label} skill"
    count=$((count + 1))
  done < <(find "${source_root}" -mindepth 2 -type f -name SKILL.md -print0 | sort -z)

  if [[ "${count}" -eq 0 ]]; then
    echo "error: no ${label} skills found under ${source_root}" >&2
    errors=$((errors + 1))
    return
  fi
  echo "Checked ${count} ${label} skill link(s)."
}

check_stale_links() {
  local destination_root="$1"
  local label="$2"
  shift 2

  [[ -d "${destination_root}" ]] || return
  while IFS= read -r -d '' destination; do
    local actual
    local source_root
    local toolkit_owned=0
    actual="$(readlink "${destination}")"
    for source_root in "$@"; do
      if [[ "${actual}" == "${source_root}"/* ]]; then
        toolkit_owned=1
        break
      fi
    done
    if [[ "${toolkit_owned}" -eq 1 && ! -f "${actual}/SKILL.md" ]]; then
      echo "error: stale ${label} link: ${destination} -> ${actual}" >&2
      errors=$((errors + 1))
    fi
  done < <(find "${destination_root}" -mindepth 1 -maxdepth 1 -type l -print0)
}

shared_source="${repo_root}/skills"
managed_source="${repo_root}/.agents/skills"
codex_source="${repo_root}/codex-skills"
check_skill_tree "${shared_source}" "${shared_dest}" "shared"
check_skill_tree "${managed_source}" "${shared_dest}" "managed third-party"
check_skill_tree "${codex_source}" "${codex_dest}" "Codex-only"
check_stale_links "${shared_dest}" "shared skill" "${shared_source}" "${managed_source}"
check_stale_links "${codex_dest}" "Codex-only skill" "${codex_source}"

make_source="${repo_root}/skills/memory-guard/scripts/make"
check_link "${make_source}" "${make_dest}" "memory guard proxy"
if [[ "$(command -v make || true)" != "${make_dest}" ]]; then
  echo "error: ${make_dest} is not the first make on PATH" >&2
  errors=$((errors + 1))
fi

if [[ "${errors}" -ne 0 ]]; then
  echo "Local installation check failed with ${errors} error(s)." >&2
  echo "Use scripts/install-local-skills.sh to repair missing or misdirected links." >&2
  echo "Review and remove reported stale links or non-symlink collisions manually." >&2
  exit 1
fi

echo "Local toolkit installation is current."
