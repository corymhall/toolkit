# Gastown Beads Agent Notes

These rules apply to work under `gastown/beads/`, especially the workflow and
expansion formulas.

## Core Principle

If two workflows mean the same thing at runtime, they should say the same
thing at runtime.

Treat wording in formula step descriptions as behavioral guidance, not prose
decoration. Do not casually rewrite or "simplify" shared wording.

## Shared vs Specific

Prefer this hierarchy when changing formulas:

1. If behavior is truly shared across workflows, extract it into an expansion.
2. If behavior is shared but too small to justify extraction, keep the wrapper
   wording byte-identical across workflows.
3. If behavior actually differs, keep separate steps and document the reason.

Good candidates for shared expansions:
- bootstrap
- final-review-launch
- monitor-synthesize
- verify-finalize

Do not force extraction when lifecycle behavior is meaningfully different.
Example: `tracking-setup` currently differs between `delivery-workflow` and
`delivery-workflow-v2`, so it should not be merged just for symmetry.

## Artifact Boundary Rule

Beads are for coordination state; markdown is for synthesized understanding.

Use markdown for:
- `spec.md`
- `plan-draft.md`
- `plans.md`
- `session-ledger.md`
- other durable planning/synthesis artifacts

Use beads for:
- ownership
- status
- dependencies
- routing
- automation hooks

Do not stuff full specs or milestone plans into bead descriptions/comments.
Bead descriptions should be concise execution contracts that point back to the
markdown artifacts when needed.

## Workflow Shape Rule

For the delivery workflows, prefer:
- same shell where meaning is shared
- inserted phases where behavior differs

`delivery-workflow-v2` should be understood as:
- `delivery-workflow`
- plus inserted planning/session-boundary phases
- plus genuinely different execution stages where needed

Not as a separately rewritten workflow.

## Editing Rule

When adjusting a shared stage:
- compare against sibling workflows mechanically
- preserve existing wording unless there is a concrete reason to change it
- if you change wording, be ready to explain the exact behavioral reason

If a user points out removed wording that guarded against known bad behavior,
restore it unless there is a very strong reason not to.

## Validation Rule

After changing formulas:
- parse all `*.formula.toml` files
- inspect diffs for unintended wording drift
- prefer refactors that reduce future manual parity work

## Router Rule

The current `delivery-router-workflow` is a selector, not a self-branching
workflow engine. It should inspect, decide, record, and output the next
workflow to run. Do not pretend the current molecule model supports elegant
in-place branching if it does not.
