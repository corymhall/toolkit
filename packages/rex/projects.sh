#!/usr/bin/env bash
# Global project selection. Rex owns session identity and Worktrunk stays in the shell.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=picker-common.sh
source "$root/picker-common.sh"

projects() {
  local base project
  for base in "$HOME"/{personal,plugins,playground,github,testing-apps,work}; do
    [[ -d "$base" ]] || continue
    for project in "$base"/*; do
      [[ -e "$project/.git" ]] || continue
      [[ "$project" != *[$'\n\r\t']* ]] || continue
      (cd -- "$project" && pwd -P)
    done
  done | LC_ALL=C sort -u
}

if [[ "${1:-}" == list ]]; then
  projects
  exit
fi
trap picker_exit EXIT
export FZF_DEFAULT_OPTS='' FZF_DEFAULT_OPTS_FILE=''
entries=$(projects)
code=0
project=$(fzf --no-multi --no-preview --reverse --prompt='Project > ' <<< "$entries") || code=$?
case "$code" in 0) ;; 1|130) exit 0 ;; *) exit "$code" ;; esac
[[ -n "$project" ]] || exit 0
rex --autostart=false -C "${REX_CLIENT:?Originating Rex client is required}" "do" open_project "path=$project"
