# Spec-to-Beads Pipeline

## Overview

Replace a rigid 8-stage, 16-document pipeline with a composable system
that produces two artifacts: a spec and beads. The old system (gt-toolkit)
required running all stages in order, generated ~150 questions to find ~20
that mattered, and produced a plan document that was ~80% redundant with
the spec. Users couldn't enter the pipeline mid-stream (e.g., "I already
have a plan, just give me beads") and ended up bypassing it entirely for
small-to-medium work.

The new system has three composable expansion formulas (draft-spec, enrich,
beadify), one workflow orchestrator, a standard spec template, and supporting
skills. Any formula can be run standalone. The spec is the single design
record, scaling from 10 lines to 200 by adding depth, not documents.

## Design

### Spec as Single Document

The spec replaces three old documents (PRD, spec, plan). It scales by
depth rather than document count:

- **Small work** (1-3 tasks): 10-20 lines. Bullet points in Design, one-line Scope.
- **Medium work** (4-10 tasks): 30-100 lines. Design sub-sections, Decisions table.
- **Large work** (10+ tasks): 100+ lines. Full Design sub-sections, Risks, Testing.

Template at `docs/templates/spec.md`. Required sections: Overview, Design,
Scope. Optional sections: Decisions, Risks, Testing, Open Questions.

### Eliminating the Plan

The old plan document had two parts:
1. Design context (architecture decisions, cross-cutting concerns, error handling) — ~80% redundant with the spec
2. Task list (phases, tasks, acceptance criteria, dependencies) — the only part beadify consumed

The new system folds #1 into the spec and makes #2 an internal step inside
beadify (the `beads-draft.md` transient file). No separate plan document exists.

### Three Expansion Formulas

**draft-spec-expansion**: Brief → spec.md. Explores codebase, asks 3-7
focused questions, proposes 2-3 approaches, writes spec using standard
template. Interactive — the formula version of the brainstorming skill.

**enrich-expansion**: Spec → enriched spec. Analyzes across 6 dimensions
(completeness, ambiguity, feasibility, scope, risks, consistency). Each
finding classified as auto-fix (apply silently) or decision (ask human).
Repeatable — each pass deepens the spec.

The 6 dimensions replaced the old 3-perspective question generation
(User Advocate, Product Designer, Domain Expert) which produced ~150
questions per run. The old approach asked "generate at least 10 questions
per category" — volume by design. The new approach asks "what's actually
missing or ambiguous?" — judgment by design. Informed by the upstream
`mol-prd-review` formula's analytical dimension approach (requirements,
gaps, ambiguity, feasibility, scope, stakeholders).

**beadify-expansion**: Spec → beads. Explores codebase (3 parallel agents:
architecture, integration surface, patterns), decomposes spec into tasks,
writes transient `beads-draft.md`, runs 3 review passes (completeness,
dependencies, clarity), shows human preview, creates beads via `bd create`,
deletes transient files. Absorbs the old plan-writing and beads-creation
stages into one formula.

### One Workflow Orchestrator

**epic-delivery-workflow**: Composes draft-spec → enrich → beadify with
checkpoints between stages for crash recovery and session handoffs. Its role
is to decompose an umbrella initiative into feature/workstream beads that are
then expected to kick off `delivery-workflow`.

### Transient Process Files

All intermediate files are created and deleted within a single formula run:
- `codebase-context.tmp` — codebase exploration output
- `enrichment-findings.tmp` — enrich analysis results
- `beads-draft.md` — task decomposition draft (needed for review passes)
- `architecture.tmp`, `integration-surface.tmp`, `patterns-conventions.tmp` — beadify's 3-agent exploration

Only `spec.md` and beads persist.

### Supporting Skills

- **brainstorming**: Interactive skill version of draft-spec. For use in
  any agent session without formula orchestration.
- **multi-model-evaluate**: Ad-hoc multi-model review of any document.
  Dispatches same prompt to available model CLIs, synthesizes consensus
  and disagreements. Replaces manual multi-session paste-and-combine.
- **epic-delivery**: Dispatches beads to polecats for swarm execution.
- **review-implementation**: Reviews code against spec post-implementation.

### Expansion/Workflow Architecture

All formulas use the Gas Town expansion pattern:
- `type = "expansion"` with `[[template]]` steps and `{target}` placeholders
- Run standalone (synthetic `main` target) or compose into workflows via `[compose.expand]`
- `-expansion` suffix on building blocks, `-workflow` suffix on orchestrators

## Scope

In:
- Spec template and format standard
- draft-spec, enrich, beadify expansion formulas
- spec-to-beads workflow orchestrator
- brainstorming, multi-model-evaluate, epic-delivery, review-implementation skills
- README documentation for repo and formulas

Out:
- Multi-model dispatch for enrich (bead `tool-9bw` tracks this — CLIs, parallel dispatch, synthesis logic from old formulas)
- Conversational router ("what do you have, what do you want" entry point)
- Old formula cleanup/archival in gt-toolkit repo
- Bead-description-as-input for beadify (reading epic description directly instead of spec file)
- Testing on real features

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One doc vs many | One spec, no separate PRD/plan | Plan was ~80% redundant with spec. Beadify only consumed the task list. Fewer docs = less ceremony = more usage. |
| Question generation vs analytical dimensions | 6 analytical dimensions | Old 3-perspective approach generated 150+ questions to find ~20. Dimensions surface real gaps without volume noise. |
| Spec always vs optional | Always create a spec | Even for small work, a 10-line spec beats plan-mode output. Gives a consistent input format for beadify. |
| Plan as separate doc vs internal to beadify | Internal (beads-draft.md, transient) | The task decomposition is valuable but doesn't need to persist. Draft exists for review passes, then gets deleted. |
| Pipeline stages vs a la carte | A la carte (composable expansions) | Old pipeline couldn't be entered mid-stream. Any formula now runs standalone. Workflow composes them for full rigor. |
| Multi-model for enrich vs beadify | Enrich only (future) | Enrich does subjective gap analysis — benefits from diverse perspectives. Beadify does mechanical verification — single model suffices. |
| Auto-fix vs ask for everything | Auto-fix obvious, ask decisions | Old system asked human about everything including obvious best practices. New system only escalates genuine multi-option trade-offs. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Beadify task decomposition quality without a separate planning stage | Tasks may be less detailed than old 2-stage (plan then beadify) approach | Beadify does its own 3-agent codebase exploration + 3 review passes. The planning work still happens, just internally. |
| Thin specs producing poor beads | Garbage in, garbage out — 10-line spec may yield shallow tasks | Beadify always explores codebase regardless of spec depth. Enrich available as optional quality gate. |
| Formulas untested on real work | Prompt engineering issues won't surface until real usage | Priority follow-up: test each formula on a real feature before relying on them. |

## Open Questions

- [ ] Should beadify accept a bead ID as input (read epic description as the spec)?
- [ ] What does the conversational router look like if built? Skill or formula?
- [ ] Should old gt-toolkit formulas be archived in-repo or deleted?
