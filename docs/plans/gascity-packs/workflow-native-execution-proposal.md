# Workflow-Native Execution Proposal

Goal:
- redesign `quick` and `planned` so graph.v2 owns execution directly
- stop depending on external convoy child beads as the runnable graph
- make required review/checkpoint steps structural instead of advisory

This proposal is intentionally scoped to the canonical delivery workflows.
It is not a proposal to replace every external bead/convoy use case in Gas City.

## Prototype Status

Initial prototype files now exist:
- [execute-delivery.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/execute-delivery.formula.toml)
- [execution-wave-item-expansion.formula.toml](/Users/chall/gt/toolkit/crew/quick/gascity/formulas/execution-wave-item-expansion.formula.toml)
- [check-execution-loop.sh](/Users/chall/gt/toolkit/crew/quick/gascity/packs/base/scripts/check-execution-loop.sh)

Current prototype scope:
- attached workflow entry
- durable execution-state path
- Ralph-driven wave loop
- dynamic execution-item fanout
- wave reconciliation hook

Still intentionally unresolved:
- concrete `plans.md` to wave derivation
- structural review-stop modeling inside execution waves
- whether convoys remain as mirrors or disappear from canonical execution

## Problem Statement

Today the canonical planned path still splits into two systems:

1. formulas produce planning artifacts and execution beads
2. `gascity-epic-delivery` skill manually walks the convoy-tracked execution beads

That means:
- graph.v2 is used for orchestration around execution, not for execution itself
- required checkpoints like implementation review are still partly enforced by
  skill behavior rather than by graph readiness
- the scheduler for actual implementation is still "inspect convoy + intersect
  with `bd ready` + pick next bead"

Historically that was necessary because external beads/convoys were the only
durable way to represent "work through these tasks in order until done."

With graph.v2, the better match for `quick` and `planned` is:
- derive a workflow-native execution graph from `plans.md`
- let graph.v2 own scheduling/readiness
- treat convoy/external beads as optional mirrors or reporting surfaces, not as
  the scheduler

## Current Limitation

An attached graph.v2 workflow can be slung onto an existing bead, but it still
only schedules workflow-owned steps under one `gc.root_bead_id`.

It does **not** natively adopt:
- a pre-existing convoy
- arbitrary pre-existing execution beads
- the dependency graph between those external beads

So a new `execute-delivery` workflow cannot simply "take over" the existing
external convoy bead graph. If we want formula-native execution, we need a
workflow-native runnable graph.

## Design Principle

For `quick` and `planned`, external execution beads are an implementation
detail, not the true goal.

The true goal is:
- derive an executable plan
- work through it in order
- allow controlled parallelism where appropriate
- enforce checkpoints like review
- persist execution state durably

The redesigned execution model should express that directly in graph.v2.

## Proposed Model

Use a new attached execution workflow that derives workflow-native execution
waves from `plans.md`.

High-level shape:

```text
source bead
  -> execute-delivery workflow root
       -> execution body
           -> load context
           -> prepare execution state
           -> compute next wave
           -> fanout execution items for that wave
           -> reconcile wave
           -> optional review/checkpoint wave
           -> repeat until complete
           -> finalize
```

### Core Idea: Waves, Not External Beads

The workflow runtime is good at:
- explicit scopes
- dynamic fanout
- waiting on children
- checkpoint/finalize control

It is not a natural scheduler for an arbitrary mutable external bead graph.

So the execution model should be:
- sequential milestones
- or parallel waves with explicit barriers

instead of:
- "here is an arbitrary external bead graph, please schedule it"

## New Formula Surfaces

### 1. `execute-delivery.formula.toml`

A new graph.v2 workflow attached to a source bead.

Likely variables:
- `feature`
- `source_issue`
- `execution_mode` (`quick` or `planned`)
- `target_branch`
- `spec_path`
- `plans_path`

Likely steps:
- `kickoff`
- `body`
- `load-context`
- `prepare-execution-state`
- `build-wave`
- `run-wave`
- `reconcile-wave`
- `review-wave` or `review-checkpoint` when required
- `finalize`
- optional teardown

### 2. `execution-wave-item-expansion.formula.toml`

A rootless expansion fragment for one executable plan item.

This is the workflow-native replacement for what an external execution bead
currently represents.

Likely internal shape:
- `workspace-setup`
- `implement`
- `self-review`
- `record-item-result`

This fragment should borrow from:
- `mol-scoped-work`
- `mol-work-branch-ready`

but stop at the correct local execution boundary for the delivery workflow.

### 3. `execution-review-lane-expansion.formula.toml`

A review fanout fragment for implementation review/checkpoint work.

This would likely reuse the shared reviewer pool and bead-native reporting
pattern already being introduced for enrich/plan.

### 4. Optional `execution-checkpoint-expansion.formula.toml`

If we want named review-stop or shape-check milestones to be reusable, make
them a dedicated fragment rather than embedding all logic in the parent
workflow.

## Execution State Surface

Because this model does not rely on external execution beads as the durable
state carrier, we need a workflow-native state surface.

Recommended:
- `docs/plans/<feature>/execution-state.json`

Why:
- durable across sessions
- easy to inspect and diff
- not dependent on one runtime process
- explicit source of truth for which plan items are pending / in progress / done

Suggested contents:
- `feature`
- `execution_mode`
- `target_branch`
- `items`
  - `id`
  - `title`
  - `wave`
  - `depends_on`
  - `kind` (`implement`, `review`, `checkpoint`)
  - `status`
  - `work_dir`
  - `branch`
  - `evidence`
  - `last_result`

Possible secondary mirror:
- root/body bead metadata for compact summary

## How Execution Would Work

### Phase 1: Load and normalize

`load-context`
- read `spec.md`
- read `plans.md`
- read or initialize `execution-state.json`
- resolve target branch
- verify current branch/worktree posture

Metadata role:
- continuation entry

### Phase 2: Build next wave

`build-wave`
- inspect `execution-state.json`
- determine which items are ready
- emit `gc.output_json`

Output shape:

```json
{
  "items": [
    {
      "item_id": "M1",
      "title": "Milestone 1: shape validation",
      "kind": "implement",
      "base_branch": "main"
    }
  ]
}
```

### Phase 3: Fanout execution items

`build-wave` uses `on_complete` to fan out one `execution-wave-item-expansion`
fragment per ready item.

This is the actual execution frontier.

### Phase 4: Reconcile wave

`reconcile-wave`
- waits for `children-of(build-wave)`
- reads item result metadata / notes
- updates `execution-state.json`
- decides whether:
  - execution is complete
  - another implementation wave is ready
  - a required review/checkpoint wave must run
  - execution is blocked/failing

### Phase 5: Review/checkpoint enforcement

If a milestone requires review before downstream work can continue:
- `reconcile-wave` emits a review manifest
- review fanout runs
- synthesis/checkpoint step waits for review children
- only then can the next implementation wave become ready

This is the major gain over the skill model:
- review is enforced by readiness
- the parent agent cannot just decide to skip it

### Phase 6: Finalize

`finalize`
- summarize plan vs actual
- record verification state
- optionally mirror to convoy/tracking bead
- close the execution workflow cleanly

## Planned vs Quick Under This Model

### Quick

`quick` becomes:
- spec/enrich
- workflow-native execution body
- required review checkpoint
- verify/finalize

No external execution beads required.

### Planned

`planned` becomes:
- discovery body
- planning body
- workflow-native execution body
- milestone/wave execution derived from `plans.md`
- required review/checkpoint nodes
- finalize

The main difference from quick is:
- planned starts from a richer `plans.md`
- planned may have more explicit review-stop milestones and wave structure

## Convoy / External Beads in the New Model

There are 3 possible choices.

### Option A: No external execution beads

Use only workflow-native execution.

Pros:
- cleanest model
- no split-brain scheduler
- fewer moving parts

Cons:
- lose the familiar external execution graph surface

### Option B: Mirror-only convoy

Keep a convoy as a reporting/tracking surface only.

Pros:
- preserves shared status lens
- avoids convoy as scheduler

Cons:
- duplicated state surface

### Option C: Hybrid compatibility period

Support both:
- workflow-native execution as canonical
- optional mirrored external execution beads during migration

Pros:
- safer migration

Cons:
- most complexity

Recommendation:
- long term: Option A or B
- migration period: Option C if needed

## What We Gain

- required review/checkpoints become structural
- one scheduler: graph.v2
- less imperative skill logic
- stronger alignment between formula shape and execution behavior
- easier reuse of reviewer fanout patterns
- better same-session execution ownership

## What We Lose

- easy manual repair of external execution bead graphs
- arbitrary mutable DAG scheduling through normal beads
- some operator visibility tied to convoy child lists

## Major Tradeoff

This redesign favors:
- repeatable execution structure
- milestone/wave semantics
- enforced checkpoints

over:
- arbitrary mutable external bead graphs
- operator-driven bead picking

For `quick` and `planned`, that is likely the right trade.

## Migration Plan

### Phase 1
- finish v2 conversion of current canonical formulas
- keep current `execution-beads-expansion` + `gascity-epic-delivery`

### Phase 2
- prototype `execute-delivery.formula.toml`
- prototype `execution-wave-item-expansion.formula.toml`
- run against a small sample `plans.md`

### Phase 3
- wire `quick` to workflow-native execution
- compare behavior against current quick path

### Phase 4
- wire `planned` to workflow-native execution
- decide whether external execution beads remain as mirror/reporting only

### Phase 5
- retire or narrow `gascity-epic-delivery`

## Open Questions

1. Should `execution-state.json` be the canonical state surface, or should bead
   metadata carry more of the durable state?
2. Do we want wave numbers explicitly in `plans.md`, or infer waves from
   milestone dependencies?
3. Should implementation review be:
   - a per-wave checkpoint
   - a milestone-tagged checkpoint
   - a single capstone review
4. Do we keep a convoy mirror for operator visibility?
5. Should the execution item fragment stop at branch-ready, or run all the way
   through local verification/final submission?
