# Work Pack

Owns the local work-repo-safe behavior for the Gas City pack family.

Intended contents:

- branch-only worker prompts and formulas
- conservative worktree and resumability helpers
- work-specific crew/owner prompt variants
- no direct-to-main or merge-to-main assumptions

Current runnable surface:

- branch-only `worker` agent + `mol-work-branch-ready`
- investigation-only `triage` agent + `mol-triage-work`
- investigation-only `triagev2` agent for raw-bead manual issue triage that stays open until explicitly drained
- `owner-work-v2.md.tmpl` prompt override for the shared `owner` agent

Work-pack owner prompts should stay minimal, but they should still make the
crew/rig checkout split explicit:

- the crew checkout's `origin` points at the rig checkout
- the crew session pushes feature branches to that rig checkout
- landing happens through the repo's normal PR/review workflow, not by merging
  the default branch from the crew checkout
- after landing, the crew checkout should sync back to the updated base branch
