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
- `owner-work.md.tmpl` prompt override for the shared `owner` agent
