#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_marketplace="${repo_root}/.agents/plugins/marketplace.json"
codex_home="${CODEX_HOME:-${HOME}/.codex}"
codex_cache="${codex_home}/plugins/cache"
codex_agents="${codex_home}/agents"
toolkit_agents="${repo_root}/plugins/engineering-review/agents"
home_skills="${HOME}/.agents/skills"

if [[ ! -f "${repo_marketplace}" ]]; then
  echo "Missing repo marketplace: ${repo_marketplace}" >&2
  exit 1
fi

marketplace_name="$(
  python3 - "${repo_marketplace}" <<'PY'
import json
import pathlib
import sys

data = json.loads(pathlib.Path(sys.argv[1]).read_text())
name = data.get("name")
if not isinstance(name, str) or not name:
    raise SystemExit("marketplace.json must include a non-empty top-level name")
print(name)
PY
)"

echo "Registering local marketplace ${marketplace_name} from ${repo_root}"
codex plugin marketplace add "${repo_root}" >/dev/null || {
  echo "Failed to register local marketplace. If it already exists from another path, run:" >&2
  echo "  codex plugin marketplace remove ${marketplace_name}" >&2
  echo "  codex plugin marketplace add ${repo_root}" >&2
  exit 1
}

if [[ -d "${codex_cache}/${marketplace_name}" ]]; then
  while IFS= read -r -d '' cache_link; do
    target="$(readlink "${cache_link}")"
    case "${target}" in
      "${repo_root}/plugins/"*)
        plugin_base="$(dirname "${cache_link}")"
        rm "${cache_link}"
        rmdir "${plugin_base}" 2>/dev/null || true
        echo "Removed old dev cache symlink ${cache_link} -> ${target}"
        ;;
    esac
  done < <(find "${codex_cache}/${marketplace_name}" -mindepth 2 -maxdepth 2 -type l -print0)
fi

if [[ -d "${home_skills}" ]]; then
  removed=0
  while IFS= read -r -d '' link; do
    target="$(readlink "${link}")"
    case "${target}" in
      "${repo_root}/general/skills/"*|"${repo_root}/.codex/skills/"*)
        rm "${link}"
        echo "Removed stale toolkit skill symlink ${link} -> ${target}"
        removed=$((removed + 1))
        ;;
    esac
  done < <(find "${home_skills}" -maxdepth 1 -type l -print0)

  if [[ "${removed}" -eq 0 ]]; then
    echo "No stale toolkit skill symlinks found in ${home_skills}"
  fi
fi

if [[ -d "${toolkit_agents}" ]]; then
  mkdir -p "${codex_agents}"

  linked_agents=0
  while IFS= read -r -d '' agent_file; do
    agent_base="$(basename "${agent_file}")"
    dest_base="${agent_base//-/_}"
    dest="${codex_agents}/${dest_base}"

    if [[ -e "${dest}" && ! -L "${dest}" ]]; then
      echo "Refusing to replace non-symlink Codex agent file: ${dest}" >&2
      exit 1
    fi

    ln -sfn "${agent_file}" "${dest}"
    echo "Linked Codex agent role ${dest} -> ${agent_file}"
    linked_agents=$((linked_agents + 1))
  done < <(find "${toolkit_agents}" -maxdepth 1 -type f -name '*.toml' -print0 | sort -z)

  if [[ "${linked_agents}" -eq 0 ]]; then
    echo "No toolkit Codex agent role files found in ${toolkit_agents}"
  fi
fi

echo "Done. Start a new Codex session or restart Codex to reload skill instructions."
