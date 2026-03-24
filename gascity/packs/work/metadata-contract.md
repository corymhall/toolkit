# Work Pack Metadata Contract

The local `work` pack should treat these bead fields as the durable contract for
resumable work:

- `work_dir`
- `branch`
- `target`
- `push_remote`
- `base_branch`

Optional follow-up fields:

- `rejection_reason`
- review-specific continuation notes

## Intent

The worker session is disposable. The metadata is the durable handoff surface.

That means follow-up after review should come from:

- the recorded branch/worktree state
- the recorded metadata
- the same worker template

It should not come from:

- a permanently running worker session
- hidden local state outside the recorded worktree/metadata

## Current M3 Direction

- the implementation bead closes at the branch-ready handoff boundary
- downstream convoy beads own PR/review/fixup stages
- a fresh worker session should resume from this metadata plus the recorded
  branch/worktree state
- keep the metadata contract minimal and let the bead graph encode stage, rather
  than adding a separate `handoff_state` field by default

## Review Questions

- Is this the minimum metadata contract, or are we still missing a field?
- Which fields are safe to rely on across crashes, rejection, and re-entry?
