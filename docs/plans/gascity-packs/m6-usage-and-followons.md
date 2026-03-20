# M6 Usage And Follow-Ons

This note is the minimum usage-oriented companion to the local `gascity-packs`
artifacts in this repo.

## Where The Local Artifacts Live

- local pack roots: `gastown/packs/`
- local sample city fixture: `gastown/cities/local/`
- planning and review notes: `docs/plans/gascity-packs/`

## What These Artifacts Represent Today

- `base/` defines the local owner-session and shared-policy surface
- `work/` defines the conservative branch-only worker direction
- `personal/` defines the more autonomous personal-only direction
- `gastown/cities/local/` shows how the split is expressed from config
- the real city root is expected to live outside this repo (for example
  `~/city`) and consume these local pack/fixture ideas

These are implementation-shaping artifacts, not a claim that the full runtime
behavior is already finished.

## Current Safety Assumptions

- `.beads` should stay out of normal repo commits via redirect + ignore
- contributor routing should remain explicit and overrideable
- `work` behavior must be structurally incapable of direct push/merge to `main`
- follow-up work should rely on durable metadata and fresh sessions, not on a
  long-lived worker staying alive forever

## Explicitly Deferred

- final prompt wording for `base`, `work`, and `personal`
- final worker-formula text and PR-handling behavior
- broader cross-repo storage topologies beyond the first supported shape
- personal-only landing behavior beyond the initial direction notes
