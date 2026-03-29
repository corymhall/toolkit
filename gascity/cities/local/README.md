# Local Sample City

This directory holds the local sample city fixture for the `gascity-packs`
plan.

It is an M1 shape artifact, not an executable delivery target yet. The goal is
to make the pack split, policy surface, and supported topology concrete enough
to review before deeper implementation work begins.

Files:

- `city.toml`: top-level sample city layout
- `rigs-work.toml`: example `work` rig fragment
- `rigs-personal.toml`: example `personal` rig fragment
- `fixtures/README.md`: notes about the supported local topology

Operational note:

- In the live personal setup we found that plain `gc rig add` is not enough if
  the goal is local-only beads state. A safe add flow also needs:
  - an explicit rig prefix in `city.toml`
  - local `.git/info/exclude` entries for `.beads/`
  - `no-git-ops: true` in rig-local beads config
  - protection against tracked `.gitignore` edits and accidental `bd init`
    commits
- The local `gc-rig-add` helper encodes that workflow today.
