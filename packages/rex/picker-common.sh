#!/usr/bin/env bash
# Shared floating-picker cleanup. Also callable by the agent message composer.
set -euo pipefail

close_popup() {
  [[ -n "${REX_PICKER_ORIGIN:-}" && -n "${REX_PICKER_ORIGIN_WINDOW:-}" && -n "${REX_BLOCK:-}" ]] || return 0
  local layer
  layer=$(rex --autostart=false session inspect "$REX_PICKER_ORIGIN" --json |
    jq -r --arg window "$REX_PICKER_ORIGIN_WINDOW" --arg block "$REX_BLOCK" '
      .windows[] | select(.window_id == $window) | .layers[] |
      select(.kind == "floating" and any(.blocks[]; .block_id == $block)) | .layer_id')
  [[ -n "$layer" ]] || return 0
  rex --autostart=false api call session.close_layer "$(
    jq -cn --arg session "$REX_PICKER_ORIGIN" --arg layer "$layer" '{session_id:$session, layer_id:$layer}')"
}

picker_exit() {
  local code=$?
  trap - EXIT
  if (( code != 0 )); then
    printf '\nPicker failed. Inspect the error before retrying. Press Enter to close. ' >&2
    read -r _ || true
  fi
  close_popup || { printf 'Could not close picker popup.\n' >&2; code=1; }
  exit "$code"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  close_popup
fi
