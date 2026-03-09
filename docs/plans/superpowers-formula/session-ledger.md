# Session Ledger

## Status

- Feature: `superpowers-formula`
- Branch: `integration/superpowers-formula`
- State: review-driven refinement in progress

## Implementation Checklist

- [x] Investigate superpowers skill-by-skill against Gastown
- [x] Define Codex evaluation lens
- [x] Draft and revise `superpowers-formula` spec
- [x] Add `mol-review-implementation` review worker formula
- [x] Extend `single-session-tracking-workflow` with final review stages
- [x] Shift review artifacts to shared rig-root `.runtime/reviews/...`
- [x] Validate Codex review sidecar end-to-end
- [x] Validate Claude review sidecar end-to-end
- [ ] Tighten proof-model enforcement and minor workflow/docs gaps

## Proof Model

- This feature is primarily workflow/documentation/formula behavior, not a runtime product feature.
- Declared proof model:
  - inspect committed branch diff on `origin/integration/superpowers-formula`
  - run real sling-based review workers against that pushed branch
  - require shared `.runtime` review artifacts
  - verify sidecar lifecycle returns to `idle` after `gt done --cleanup-status clean`

## Evidence

- Shared review artifacts:
  - `/Users/chall/gt/toolkit/.runtime/reviews/superpowers-formula/20260308-191426/codex-review.md`
  - `/Users/chall/gt/toolkit/.runtime/reviews/superpowers-formula/20260308-192223/claude-review.md`
- Verified sidecar behavior:
  - report written to shared `.runtime` path
  - no review artifact commit required
  - review wisp closed
  - polecat returned to `idle`

## Commands Run

- `gt sling mol-review-implementation toolkit --agent codex ...`
- `gt sling mol-review-implementation toolkit --agent claude ...`
- `gt peek toolkit/<polecat>`
- `gt polecat status toolkit/<polecat>`
- `gt hook show toolkit/<polecat>`
- `find /Users/chall/gt/toolkit/.runtime/reviews/superpowers-formula/...`
- `git push origin integration/superpowers-formula`

## Files Changed

- `AGENTS.md`
- `docs/plans/superpowers-formula/codebase-context.tmp`
- `docs/plans/superpowers-formula/session-context.md`
- `docs/plans/superpowers-formula/session-ledger.md`
- `docs/plans/superpowers-formula/spec.md`
- `gastown/beads/formulas/README.md`
- `gastown/beads/formulas/mol-review-implementation.formula.toml`
- `gastown/beads/formulas/single-session-tracking-workflow.formula.toml`
- `gastown/docs/codex-evaluation-lens.md`

## Open Risks / Follow-ups

- The workflow still needed stronger proof-model enforcement language after review.
- The specialist-review path needs a clearer worked example.
- The header/docs sequence needed cleanup to match the actual 8-stage flow.
