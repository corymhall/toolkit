#!/usr/bin/env bash
# Project selection and Worktrunk handoff. Rex owns session and tab creation.
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
selection=$(fzf --no-multi --no-preview --reverse --prompt='Project > ' \
  --header='Enter: open project | Ctrl+W: worktrees | Ctrl+G: create worktree' \
  --expect=ctrl-w,ctrl-g <<< "$entries") || code=$?
case "$code" in 0) ;; 1|130) exit 0 ;; *) exit "$code" ;; esac
key=${selection%%$'\n'*}
project=${selection#*$'\n'}
[[ -n "$project" ]] || exit 0
client=${REX_CLIENT:?Originating Rex client is required}
if [[ -z "$key" ]]; then
  rex --autostart=false -C "$client" "do" open_project "path=$project"
  exit
fi
switch_args=(--no-cd)
if [[ "$key" == ctrl-g ]]; then
  branch=$(gum input --prompt='New branch > ' --placeholder='feature/my-change') || code=$?
  case "$code" in 0) ;; 1|130) exit 0 ;; *) exit "$code" ;; esac
  [[ -n "$branch" ]] || exit 0
  git check-ref-format --branch "$branch" >/dev/null
  switch_args+=(--create "$branch")
fi
# Worktrunk runs setup hooks and invokes Rex only after a successful switch.
# Arguments stay separate, including paths containing spaces or shell syntax.
wt -C "$project" --config-set 'switch.picker.preview=false' switch \
  "${switch_args[@]}" --execute rex -- \
  --autostart=false -C "$client" "do" open_worktree \
  "project=$project" 'path={{ worktree_path }}' || code=$?
case "$code" in 0|130) exit 0 ;; *) exit "$code" ;; esac
