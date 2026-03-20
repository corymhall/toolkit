# M3 Work Pack Review

This note supports the M3 human stop for
`gascity-packs: work pack safe branch flow and worker lifecycle`.

## Local Artifacts To Review

- `gastown/packs/work/worker-lifecycle.md`
- `gastown/packs/work/metadata-contract.md`
- `gastown/packs/work/formulas/README.md`
- `gastown/packs/work/prompts/README.md`

## Current M3 Position

- the local `work` pack stops at the branch-only / resumable handoff boundary
- the implementation bead should close at that boundary
- later PR/review/fixup stages should be modeled as downstream workflow beads
- refinery-style merge handling is out
- follow-up should reuse the same worker template from durable metadata, not a
  surviving worker session
- durable continuation should come from bead-scoped `metadata.work_dir`, not
  from the pool session's own `work_dir`
- the worker metadata contract should be explicit and reviewable
- edge cases and limitations should be documented before prompt/formula wording
  is treated as settled

## Questions To Resolve Before Leaving M3

- What exact branch-only stop boundary do we want?
- Is the proposed metadata contract complete?
- Which edge cases do we need to make explicit before work-pack prompt/formula
  text is trusted?
- What behavior must be blocked by config/formula wiring instead of prompt text?

## Current Edge-Case Set

- `work_dir` recorded but missing on disk
- branch recorded but only exists remotely or only exists locally
- worker stops before push and follow-up happens later
- base branch moves while work is paused
- same branch/work item is re-slung while another continuation path is active
- user abandons the line of work and the bead-scoped worktree must be cleaned up
- supported redirect/shared-store topology is unavailable
- implementation bead closes but no downstream PR/review/fixup bead is created
