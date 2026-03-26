# Gas City Formulas

This directory is the currently active formula set for the local Gas City path
in this repo.

It is intentionally the older, molecule-driven workflow family restored from
`gastown/beads/formulas/`, because the newer graph.v2 / workflow-control line
is currently parked in:

- `gascity/formulas-v2/`

Use this directory for the formulas `malaz` should actually resolve today.

## Invocation Surface

For the active local Gas City path, instantiate formulas with:

```bash
gc sling <target> <formula> --formula --var key=value
```

The examples below use that `gc sling` shape for the canonical local surface.

## Why The Rollback

The graph.v2 formula line produced correct workflow graphs, but rig-scoped
control beads were not auto-advanced by the `workflow-control` lane in real
city runs. Until that runtime/store mismatch is fixed, the graph.v2 formulas
remain quarantined.

## Active Formula Family

Spec-centric design and execution formulas for the local delivery pipeline.
Composable expansion formulas and workflow orchestrators support different
delivery modes:

- agent-driven routing into the right delivery mode
- lean single-session delivery (`spec -> enrich -> implement`)
- two-session planned delivery (`spec -> enrich || plans -> execution beads -> owned execution convoy`)

## Architecture

The formulas follow an **expansion/workflow pattern**:

- **Expansion formulas** (`*-expansion.formula.toml`) contain the actual multi-step logic. They use `type = "expansion"` and define `[[template]]` steps with `{target}` placeholders. Expansions run standalone (a synthetic `main` target resolves placeholders automatically) or compose into larger workflows.

- **Workflow formulas** (`*-workflow.formula.toml`) are orchestrators that compose expansion formulas into end-to-end pipelines with either handoff checkpoints or single-session continuity.

**Spec-first, adaptable execution systems:**
- `spec.md` — the durable requirements and design record
- `plan-draft.md` — decomposition plan for manual umbrella/workstream decomposition
- `plans.md` — milestone plan for `delivery-workflow-planned`
- Beads — planned execution beads for the active convoy-based path
- `session-ledger.md` — execution evidence for `delivery-workflow-quick`
- owned convoy — execution tracking artifact for `delivery-workflow-planned`

## The Pipeline

Five primary entry expansions, plus shared workflow support for final
verification and implementation review:

```
┌─────────────┐      ┌─────────────┐      ┌──────────────────────┐
│ Draft Spec  │ ───▶ │   Enrich    │ ───▶ │ Plan / Decompose /   │
│             │      │ (optional,  │      │ Beads                │
│ brief →     │      │  repeatable)│      │                      │
│ spec.md     │      │ spec →      │      │ spec -> plans.md /   │
│             │      │ better spec │      │ plan-draft.md / beads│
└─────────────┘      └─────────────┘      └──────────────────────┘
```

Any entry point works. Already have a spec? Skip to `plan-expansion` or
`decomposition-plan-expansion`. Want more rigor? Run `enrich` multiple times. Wrote the spec
yourself? Go straight to the downstream expansion you need.

## Workflow Map

```mermaid
flowchart TD
    subgraph SHARED["Shared"]
        DS["draft-spec-expansion"]
        EN["enrich-expansion"]
        DP["decomposition-plan-expansion"]
        PL["plan-expansion"]
        EB["execution-beads-expansion"]

        VF["verify-finalize"]
        RS["review-implementation skill"]

        SPEC["spec.md"]
        PLAN_DRAFT["plan-draft.md"]
        PLANS["plans.md"]
        EXEC_BEADS["execution beads"]
        BEADS["beads graph"]
        CONVOY["owned convoy"]
        LEDGER["session-ledger.md"]
    end

    subgraph DELIV1["delivery-workflow-quick"]
        DW_START["start"]
        DW_BOOT["bootstrap"]
        DW_TRACK["tracking-setup"]
        DW_IMPL["stage-implement"]
        DW_REVIEW["review-implementation"]
        DW_DONE["complete"]
    end

    subgraph DELIV2["delivery-workflow-planned"]
        DW2_START["start"]
        DW2_BOOT["bootstrap"]
        DW2_HANDOFF["checkpoint-handoff-ready"]
        DW2_EXEC["execution-setup"]
        DW2_BEADS["execution-beads"]
        DW2_CONVOY["stage-convoy"]
        DW2_DONE["complete"]
    end

    subgraph ROUTER["delivery-workflow"]
        DR_START["start"]
        DR_INSPECT["inspect"]
        DR_SELECT["select-mode"]
        DR_RECORD["record-decision"]
        DR_DONE["output next command"]
    end

    DR_START --> DR_INSPECT
    DR_INSPECT --> DR_SELECT
    DR_SELECT --> DR_RECORD
    DR_RECORD --> DR_DONE
    DR_DONE -. routes to .-> DW_START
    DR_DONE -. routes to .-> DW2_START

    DW_START --> DW_BOOT
    DW_BOOT --> DS
    DS --> EN
    EN --> DW_TRACK
    DW_TRACK --> DW_IMPL
    DW_IMPL --> DW_REVIEW
    DW_REVIEW --> VF
    VF --> DW_DONE

    DW2_START --> DW2_BOOT
    DW2_BOOT --> DS
    DS --> EN
    EN --> DW2_HANDOFF
    DW2_HANDOFF --> DW2_EXEC
    DW2_EXEC --> PL
    PL --> EB
    EB --> DW2_CONVOY
    DW2_CONVOY --> DW2_DONE

    DS -. writes .-> SPEC
    DP -. writes .-> PLAN_DRAFT
    PL -. writes .-> PLANS
    EB -. creates .-> EXEC_BEADS
    BD -. creates .-> BEADS
    DW_IMPL -. updates .-> LEDGER
    DW_REVIEW -. runs .-> RS
    DW2_CONVOY -. stages .-> CONVOY
    DR_RECORD -. writes .-> ROUTE["routing-decision.md"]

    classDef shared fill:#355c3a,color:#fff,stroke:#1f3a24,stroke-width:1px;
    classDef artifact fill:#f4f1e8,color:#333,stroke:#c9bfa8,stroke-width:1px;

    class DS,EN,DP,PL,EB,BD,VF,RS shared;
    class SPEC,PLAN_DRAFT,PLANS,EXEC_BEADS,BEADS,CONVOY,LEDGER,ROUTE artifact;
```

---

### Draft Spec

**Formula:** `draft-spec-expansion`

Turns a brief into a first-draft spec through codebase exploration and interactive dialogue. The formula version of the [brainstorming skill](../../skills/brainstorming/SKILL.md).

**Steps:**
1. Explore codebase — dispatch agent to understand project structure, patterns, related features
2. Draft spec — ask 3-7 focused questions, propose 2-3 approaches, present design incrementally, write spec using [standard template](../docs/templates/spec.md)
3. Cleanup and commit

**Interactive:** The agent asks focused questions and proposes approaches before writing. For a more autonomous draft, provide a detailed brief.

**Input:** Feature name + brief description (1-3 sentences)
**Output:** `docs/plans/{feature}/spec.md`

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name (becomes directory name) |
| `brief` | yes | 1-3 sentence description of what to build |

**Usage:**
```bash
gc sling <target> draft-spec-expansion --formula \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

---

### Enrich

**Formula:** `enrich-expansion`

Reads an existing spec, uses separate slung reviewer sessions to find gaps
across 6 analytical dimensions, auto-fixes what's obvious, asks about what
needs human judgment, and folds everything back into the spec. Can be run
multiple times — each pass finds what the previous missed.

**Dimensions:**
1. **Completeness** — What's missing that would block implementation?
2. **Ambiguity** — What could be interpreted two different ways?
3. **Feasibility** — What's technically hard or impossible given the codebase?
4. **Scope** — Is the boundary clear? Is anything misplaced?
5. **Risks** — What could go wrong that isn't acknowledged?
6. **Consistency** — Does the spec contradict itself or the codebase?

**Steps:**
1. Validate spec exists with the core serialized sections and identify any missing planning sections to strengthen
2. Explore codebase — ground analysis in real code, not assumptions
3. Materialize a shared review bundle and sling 2 separate reviewers
4. Synthesize review-bead notes into `enrichment-findings.tmp`
5. Apply auto-fixes silently
6. Present decisions to human — one at a time, with options and recommendations
7. Fold answers into spec as design statements
8. Cleanup transient files and commit

**Review model:**
- reviewer A: completeness + ambiguity + scope
- reviewer B: feasibility + risks + consistency
- reviewers record full reports on their review beads; the parent session applies fixes

**Findings are classified as:**
- **Auto-fix** — one clearly correct answer (best practice, codebase convention) → applied silently
- **Decision** — multiple valid approaches with real tradeoffs → ask the human

**Input:** `docs/plans/{feature}/spec.md` (any depth)
**Output:** Updated `docs/plans/{feature}/spec.md` (enriched)

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |
**Usage:**
```bash
gc sling <target> enrich-expansion --formula \
  --var feature="ipv6-support"
```

---

### Decomposition Plan

**Formula:** `decomposition-plan-expansion`

Reads a cleaned umbrella spec, generates `plan-draft.md`, runs the default two
decomposition-plan review passes, and leaves behind a manual-decomposition-ready
workstream/sequencing artifact for manual umbrella decomposition.

**Steps:**
1. Validate spec for decomposition planning
2. Draft `plan-draft.md`
3. Review pass 1: coverage + workstream boundaries
4. Review pass 2: sequencing + cross-cutting concerns
5. Finalize plan

**Planning principles:**
- `plan-draft.md` is not a second requirements doc
- workstreams should map to coherent feature/workstream beads
- sequencing should reflect real dependencies, not arbitrary phases
- cross-cutting work should stay visible instead of disappearing between spec and beads

**Input:** `docs/plans/{feature}/spec.md`
**Output:** `docs/plans/{feature}/plan-draft.md`

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |

**Usage:**
```bash
gc sling <target> decomposition-plan-expansion --formula \
  --var feature="ipv6-support"
```

---

### Plan

**Formula:** `plan-expansion`

Reads a cleaned spec, generates `plans.md`, runs the default two slung plan
review passes, and leaves behind a build-ready milestone plan for
`delivery-workflow-planned`.

**Steps:**
1. Validate spec for planning
2. Draft `plans.md`
3. Materialize shared review inputs and sling review pass 1: completeness + scope/constraints
4. Materialize shared review inputs and sling review pass 2: sequencing + testability/risk
5. Finalize plan

**Review model:**
- each pass slings 2 separate reviewers
- reviewers record full reports on their review beads
- the parent session applies fixes between passes

**Planning principles:**
- `plans.md` is a milestone plan, not a second spec
- default to 3-7 milestones
- each milestone needs acceptance criteria and validation evidence
- milestone 1 should validate implementation shape for medium/large work
- add stop conditions for drift that should force re-planning

**Input:** `docs/plans/{feature}/spec.md`
**Output:** `docs/plans/{feature}/plans.md`

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |

**Usage:**
```bash
gc sling <target> plan-expansion --formula \
  --var feature="ipv6-support"
```

---

### Execution Beads

**Formula:** `execution-beads-expansion`

Reads a finalized `plans.md`, derives execution beads from the milestone plan,
and creates the bead graph that a same-session execution skill will work
through.

**Steps:**
1. Validate `spec.md`, `plans.md`, and convoy/tracking context
2. Design execution bead graph from milestone plan
3. Create/reuse execution beads under the owned convoy
4. Repair dependencies and summarize the graph

**Execution-bead principles:**
- one execution bead per milestone
- explicit checkpoint beads for review-stop / shape-review milestones
- one local implementation review gate bead as the final expected execution gate
- bead descriptions stay concise and point back to `spec.md` / `plans.md`
- use beads for execution ownership and dependencies, not as a markdown mirror

**Input:** `docs/plans/{feature}/spec.md`, `docs/plans/{feature}/plans.md`, convoy/tracking context from `session-context.md`
**Output:** Owned-convoy child execution beads with dependency graph

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |

**Usage:**
```bash
gc sling <target> execution-beads-expansion --formula \
  --var feature="ipv6-support"
```

---

## Spec Template

All formulas produce and consume specs using the [standard template](../docs/templates/spec.md):

**Required sections:** Overview, Goals, Scope, Constraints, Acceptance Criteria, Design, Non-Negotiables, Forbidden Approaches, Decision Log, Traceability
**Optional sections:** User Stories / Scenarios, Risks, Testing, Open Questions

The format scales naturally:
- **Small work** (1-3 tasks): 10-20 lines — bullet points in Design, one-line Scope
- **Medium work** (4-10 tasks): 30-100 lines — goals, constraints, acceptance criteria, Design sub-sections, Decision Log entries
- **Large work** (10+ tasks): 100+ lines — full Design sub-sections, Decision Log, Risks, Testing, Traceability

See [docs/templates/spec.md](../docs/templates/spec.md) for the full template.
See [docs/templates/plan-draft.md](../docs/templates/plan-draft.md) for the decomposition plan template used by `decomposition-plan-expansion`.
See [docs/templates/plans.md](../docs/templates/plans.md) for the milestone plan template used by `plan-expansion`.

Related design exploration:
- [Hybrid PRD/Plan Pipeline](../../docs/plans/hybrid-prd-plan-pipeline/spec.md) — selective two-artifact model for umbrella decomposition while keeping single-spec delivery lean
- [Hybrid Formula Sketch](../../docs/plans/hybrid-prd-plan-pipeline/formula-sketch.md) — concrete stage sketch for `plan-expansion` and later workflow-native delivery exploration

## Workflow Formula

### Delivery Router

**Formula:** `delivery-workflow`

Agent-driven selector for the appropriate downstream delivery workflow.

This workflow:
1. inspects the brief, repo, and existing artifacts
2. chooses a delivery mode
3. records the rationale in `routing-decision.md`
4. outputs the exact downstream `gc sling ... --formula` command to run next

It intentionally does not try to self-launch another workflow from inside the
active router molecule; instead it finishes cleanly and tells you which
workflow to run next.

**Modes it can select:**
- `delivery-workflow-quick`
- `delivery-workflow-planned`

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |
| `brief` | yes | 1-3 sentence description |
**Usage:**
```bash
gc sling <target> delivery-workflow --formula \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

---

### Delivery Workflow Quick

**Formula:** `delivery-workflow-quick`

Single uninterrupted Codex session from plan through implementation, shared
implementation review, and verification.
No polecat delegation. Keeps visibility through an owned convoy plus tracking
notes.

```
 Kickoff -> Bootstrap -> Draft Spec -> Enrich -> Tracking Setup -> Implement -> Implementation Review -> Verify + Finalize
```

Use this when context continuity matters more than parallel delegation.

This workflow is a molecule. Treat `bd mol current <molecule-id>` as the only
authority for the next action: execute exactly the current wisp, close it, then
re-run `bd mol current` before doing anything else. Do not work ahead based on
the expected stage order.

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |
| `brief` | yes | 1-3 sentence description |
| `epic_id` | no | Existing tracking bead to reuse |
| `target_branch` | no | Explicit target branch for downstream work |

**Usage:**
```bash
gc sling <target> delivery-workflow-quick --formula \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

---

### Delivery Workflow Planned

**Formula:** `delivery-workflow-planned`

Recommended default delivery workflow when discovery is noisy and you want the
build session to start fresh from committed artifacts, but want execution to
move into beads plus owned convoy tracking instead of staying inside the
formula.

Session 1:
- Bootstrap
- Draft Spec
- Enrich
- Handoff boundary

Session 2:
- Execution Setup
- Plan (`plans.md`)
- Create execution beads
- Finalize execution convoy
- Hand off to `$gascity-epic-delivery` in the same session

```
 Kickoff -> Bootstrap -> Draft Spec -> Enrich -> [handoff] -> Execution Setup -> Plan -> Execution Beads -> Finalize Convoy -> Complete
```

Use this when:
- session 1 includes a lot of brainstorming, web research, prototypes, or
  exploration noise
- you want `enrich` to distill that into a clean `spec.md`
- you want 2 default plan review passes before code starts
- you want implementation to be driven from execution beads rather than from the formula

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |
| `brief` | yes | 1-3 sentence description |
| `epic_id` | no | Existing tracking bead to reuse |
| `target_branch` | no | Explicit target branch for downstream work |

**Usage:**
```bash
gc sling <target> delivery-workflow-planned --formula \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

**How to run Session 1 / Session 2**

The intended boundary is after `enrich`, at the workflow checkpoint step.

Session 1:
1. Start the workflow normally.
2. Run through bootstrap, draft-spec, and enrich.
3. At `checkpoint-handoff-ready`, verify the spec is ready to hand off.
4. Close that checkpoint step.
5. Run `gc handoff <subject>` to end the session cleanly.

Session 2:
1. Start a fresh crew session as normal.
2. Check the hook with `gc hook` if you need to confirm the pending assignment manually.
3. Run `bd mol current <molecule-id>`.
4. Continue from the next step, which should be `stage-execution-setup`.

This is an operational boundary, not a special workflow pause primitive. The
resume behavior relies on the normal hooked molecule flow: close the current
step, hand off, then let the next session resume the next current step.

When the workflow completes, execution no longer lives in the formula. The next
step is to use `$gascity-epic-delivery` to work the owned convoy and close the
execution beads in the current session.

---

## Review Worker Formula

### Implementation Review Worker

**Formula:** `mol-review-implementation`

Single-reviewer implementation-vs-spec audit. Intended to be slung once per
runtime and once per review lens, with parent-side synthesis handled by the
calling workflow.

Use this as the autonomous review worker for the final stage of
`delivery-workflow-quick`, `delivery-workflow-planned`, or other Codex-native
workflows that want a
structured review artifact without a human-interactive skill session.

**Review model:**
- Core categories stay fixed: completeness, quality, scope, standards
- `categories` should usually stay `all`
- Domain expertise is applied through `review_profile`, not new categories
- One run appends one durable report to its own review bead
- Optional completion mail can point the owner back to that bead
- Review workers are report-only tasks and should not commit review artifacts

**Typical usage:**
```bash
gc sling <target> mol-review-implementation --formula \
  --var feature="ipv6-support" \
  --var reviewer_label="codex" \
  --var spec_scope="/Users/chall/gt/toolkit/.runtime/reviews/ipv6-support/run-001/spec.md" \
  --var impl_scope="integration/ipv6-support" \
  --var categories="all" \
  --var review_profile="general" \
  --var report_to="$BD_ACTOR"
```

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |
| `reviewer_label` | yes | Label for this reviewer run |
| `spec_scope` | yes | Spec or planning scope to review |
| `impl_scope` | yes | Implementation scope to review |
| `categories` | no | Review dimensions; defaults to `all` |
| `review_profile` | no | Domain lens; defaults to `general` |
| `report_to` | no | Optional completion-mail recipient |
| `output_path` | no | Deprecated compatibility var; review beads are now canonical |

The intended default final-review stack is:
- general Codex review
- general Claude review
- optional specialist review when domain fit is strong

---

## Design Principles

**Spec-first:** `spec.md` remains the source of truth for requirements,
constraints, and decision history. Additional planning artifacts should stay
focused on execution structure, not duplicate the spec.

**Composable capabilities:** Each formula is a standalone building block. Run
one, run several, or compose into the workflow that fits the delivery mode
(umbrella decomposition, single-session delivery, or two-session delivery).

**Selective planning artifacts:** Use `plans.md` when it buys cleaner build
execution. Do not force a heavyweight planning document on every workflow.

**Signal over noise:** `enrich` uses 6 analytical dimensions that surface real
gaps, not exhaustive question generation. Auto-fix what's obvious, ask only
about genuine decisions.

**Clean session boundaries:** When discovery is noisy, split after `enrich` so
the build session starts from committed artifacts rather than exploratory chat
history or prototype code.

**Flexible entry points:** Have a brief? Run `draft-spec`. Already have a spec?
Skip to `plan-expansion` or `decomposition-plan-expansion`. Want more rigor? Run `enrich` again.
Any entry, any exit.
