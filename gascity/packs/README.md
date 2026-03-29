# Local Gas City Packs

This directory is the local implementation target for the `gascity-packs`
effort in this repo.

The initial split is:

- `base/`: shared owner-session assets and shared policy surface
- `work/`: conservative work-repo behavior
- `personal/`: more autonomous personal-repo behavior

The `gascity` repo remains reference material for pack/file shape and config
syntax. New local pack assets should land here.

Practical rig-adoption note:

- When applying these packs in a live city, the current safe rig-add workflow
  is stricter than plain `gc rig add`.
- For local-only beads posture, the add flow should also enforce:
  - explicit rig prefixes
  - local `.git/info/exclude` rules for `.beads/`
  - `no-git-ops: true`
  - no tracked `.gitignore` mutation
  - no leftover `bd init` commit in the rig repo
- The local `gc-rig-add` helper currently captures that workflow.
