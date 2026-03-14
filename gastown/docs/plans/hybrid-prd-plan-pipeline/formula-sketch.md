# Formula Sketch

This document translates the hybrid pipeline proposal into concrete formula
shapes.

The corresponding formula files now exist under `gastown/beads/formulas/`:

- `plan-expansion.formula.toml`
- `delivery-workflow-v2.formula.toml`

The intent is to answer:

- what new expansion would exist
- where the 2-session split happens
- what the default review passes do
- what artifacts each stage reads and writes

## Proposed Additions

### New expansion: `plan-expansion`

Purpose:

- read a cleaned `spec.md`
- generate `plans.md`
- run 2 default plan review passes
- leave behind a build-ready milestone plan for session 2

Input:

- `docs/plans/{{feature}}/spec.md`

Output:

- `docs/plans/{{feature}}/plans.md`

Non-goals:

- does not implement code
- does not replace `beadify`
- does not own final review

### Revised orchestrator: `delivery-workflow v2`

Purpose:

- split noisy convergence from clean planning/build execution
- force a lightweight milestone plan before code starts
- add one early review boundary before the whole feature is built

Session split:

- Session 1 ends after `enrich`
- Session 2 starts from committed artifacts only

## `plan-expansion` Shape

Suggested file:

- `gastown/beads/formulas/plan-expansion.formula.toml`

Suggested stages:

1. `kickoff`
2. `validate-spec`
3. `draft-plan`
4. `review-pass-1`
5. `review-pass-2`
6. `finalize-plan`

### Stage details

#### 1. `kickoff`

Banner only.

Artifacts:

- reads nothing
- writes nothing

#### 2. `validate-spec`

Validate that `spec.md` is ready to be turned into a build plan.

Checks:

- required sections exist
- `Decision Log` is non-placeholder
- `Non-Negotiables` and `Forbidden Approaches` are explicit
- `Open Questions` is not carrying avoidable ambiguity
- if prototype findings exist, they have been distilled into the spec rather
  than left as "see prototype"

Artifacts:

- reads `spec.md`
- writes no durable artifact

#### 3. `draft-plan`

Generate `plans.md` from the spec.

Expected `plans.md` shape:

- `Planning Intent`
- `Milestones`
- `Drift Risks`
- `Stop Conditions`

Milestone rules:

- 3-7 milestones by default
- each milestone has:
  - goal
  - planned changes
  - acceptance criteria
  - validation commands / proof
  - review stop flag
- milestone 1 must be a shape-validation milestone for medium/large work

Artifacts:

- reads `spec.md`
- writes `plans.md`

#### 4. `review-pass-1`

Default focus:

- completeness
- scope
- constraints

Questions this pass answers:

- does the plan cover all material spec goals?
- is anything important missing?
- does any milestone violate a constraint or non-goal?
- did prototype learnings get reflected as rules instead of code cargo cult?

Expected outcomes:

- revise `plans.md`
- optionally revise `spec.md` if the plan reveals a spec problem

Artifacts:

- reads `spec.md`, `plans.md`
- writes `plans.md`
- may update `spec.md`

#### 5. `review-pass-2`

Default focus:

- sequencing
- testability
- risk

Questions this pass answers:

- is the milestone order correct?
- can each milestone be validated before continuing?
- what could still force late rework?
- where do we need explicit stop-and-replan conditions?

Expected outcomes:

- revise `plans.md`
- optionally revise `spec.md` if unresolved ambiguity remains

Artifacts:

- reads `spec.md`, `plans.md`
- writes `plans.md`
- may update `spec.md`

#### 6. `finalize-plan`

Produce the final handoff for session 2 build execution.

Output should report:

- plan path
- milestone count
- review findings applied
- remaining open questions, if any
- whether milestone 1 review stop is required

Artifacts:

- reads `spec.md`, `plans.md`
- writes no new durable artifact

## `delivery-workflow v2` Shape

Suggested file:

- `gastown/beads/formulas/delivery-workflow-v2.formula.toml`

Suggested stages:

### Session 1: Discovery / convergence

1. `kickoff`
2. `stage-bootstrap`
3. `stage-draft-spec`
4. `stage-enrich`
5. `checkpoint-handoff-ready`

### Session 2: Planning / build

6. `stage-tracking-setup`
7. `stage-plan`
8. `stage-implement-m1`
9. `checkpoint-shape-review`
10. `stage-implement-rest`
11. `stage-final-review-launch`
12. `stage-final-review-monitor`
13. `stage-verify-finalize`
14. `complete`

### Session 1 details

#### `kickoff`

Report that this is a 2-session workflow.

#### `stage-bootstrap`

Same job as current delivery workflow:

- resolve/create root epic
- create integration branch
- initialize session context

#### `stage-draft-spec`

Compose `draft-spec-expansion`.

#### `stage-enrich`

Compose `enrich-expansion`.

#### `checkpoint-handoff-ready`

This is the session boundary.

Required checks before handoff:

- `spec.md` committed
- `Decision Log` complete enough for a fresh session
- `Non-Negotiables` / `Forbidden Approaches` explicit
- `Open Questions` trimmed to real unresolved issues
- prototype findings distilled if prototypes were used

This step should explicitly tell the agent to stop here and hand off unless the
workflow is intentionally being continued in the same session for testing.

### Session 2 details

#### `stage-tracking-setup`

Same general role as today:

- resolve tracking mode
- update root epic
- create milestone beads if desired

#### `stage-plan`

Compose `plan-expansion`.

Artifacts after this step:

- `spec.md`
- `plans.md`
- `session-context.md`

#### `stage-implement-m1`

Implement milestone 1 only.

Rules:

- read `plans.md`
- declare proof model in `session-ledger.md`
- execute only milestone 1 scope
- run milestone 1 validation
- record files changed, commands run, evidence, risks

Artifacts:

- reads `spec.md`, `plans.md`
- writes `session-ledger.md`

#### `checkpoint-shape-review`

This is the early review stop intended to shrink final churn.

Review questions:

- does milestone 1 prove the right implementation shape?
- do `spec.md` and `plans.md` still match reality?
- are there architectural or scope surprises?
- should milestones 2..N be revised before continuing?

Allowed outcomes:

- continue unchanged
- revise `plans.md`
- revise `spec.md` and `plans.md`
- stop and re-plan if the shape is wrong

#### `stage-implement-rest`

Implement remaining milestones.

Rules:

- follow `plans.md`
- update `session-ledger.md` after each milestone
- if a stop condition fires, revise the plan before continuing

#### `stage-final-review-launch`

Same core pattern as current delivery workflow:

- checkpoint commit
- push branch
- materialize review artifacts under `.runtime`
- sling sidecar reviewers

Additional review inputs:

- include `plans.md` in the shared review directory

#### `stage-final-review-monitor`

Same core monitoring and synthesis logic as current workflow.

Additional synthesis question:

- did the implementation actually honor the milestone plan, or drift from it?

#### `stage-verify-finalize`

Same role as today:

- run verification
- finalize tracking
- append final epic note
- summarize what shipped and what remains

## Artifact Contract By Session

### End of session 1

Required durable artifacts:

- `spec.md`
- `session-context.md`

Optional:

- prototype findings distilled into `spec.md`

### End of session 2

Required durable artifacts:

- `spec.md`
- `plans.md`
- `session-context.md`
- `session-ledger.md`
- review reports under `.runtime`

## Follow-On Decisions

The concrete formula files and README updates now exist. Remaining design
decisions include:

1. whether old `delivery-workflow` remains as the lean single-session option
2. whether `delivery-workflow-v2` becomes the documented default
3. whether `plan-expansion` should eventually grow a heavier rigor mode
4. whether `plans.md` should always persist or be optional for very small work
