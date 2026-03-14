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
requirements and decisions, but adds an optional planning artifact for umbrella
decomposition:

- `spec.md` stays the durable requirements and design record
- `plan-draft.md` becomes a decomposition and sequencing artifact used only in
  `epic-delivery-workflow` / `beadify`

The goal is to borrow the useful separation from PRD-plus-plan systems without
making `delivery-workflow` pay the cost of an extra document on every feature.

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

Do not require `plan-draft.md`.

For single-feature implementation, keep the current shape:

- `spec.md` remains the source artifact
- `session-context.md` and `session-ledger.md` capture execution state and proof
- heavyweight review stays at the implementation boundary

If a feature is unusually large, `delivery-workflow` may optionally create a
local `plan-draft.md`, but that should be an opt-in rigor mode rather than the
default path.

### Review Model

Do not adopt a mandatory 6-round review loop as the default.

Instead:

- `enrich` continues reviewing the spec as a requirements artifact
- new plan generation gets 1-2 explicit review rounds, not 6
- `beadify` retains its current task-readiness review passes
- `delivery-workflow` retains final implementation review after code exists

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

- optionally add a "high-rigor" mode to `delivery-workflow`
- do not make it the default

## Scope

In:

- selective PRD/plan separation for umbrella decomposition
- richer `spec.md` requirements sections
- new `plan-draft.md` artifact for `epic-delivery-workflow`
- preserving Codex-native single-session delivery as the default implementation path

Out:

- replacing `spec.md` with a pure product-only PRD
- requiring `plan-draft.md` for every feature
- mandatory 6-round review loops
- moving implementation ownership out of the main Codex session

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One universal artifact vs selective split | Selective split | Umbrella decomposition benefits from a separate plan; single-feature delivery usually does not. |
| Persisted source of truth | Keep `spec.md` | Our current serialized constraints and decision history are valuable and should stay central. |
| Where to add the extra artifact | `epic-delivery-workflow` / `beadify` first | That is where decomposition quality matters most. |
| Default review intensity | 1-2 plan rounds, not 6 | Keeps the borrowed structure without importing too much orchestration overhead. |
| `delivery-workflow` default | Remain single-spec | Better fit for Codex continuity and implementation ownership. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `spec.md` becomes too large or repetitive | Medium | Keep `plan-draft.md` focused on decomposition only; do not duplicate design prose there. |
| Two-artifact model confuses users | Medium | Use it only in `epic-delivery-workflow` at first; document when each artifact is expected. |
| `beadify` complexity increases | Medium | Add fallback support for spec-only input while the new path matures. |
| We recreate the old over-ceremonial pipeline | High | Keep the split selective, keep review loops short, and preserve single-session implementation for delivery. |

## Open Questions

- Should `Goals`, `Constraints`, and `Acceptance Criteria` be required for all
  specs, or only required in `epic-delivery-workflow`?
- Should `plan-draft.md` persist after bead creation, or remain a transient file
  like today's `beads-draft.md`?
- Should plan review live in a dedicated `plan-expansion`, or be folded into
  `beadify` as an early stage?
