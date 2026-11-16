#!/usr/bin/env bash
# A fresh Rex snapshot, an fzf selection, and navigation by exact IDs. No state.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=picker-common.sh
source "$root/picker-common.sh"

sessions() {
  rex --autostart=false "do" list_session_tabs --json | jq -r 'sort_by(.[2] | ascii_downcase)[] | @tsv'
}

if [[ "${1:-}" == list ]]; then
  sessions | cut -f3-
  exit
fi
trap picker_exit EXIT
export FZF_DEFAULT_OPTS='' FZF_DEFAULT_OPTS_FILE=''
entries=$(sessions)
code=0
selected=$(fzf --no-multi --no-preview --reverse --delimiter=$'\t' --with-nth=3.. --prompt='Session > ' <<< "$entries") || code=$?
case "$code" in 0) ;; 1|130) exit 0 ;; *) exit "$code" ;; esac
IFS=$'\t' read -r session window _ <<< "$selected"
rex --autostart=false session inspect "$session" --json |
  jq -e --arg window "$window" 'any(.windows[]; .window_id == $window)' >/dev/null
rex --autostart=false -C "${REX_CLIENT:?Originating Rex client is required}" "do" session.select "session_id=$session" "window_id=$window"
