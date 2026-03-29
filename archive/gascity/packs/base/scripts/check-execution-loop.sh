#!/bin/sh
set -eu

if [ -z "${GC_BEAD_ID:-}" ]; then
  echo "GC_BEAD_ID is required" >&2
  exit 1
fi

STATE_PATH=$(bd show "$GC_BEAD_ID" --json | jq -r '.[0].metadata["execution.state_path"] // .metadata["execution.state_path"] // empty')
if [ -z "$STATE_PATH" ]; then
  echo "execution.state_path metadata missing on $GC_BEAD_ID" >&2
  exit 1
fi

if [ ! -f "$STATE_PATH" ]; then
  echo "execution state file missing: $STATE_PATH" >&2
  exit 1
fi

STATUS=$(jq -r '.workflow_status // "in_progress"' "$STATE_PATH")
case "$STATUS" in
  done)
    exit 0
    ;;
  in_progress|blocked)
    echo "execution loop continuing: workflow_status=$STATUS" >&2
    exit 1
    ;;
  *)
    echo "unknown workflow_status=$STATUS" >&2
    exit 1
    ;;
esac
