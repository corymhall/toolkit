# Hybrid PRD/Plan Pipeline

## Overview

Introduce a selective two-artifact planning model for umbrella work without
giving up the simpler single-spec model that fits Codex-native implementation.

Today Gastown uses one `spec.md` format across both `epic-delivery-workflow`
and `delivery-workflow`. That uniformity is convenient, but it also means we
blur two different jobs:

1. defining what the work is, why it matters, and what constraints apply
2. defining how the work should be decomposed and sequenced

This proposal keeps a single persisted `spec.md` as the source of truth for
requirements and decisions, but adds explicit planning artifacts where they are
most useful:

- `spec.md` stays the durable requirements and design record
- `plan-draft.md` becomes a decomposition and sequencing artifact for
  `epic-delivery-workflow` / `beadify`
- `plans.md` becomes a lightweight milestone plan for session 2 of
  `delivery-workflow v2`

The goal is to borrow the useful separation from PRD-plus-plan systems without
reintroducing the old over-ceremonial pipeline.

## Design

### Artifact Model

#### 1. `spec.md` as the durable requirements artifact

`docs/plans/<feature>/spec.md` remains the persisted source of truth, but it
should become slightly more PRD-like for umbrella work.

Recommended required sections:

- `Overview`
- `Goals`
- `Scope`
- `Constraints`
- `User Stories / Scenarios` when user behavior matters
- `Acceptance Criteria`
- `Design`
- `Non-Negotiables`
- `Forbidden Approaches`
- `Decision Log`
- `Traceability`

Recommended optional sections:

- `Risks`
- `Testing`
- `Open Questions`

Intent:

- `Overview`, `Goals`, `Scope`, `Constraints`, `User Stories / Scenarios`, and
  `Acceptance Criteria` answer "what are we trying to achieve?"
- `Design`, `Non-Negotiables`, `Forbidden Approaches`, `Decision Log`, and
  `Traceability` answer "what implementation shape is already locked in?"

This keeps our strongest current serialization features while making the front
half of the document easier to review as a requirements artifact.

#### 2. `plan-draft.md` as the decomposition artifact

Add `docs/plans/<feature>/plan-draft.md` only for umbrella decomposition flows.

This document is not a PRD. It is a working plan for turning the spec into
feature/workstream beads. It should answer:

- what coherent feature/workstream beads should exist
- what order or dependency structure they need
- what integration or validation work cuts across them
- which open questions block decomposition vs can be deferred

Suggested structure:

```markdown
# <Feature Name> Decomposition Plan

## Planning Intent
- What this plan is optimizing for
- Expected output granularity (feature beads, workstreams, integration bead)

## Workstreams
### <Workstream / feature>
- Why it exists
- Scope covered
- Likely files / systems touched
- Acceptance signal

## Sequencing
- Dependency table
- Notes on merge-gated vs code-order dependencies
- Parallelism opportunities

## Cross-Cutting Concerns
- Testing / validation
- Migration / rollout
- Docs / operational work

## Open Planning Questions
- Items that still affect decomposition quality
```

Unlike `spec.md`, this artifact is execution-structure-first. It is the place
to review sequencing, risk concentration, parallelism, and bead boundaries.

#### 3. `plans.md` as the implementation milestone artifact

Add `docs/plans/<feature>/plans.md` for `delivery-workflow v2`.

This is intentionally smaller than the umbrella `plan-draft.md`. It is not
trying to decompose an initiative into multiple feature beads. It is trying to
force a fresh build session to think ahead before code starts.

This document should answer:

- what milestones will prove the feature is on the right track
- what acceptance signal exists for each milestone
- what validation commands or proof are expected before moving on
- where an early human review should happen before the feature is fully built

Suggested structure:

```markdown
# <Feature Name> Milestone Plan

## Planning Intent
- What this plan is optimizing for
- Why the milestone breakdown is sufficient

## Milestones
### M1. Shape Validation
- Goal
- Planned changes
- Acceptance criteria
- Validation commands / proof
- Review stop: yes

### M2. Core Behavior
- Goal
- Planned changes
- Acceptance criteria
- Validation commands / proof
- Review stop: no

### M3. Integration + Hardening
- Goal
- Planned changes
- Acceptance criteria
- Validation commands / proof
- Review stop: optional

## Drift Risks
- What could still force architectural rework if discovered late

## Stop Conditions
- Conditions that require updating the plan before continuing
```

Practical rules:

- default to 3-7 milestones
- each milestone must have explicit acceptance criteria
- each milestone must have explicit validation evidence or commands
- at least one early milestone must be a shape-validation checkpoint
- if the milestone plan changes materially, update it before continuing

### Workflow Placement

#### `epic-delivery-workflow`

Recommended future shape:

1. Bootstrap
2. Draft spec
3. Enrich spec
4. Generate `plan-draft.md`
5. Review `plan-draft.md`
6. Beadify from `plan-draft.md` plus `spec.md`

This is where the extra structure earns its keep. Umbrella work benefits from a
clean separation between:

- requirements and constraints (`spec.md`)
- decomposition and sequencing (`plan-draft.md`)

#### `beadify-expansion`

`beadify` should consume:

- `spec.md` for goals, scope, constraints, decisions, traceability
- `plan-draft.md` for workstream boundaries, sequencing, and cross-cutting work

The existing review passes should shift slightly:

- completeness: does every spec/design element map into the plan and beads?
- dependencies: does the plan's sequencing survive contact with bead edges?
- clarity: can a fresh agent act on each resulting bead?

#### `delivery-workflow`

Do not require the umbrella `plan-draft.md`.

For single-feature implementation, adopt a lighter second artifact:

- `spec.md` remains the source artifact
- `plans.md` becomes a required milestone plan in session 2
- `session-context.md` and `session-ledger.md` capture execution state and proof
- heavyweight review still happens at the implementation boundary
- one earlier review stop happens after the first shape-validation milestone

Recommended 2-session shape:

Session 1: Discovery / convergence

1. Bootstrap
2. Draft spec
3. Enrich spec
4. Stop after `spec.md` is clean enough to act as the handoff contract

Session 2: Planning / build

1. Tracking setup
2. Generate `plans.md`
3. Plan review pass 1: completeness + scope/constraints
4. Plan review pass 2: sequencing + testability/risk
5. Implement milestone 1
6. Review checkpoint: shape validation
7. Continue milestones 2..N
8. Launch final review
9. Monitor + synthesize
10. Verify + finalize

The purpose of `plans.md` is not to restate the spec. It is to reduce the odds
that the first meaningful human feedback arrives only after the full feature is
built.

### `delivery-workflow v2` session boundary

The default split should happen after `enrich`, not before it.

Reasoning:

- Session 1 can be noisy: web research, alternative designs, scratch
  prototypes, parallel discussions, false starts.
- `enrich` is the stage that turns that noise into a stable artifact.
- Session 2 should start fresh from files, not from exploratory chat history.

Required handoff contract from session 1 into session 2:

- `spec.md` is committed
- `Decision Log` captures material trade-offs
- `Non-Negotiables` and `Forbidden Approaches` are explicit
- `Open Questions` contains only items that truly remain unresolved
- `Traceability` is current enough that session 2 can trust the artifact

If those conditions are not met, session 1 should keep iterating. Do not start
session 2 from a partially converged spec.

### Prototype handling

Prototypes are optional and should be treated as learning tools, not as part of
the build handoff contract.

When a prototype exists in session 1:

- use it to answer questions quickly
- preserve what was learned
- do not make the messy prototype code the default reference for session 2

What should survive the prototype:

- what question the prototype tested
- what worked
- what failed
- what constraints or edge cases were discovered
- what design choice changed because of the prototype
- what should explicitly not be copied into the final implementation

What should usually not survive the prototype:

- direct references like "follow the prototype"
- messy temporary structure becoming architectural precedent
- low-quality scratch code in the main build path

Recommended distillation format when needed:

```markdown
## Prototype Finding P-1
Question tested:
What we tried:
Observed result:
Implication for final design:
Carry forward:
Do not copy:
```

Then fold the results into the durable artifacts:

- design choice -> `Decision Log`
- hard lesson -> `Constraints`
- anti-pattern discovered -> `Forbidden Approaches`
- residual uncertainty -> `Open Questions`
- concrete implementation guidance -> `Design`

Default rule:

- prototype code may inform session 1
- prototype findings may survive into session 2
- prototype code itself should not be part of the normal handoff unless a small
  isolated piece is intentionally promoted

### `delivery-workflow v2` review boundary

The workflow should add one explicit mid-run review boundary for medium and
large work.

Target placement:

- after milestone 1
- after the feature's shape is visible
- before the whole feature is built

That checkpoint should ask:

- does the implementation shape still match the spec intent?
- did we discover any architectural drift or hidden scope?
- does the remaining milestone plan still make sense?
- are there changes needed now that would be expensive later?

If the answer is "yes, big changes are needed," the workflow should revise
`plans.md` and `spec.md` before continuing. This is the mechanism intended to
make end-of-run review findings smaller.

### `delivery-workflow v2` artifact contract

For the implementation workflow, the artifact split becomes:

- `spec.md`: requirements, constraints, design intent, decision history
- `plans.md`: milestone sequence, acceptance criteria, validation commands,
  early review stop
- `session-ledger.md`: actual execution, evidence, surprises, and remaining risk

This gives the workflow a place to encode planning rigor without turning the
ledger into a plan or forcing the spec to carry all execution structure.

### Review Model

Do not adopt a mandatory 6-round review loop as the default.

Adopt 2 plan review passes as the default.

Instead:

- `enrich` continues reviewing the spec as a requirements artifact
- new plan generation gets 2 explicit review passes by default:
  - pass 1: completeness + scope/constraints
  - pass 2: sequencing + testability/risk
- `delivery-workflow v2` gets one early milestone review stop plus final review
- `beadify` retains its current task-readiness review passes
- `delivery-workflow` uses a 2-session split by default: converge through
  `enrich`, then start a fresh planning/build session

Escalate beyond 2 passes only when the work is unusually large, ambiguous, or
expensive to rework late. That heavier mode can borrow more from the 6-round
structure without making it the baseline for normal feature work.

This keeps the useful separation from PRD/plan systems while staying aligned
with the Codex evaluation lens:

- main-session ownership where possible
- explicit artifacts
- review at meaningful boundaries
- no default dependence on subagent-heavy orchestration

### Migration Path

Phase 1:

- extend `spec.md` template with `Goals`, `Constraints`, and `Acceptance Criteria`
- make `User Stories / Scenarios` recommended for user-facing work

Phase 2:

- add a new expansion such as `plan-expansion`
- compose it into `epic-delivery-workflow` before `beadify`

Phase 3:

- teach `beadify` to read both artifacts
- keep fallback support for spec-only input

Phase 4:

- add `plans.md` generation to `delivery-workflow`
- require a milestone-1 review stop for medium/large work

Phase 5:

- optionally add a stronger 6-pass rigor mode for unusually large feature delivery
- do not make the heavyweight mode the default

## Scope

In:

- selective PRD/plan separation for umbrella decomposition
- richer `spec.md` requirements sections
- new `plan-draft.md` artifact for `epic-delivery-workflow`
- new `plans.md` artifact for `delivery-workflow v2`
- a default 2-session split for feature delivery: convergence, then planning/build
- optional prototype distillation during session 1 when exploratory code exists

Out:

- replacing `spec.md` with a pure product-only PRD
- requiring the umbrella `plan-draft.md` for every feature
- mandatory 6-round review loops
- fragmenting implementation across many build sessions by default

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One universal artifact vs selective split | Selective split | Umbrella decomposition and feature implementation benefit from different kinds of plans. |
| Persisted source of truth | Keep `spec.md` | Our current serialized constraints and decision history are valuable and should stay central. |
| Where to add the extra artifact | `epic-delivery-workflow` / `beadify` first | That is where decomposition quality matters most. |
| Delivery planning artifact | Add `plans.md` | A compact milestone plan is the cheapest way to shrink late-stage churn in a fresh build session. |
| Default review intensity | 2 plan review passes, not 6 | Two passes add real planning pressure without turning normal feature work into ceremony. |
| `delivery-workflow` default | Use a 2-session split with lightweight planning | Keeps noisy exploration out of the build session while still forcing enough upfront thinking. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `spec.md` becomes too large or repetitive | Medium | Keep `plan-draft.md` focused on decomposition only; do not duplicate design prose there. |
| Multi-artifact model confuses users | Medium | Give each artifact one job, document the split clearly, and keep the implementation plan short. |
| `beadify` complexity increases | Medium | Add fallback support for spec-only input while the new path matures. |
| `plans.md` becomes a redundant mini-spec | Medium | Enforce milestone-only content and keep requirements/design truth in `spec.md`. |
| Prototype code leaks into the final build path as accidental precedent | Medium | Distill prototype findings into the spec and avoid using the prototype itself as the session-2 reference. |
| We recreate the old over-ceremonial pipeline | High | Keep the split to 2 sessions, keep review loops short, and avoid reintroducing many persistent intermediate docs. |

## Open Questions

- Should `Goals`, `Constraints`, and `Acceptance Criteria` be required for all
  specs, or only required in `epic-delivery-workflow`?
- Should `plan-draft.md` persist after bead creation, or remain a transient file
  like today's `beads-draft.md`?
- Should `plans.md` always persist for delivery runs, or be allowed to stay
  transient for very small features?
- Should the session-1/session-2 handoff be a dedicated artifact, or is a clean
  `spec.md` plus commit enough?
- Should prototype findings live only in the spec, or should there be a small
  dedicated `prototype-findings.md` when exploration is substantial?
- Should plan review live in a dedicated `plan-expansion`, or be folded into
  `beadify` as an early stage?
