# Implementation Review: superpowers-formula

## Reviewer
- Label: codex
- Categories: all
- Review Profile: general

## Scope
- Spec reviewed: docs/plans/superpowers-formula/spec.md
- Implementation reviewed: changes on current branch

## Verdict
FAIL

The current repository contains adjacent groundwork for formula workflows and an interactive `review-implementation` skill, but it does not implement the core `superpowers-formula` contract. The promised autonomous review-worker formula is missing, `single-session-tracking-workflow` still ends without an explicit review/synthesis stage, and the milestone proof/review discipline from the spec is not encoded in the workflow.

## Blocking Findings
- Missing autonomous review-worker formula and explicit final review stage — `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:19`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:68`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:88`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:448`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/single-session-tracking-workflow.formula.toml:20`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/single-session-tracking-workflow.formula.toml:315`
  Why it matters: the spec makes heavy implementation review a first-class workflow stage and calls for a narrow `mol-review-implementation.formula.toml` that can be slung per runtime. In the shipped code, `gastown/beads/formulas/mol-review-implementation.formula.toml` is absent, and the workflow still goes straight from implement to verify/finalize.
  Suggested action: add `gastown/beads/formulas/mol-review-implementation.formula.toml`, extend `single-session-tracking-workflow` to materialize review inputs, sling at least two reviewer runs via `gt sling --agent`, and synthesize those outputs before finalization.
- Existing review capability remains interactive skill logic, not the narrow autonomous worker the spec requires — `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:104`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:474`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/skills/review-implementation/SKILL.md:246`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/skills/review-implementation/SKILL.md:255`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/skills/review-implementation/SKILL.md:625`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/skills/review-implementation/SKILL.md:695`
  Why it matters: the spec explicitly forbids porting the full interactive review skill into formula form. What exists today still prompts for scope/models and dispatches reviewer lanes from the skill itself, which is the rejected design.
  Suggested action: extract only the autonomous core into a dedicated formula with explicit vars (`feature`, `reviewer_label`, `spec_scope`, `impl_scope`, `categories`, `review_profile`, `output_path`) and keep the interactive skill separate.
- Milestone self-check and proof-model requirements were not implemented — `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:296`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:338`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:453`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/single-session-tracking-workflow.formula.toml:244`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/single-session-tracking-workflow.formula.toml:287`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/single-session-tracking-workflow.formula.toml:323`
  Why it matters: milestones in the current workflow are status markers only. The workflow never requires a structured parent self-check, never offers adaptive single-subagent drift review, and never requires a declared proof model before a milestone can complete.
  Suggested action: add milestone review notes/checklists, explicit proof-model capture, and a risk-triggered drift-review branch before the final review stage.

## Important Findings
- Hook and artifact paths are not self-contained for autonomous review — `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:435`
  Why it matters: this worker was hooked with `docs/plans/superpowers-formula/spec.md`, but that file does not exist in this worktree; the authoritative spec lives under `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md`. That makes the current review hookup brittle and violates the spec's materialized-input intent for fresh workers.
  Suggested action: ensure the parent workflow writes the committed review inputs into repo-visible paths before slinging, or pass resolved paths that are guaranteed to exist for the reviewer runtime.
- Verification evidence is thin and does not satisfy the spec's evidence-based proof expectations — `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:343`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md:579`
  Why it matters: I found no test files, no feature-specific session ledger, and no materialized review outputs for this feature. The branch under review is also identical to `origin/main`, so there is no branch-local implementation evidence to inspect beyond landed history and static files.
  Suggested action: when implementing this feature, capture red/green or explicit alternative proof artifacts in a session ledger and keep review outputs alongside the feature plan.

## Minor Findings
- Documentation still describes the pre-review six-stage workflow — `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/README.md:198`
  Why it matters: the README mirrors the current code and omits the new review stage, which will confuse future users even after the implementation is fixed.
  Suggested action: update the README once the workflow gains the review stage and proof-model behavior.
- Hook scope wording is misleading for this run.
  Why it matters: `impl_scope=changes on current branch` implied an active diff, but `HEAD` is equal to `origin/main`.
  Suggested action: use a materialized base/head range or feature commit range when dispatching autonomous review workers.

## Completion Matrix
| Area | Status | Notes |
|------|--------|-------|
| Completeness | Fail | Core spec deliverables are missing: no review-worker formula, no explicit final review/synthesis stage, no milestone self-check/proof policy. |
| Quality | Mixed | Existing workflow and skill files follow repo conventions, but the available implementation only provides partial groundwork and leaves the key behavior unimplemented. |
| Scope | Mixed | The landed work stayed close to formula/workflow infrastructure, but it stopped short of the specific `superpowers-formula` requirements and used an unresolved external spec path. |
| Standards | Mixed | Repo patterns for formulas/skills are followed, but the outcome violates spec non-negotiables and leaves the autonomous review contract unmet. |

## Scope Drift Notes
- The hook's `spec_scope` resolves outside this worktree to `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md`, which is a drift between the review contract and the runnable workspace layout.
- The current branch has no diff against `origin/main`, so the practical implementation scope is already-landed historical work rather than branch-local changes.
- The repository contains adjacent enabling work (`spec-to-beads` formulas, `single-session-tracking-workflow`, interactive `review-implementation` skill), but not the final `superpowers-formula` behavior described in the spec.

## Verification Notes
- Inspected `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/spec.md`, `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/session-context.md`, and `/Users/chall/gt/toolkit/crew/quick/docs/plans/superpowers-formula/codebase-context.tmp`.
- Reviewed implementation history for commits `03654a2`, `51ddb1a`, `b292faa`, `7be214f`, and `13d4644`.
- Read `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/single-session-tracking-workflow.formula.toml`, `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/beads/formulas/README.md`, and `/Users/chall/gt/toolkit/polecats/furiosa/toolkit/gastown/skills/review-implementation/SKILL.md`.
- Confirmed `gastown/beads/formulas/mol-review-implementation.formula.toml` is missing in this worktree.
- Found no feature-specific tests, session ledger, or existing review outputs to validate an evidence-based proof model.
- Did not execute the formulas themselves; this review is based on static spec/code inspection and git history.
