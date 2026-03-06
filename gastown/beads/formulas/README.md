# Formulas

Spec-centric design and execution formulas for the `gt sling` pipeline. Three composable expansion formulas and two workflow orchestrators for different execution styles:
- delegation-safe (spec -> enrich -> beadify -> dispatch)
- single-session tracked delivery (spec -> enrich -> implement in one session)

## Architecture

The formulas follow an **expansion/workflow pattern**:

- **Expansion formulas** (`*-expansion.formula.toml`) contain the actual multi-step logic. They use `type = "expansion"` and define `[[template]]` steps with `{target}` placeholders. Expansions run standalone (a synthetic `main` target resolves placeholders automatically) or compose into larger workflows.

- **Workflow formulas** (`*-workflow.formula.toml`) are orchestrators that compose expansion formulas into end-to-end pipelines with either handoff checkpoints or single-session continuity.

**One document, adaptable execution systems:**
- `spec.md` — the design record (only persisted document)
- Beads — either full execution decomposition (beadify) or lightweight tracking (single-session workflow)
- Everything else is transient (created during a formula run, deleted after)

## The Pipeline

Three expansion formulas, each independently runnable:

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Draft Spec  │ ───▶ │   Enrich    │ ───▶ │  Beadify    │
│             │      │ (optional,  │      │             │
│ brief →     │      │  repeatable)│      │ spec →      │
│ spec.md     │      │ spec →      │      │ beads       │
│             │      │ better spec │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
```

Any entry point works. Already have a spec? Skip to beadify. Want more rigor? Run enrich multiple times. Wrote the spec yourself? Go straight to beadify.

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
gt sling draft-spec-expansion <crew> \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

---

### Enrich

**Formula:** `enrich-expansion`

Reads an existing spec, finds gaps across 6 analytical dimensions, auto-fixes what's obvious, asks about what needs human judgment, and folds everything back into the spec. Can be run multiple times — each pass finds what the previous missed.

**Dimensions:**
1. **Completeness** — What's missing that would block implementation?
2. **Ambiguity** — What could be interpreted two different ways?
3. **Feasibility** — What's technically hard or impossible given the codebase?
4. **Scope** — Is the boundary clear? Is anything misplaced?
5. **Risks** — What could go wrong that isn't acknowledged?
6. **Consistency** — Does the spec contradict itself or the codebase?

**Steps:**
1. Validate spec exists with required sections (Overview, Design, Scope)
2. Explore codebase — ground analysis in real code, not assumptions
3. Analyze spec across 6 dimensions — classify each finding as auto-fix or decision
4. Apply auto-fixes silently
5. Present decisions to human — one at a time, with options and recommendations
6. Fold answers into spec as design statements
7. Cleanup transient files and commit

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
gt sling enrich-expansion <crew> \
  --var feature="ipv6-support"
```

---

### Beadify

**Formula:** `beadify-expansion`

The execution entry point. Reads a spec (any depth), explores the codebase, decomposes into tasks, runs 3 review passes, and creates beads with validated dependencies.

**Steps:**
1. Validate spec exists
2. Codebase exploration — 3 parallel agents (architecture, integration surface, patterns & conventions)
3. Task decomposition — spec + codebase analysis → `beads-draft.md` (transient)
4. Review pass 1: Completeness — every spec Design element has a task
5. Review pass 2: Dependencies — only true blockers, maximize parallelism
6. Review pass 3: Clarity — each task implementable from description alone
7. Human preview — show proposed structure, allow edits
8. Execute — create beads via `bd create` with deps
9. Cleanup transient files

**Task decomposition principles:**
- Tasks must be self-contained (implementable with zero prior context)
- Be specific, not generic (real file paths, real function signatures)
- Maximize parallelism (only add true blocking dependencies)
- Acceptance criteria must be verifiable

**Input:** `docs/plans/{feature}/spec.md` (any depth — 10 lines or 200)
**Output:** Beads epic with tasks and dependency graph

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |

**Usage:**
```bash
gt sling beadify-expansion <crew> \
  --var feature="ipv6-support"
```

---

## Spec Template

All formulas produce and consume specs using the [standard template](../docs/templates/spec.md):

**Required sections:** Overview, Design, Scope, Non-Negotiables, Forbidden Approaches, Decision Log, Traceability
**Optional sections:** Risks, Testing, Open Questions

The format scales naturally:
- **Small work** (1-3 tasks): 10-20 lines — bullet points in Design, one-line Scope
- **Medium work** (4-10 tasks): 30-100 lines — Design sub-sections + Decision Log entries
- **Large work** (10+ tasks): 100+ lines — full Design sub-sections, Decision Log, Risks, Testing, Traceability

See [docs/templates/spec.md](../docs/templates/spec.md) for the full template.

## Workflow Formula

### Spec-to-Beads

**Formula:** `spec-to-beads-workflow`

Composes all three expansion formulas into the full pipeline with checkpoints between stages. For maximum rigor from a raw idea to execution-ready beads.

```
Kickoff → Draft Spec → [checkpoint] → Enrich → [checkpoint] → Beadify → Complete
```

Checkpoints support crash recovery and session handoffs — if a session ends mid-workflow, the next session picks up at the last checkpoint.

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |
| `brief` | yes | 1-3 sentence description |
**Usage:**
```bash
gt sling spec-to-beads-workflow <crew> \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

---

### Single-Session Tracking

**Formula:** `single-session-tracking-workflow`

Single uninterrupted Codex session from plan through implementation and verification.
No polecat delegation. Keeps Gastown visibility with either:
- `milestones` mode: a few milestone child tasks
- `epic-only` mode: one root epic with progress notes

```
Kickoff -> Bootstrap -> Draft Spec -> Enrich -> Tracking Setup -> Implement -> Verify + Finalize
```

Use this when context continuity matters more than parallel delegation.

**Vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `feature` | yes | Feature name |
| `brief` | yes | 1-3 sentence description |
| `epic_id` | no | Existing root epic to reuse |
| `tracking` | no | `milestones` (default) or `epic-only` |

**Usage:**
```bash
gt sling single-session-tracking-workflow <crew> \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components" \
  --var tracking="milestones"
```

---

## Design Principles

**One document:** The spec is the single design record. No separate PRD, no separate plan. The spec scales from 10 lines to 200 by adding depth, not documents.

**Composable capabilities:** Each formula is a standalone building block. Run one, run all three, or compose into the workflow that fits the delivery mode (delegation-safe or single-session).

**Transient process:** Codebase context, review findings, beads drafts — all created and deleted within a single formula run. Durable artifacts are the spec plus selected tracking/execution beads.

**Signal over noise:** Enrich uses 6 analytical dimensions that surface real gaps, not exhaustive question generation. Auto-fix what's obvious, ask only about genuine decisions.

**Flexible entry points:** Have a brief? Run draft-spec. Already have a spec? Skip to beadify. Want more rigor? Run enrich (once or multiple times). Any entry, any exit.
