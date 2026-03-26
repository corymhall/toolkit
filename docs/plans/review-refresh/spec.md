# Review Refresh

## Overview

We are retiring the current interactive `review-implementation` skill and
replacing it with a smaller review system built around two distinct modes:

1. manual review kicked off explicitly by the user
2. workflow-owned review that runs as part of delivery or epic execution

The current skill is too broad. It mixes review intake, scope discovery,
reviewer transport, multi-agent synthesis, issue creation, remediation, and
implementation follow-up in one surface. That makes it hard to trust, hard to
modify, and hard to fit cleanly into newer Gas City execution patterns.

The replacement design should be Codex-native first:

- Codex subagents provide the primary review system
- specialist review lenses are modeled as reviewer agents, not giant category
  trees
- one optional non-Codex review lane provides an extra perspective when useful
- workflow review stays report-oriented and parent-owned rather than becoming a
  nested self-sling maze

## Goals

- G-1: Separate manual review from workflow review.
- G-2: Make Codex-native subagents the default review engine.
- G-3: Support specialist review lenses without turning the main review entry
  point into a giant orchestration script.
- G-4: Keep workflow review parent-owned, deterministic, and report-oriented.
- G-5: Preserve one optional external or fresh-worker review lane for an
  independent perspective.
- G-6: Keep PR review as a separate surface focused on GitHub review comments.

## Out of Scope

- Replacing `review-pr`.
- Building a full automated PR-comment bot into the manual review skill.
- Recreating the entire Anthropic plugin ecosystem locally.
- Porting the old interactive `review-implementation` behavior into a new
  monolith.
- Making workflow review depend on nested self-sling from an already-active
  workflow session.

## User Modes

### 1. Manual Review

This is the "I want a review now" case.

Examples:

- review the current diff before commit
- review this branch against `spec.md`
- review this PR locally before using `review-pr`
- review a set of files with a particular lens

The result is a review report and next-step guidance. The manual review surface
does not automatically create beads, fix the code, or run a remediation tree.

### 2. Workflow Review

This is the "review is a structural part of delivery" case.

Examples:

- final implementation review in `delivery-workflow-quick`
- implementation review bead in epic delivery
- checkpoint review in a future workflow-native execution graph

The result is a workflow-owned checkpoint:

- parent session launches review lanes
- parent session synthesizes findings
- parent session decides whether to loop back to fixes or continue

## Key Decisions

### D-1: Retire the interactive `review-implementation` skill

Delete:

- `gascity/skills/review-implementation/`
- `gastown/skills/review-implementation/`

Do not replace it with another giant skill.

### D-2: Add a new small manual review skill

Create a new skill:

- `general/skills/request-review/`

This is the manual entry point for implementation/code review that is not
specifically about GitHub review comments.

### D-3: Keep `review-pr` separate

`review-pr` remains the surface for reviewing a GitHub PR and producing draft
comments for approval before posting. It should not be collapsed into
`request-review`.

### D-4: Keep `mol-review-implementation`, but narrow its job

`mol-review-implementation` stays as a workflow-sidecar primitive, but it is
no longer "the review system." It becomes:

- one reviewer
- one report
- no synthesis
- no issue creation
- no implementation follow-up

Its main role is to provide an independent fresh-worker or alternate-runtime
perspective when a workflow wants one.

### D-5: No nested self-sling from active workflow ownership

Do not design workflow review around slinging a new formula to the same already
active owner session.

Rationale:

- `delivery-workflow.formula.toml` already says not to self-launch another
  workflow from inside an active molecule
- sidecar review launching already exists as the intended pattern
- self-sling while already owning active work is harder to reason about than
  in-session subagents plus explicit sidecars

### D-6: Codex-native subagents are the primary reviewers

The review system should default to Codex-native subagents launched from the
owning session. These lanes can be tailored by prompt and lens.

### D-7: One optional extra outside perspective

By default, the system should add at most one non-Codex generic review lane
when extra independence is valuable.

This is not meant to duplicate the full Codex review stack. It is an extra
perspective, not a parallel bureaucracy.

## Architecture

### A. Manual Review Skill

Proposed surface:

- `general/skills/request-review/SKILL.md`
- `general/skills/request-review/agents/openai.yaml`
- `general/skills/request-review/references/reviewer-lenses.md`
- `general/skills/request-review/references/target-shapes.md`

#### Contract

Inputs:

- review target
  - current diff
  - branch/ref range
  - file set
  - spec path + implementation scope
  - PR URL/number for local-only review preparation
- requested review lenses
- whether to add one external lane

Behavior:

- gather the target scope directly
- launch Codex-native reviewer subagents
- optionally launch one extra generic external lane
- synthesize findings
- stop after reporting

Outputs:

- findings grouped by severity
- concise completion or confidence summary
- suggested next step

Non-goals:

- no issue creation
- no fix implementation
- no "address all vs customize" remediation tree
- no giant interactive wizard

#### Default manual reviewer set

- `general-reviewer`
- `spec-alignment-reviewer` when spec/plan context exists
- `test-reviewer` when behavior or test changes are in scope

Optional lenses:

- `error-handling-reviewer`
- `type-contract-reviewer`
- domain reviewers such as `go-development` or
  `neovim-plugin-development`

### B. Reviewer Agent Library

We should model specialist review as reusable reviewer prompts/lenses instead of
as giant conditionals inside one skill.

Initial proposed reviewer set:

- `general-reviewer`
  - broad correctness, maintainability, obvious risk
- `spec-alignment-reviewer`
  - requirements, acceptance criteria, scope drift
- `test-reviewer`
  - test quality, missing coverage, weak assertions
- `error-handling-reviewer`
  - silent failures, recovery paths, observability
- `type-contract-reviewer`
  - type/API contract soundness, invariants, boundary shape

Optional domain reviewers:

- `go-reviewer`
- `neovim-reviewer`

These do not need to be implemented as platform-level custom subagent roles.
They can begin as prompt packages or reference files used when spawning Codex
subagents from the parent session.

### C. Workflow Review

Workflow review should be owned by the parent session, not outsourced to a
manual skill.

Workflow pattern:

1. parent session materializes review inputs
2. parent launches Codex-native review subagents directly
3. parent optionally launches one independent sidecar review via
   `mol-review-implementation`
4. parent synthesizes results
5. parent decides whether the workflow continues or loops back to fixes

This keeps workflow control local while still allowing fresh-worker review.

### D. `mol-review-implementation`

Keep the formula, but narrow its intended use.

#### Revised purpose

`mol-review-implementation` is a sidecar review worker that writes one
structured report from one reviewer lane.

Best-fit uses:

- workflow wants one independent fresh-worker report
- workflow wants one non-Codex or alternate-runtime perspective
- workflow wants a durable shared review artifact under `.runtime/reviews/...`

#### Revised non-goals

- not the manual review entry point
- not a synthesis engine
- not the place where categories or remediation logic grow forever
- not a nested self-review workflow for the already-active owner session

#### Recommended simplifications

- keep `review_profile`
- keep one-reviewer/one-report contract
- keep report-only behavior
- default `categories` to `all` and consider removing it from most callers
- simplify wording so it reads as "independent review lane" rather than
  "the main review feature"

## Self-Sling Answer

### Should `mol-review-implementation` be slung as part of workflow or epic delivery?

Yes, but only as a separate review lane routed to a reviewer target or pool.

No, not as a nested self-sling to the same already-active owner session.

Recommended rule:

- parent workflow may sling `mol-review-implementation` to sidecar reviewer
  targets
- parent workflow should not self-sling a new review formula onto itself while
  it is already running active workflow work

### Why

- active workflow ownership should remain easy to reason about
- parent-owned synthesis is already the preferred model
- sidecar review provides the "fresh eyes" property that self-sling does not
- local docs already steer away from self-launching active workflows

## Migration Plan

### Phase 1: Establish the new surfaces

Create:

- `general/skills/request-review/`

Review and simplify:

- `gascity/formulas/mol-review-implementation.formula.toml`
- `gastown/beads/formulas/mol-review-implementation.formula.toml`

### Phase 2: Remove workflow references to the retired skill

Replace direct `$review-implementation` references in:

- `gascity/skills/gascity-epic-delivery/SKILL.md`
- `gastown/skills/gastown-epic-delivery/SKILL.md`
- `gascity/formulas/execution-beads-expansion.formula.toml`
- `gastown/beads/formulas/execution-beads-expansion.formula.toml`
- `gascity/formulas-v2/execution-beads-expansion.formula.toml`
- `gascity/formulas/delivery-workflow-quick.formula.toml`
- `gastown/beads/formulas/delivery-workflow-quick.formula.toml`

Replacement wording should point to a workflow-owned implementation review
checkpoint, not to a manual skill.

### Phase 3: Define the workflow-owned review recipe

Document or extract a shared review recipe that says:

- launch these Codex-native reviewer lanes
- add one optional sidecar `mol-review-implementation` lane
- synthesize in parent
- loop back on blocking findings

This may live as:

- a shared reference doc first
- then a reusable expansion later if repetition becomes a problem

### Phase 4: Retire the old skill

Delete:

- `gascity/skills/review-implementation/`
- `gastown/skills/review-implementation/`

Update docs and README references to the new split.

## Proposed First Implementation Slice

1. Add `general/skills/request-review/` as a minimal manual review launcher.
2. Simplify `mol-review-implementation` around independent sidecar review.
3. Update workflow and epic-delivery references away from
   `$review-implementation`.
4. Defer richer specialist-agent fanout until the small core feels right.

## Acceptance Criteria

- A-1: There is no longer a monolithic interactive `review-implementation`
  skill.
- A-2: Manual review has a small dedicated entry point.
- A-3: Workflow review does not depend on a manual review skill.
- A-4: `mol-review-implementation` has a clearly narrow, sidecar-oriented job.
- A-5: The design explicitly forbids nested self-sling review ownership inside
  an already-active workflow session.
- A-6: Codex-native subagents are the primary review mechanism.
- A-7: One optional external review lane can be added without becoming the
  center of the system.

