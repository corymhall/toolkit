# toolkit

A collection of skills, formulas, packs, and templates for AI-assisted
software engineering.

This repo now has three top-level areas:

- `general/` — product-agnostic engineering skills
- `gascity/` — canonical Gas City assets for the current model
- `gastown/` — legacy / compatibility Gas Town assets

Planning docs stay at the top level under `docs/plans/` because they are
session-planning artifacts for this repo, not installable namespace content.

## General Skills

Language-specific development skills, review tools, and multi-model evaluation. No dependencies on Gas Town or Beads.

| Skill | Description |
|-------|-------------|
| [multi-model-evaluate](general/skills/multi-model-evaluate/) | Dispatch the same question to multiple AI models, synthesize consensus and disagreements. |
| [review-pr](general/skills/review-pr/) | Review a teammate's PR and produce draft comments for your approval before posting to GitHub. |
| [go-development](general/skills/go-development/) | Implement, refactor, and review production Go code using Google-style conventions. |
| [neovim-plugin-development](general/skills/neovim-plugin-development/) | Build, review, and modernize Neovim plugins in Lua. |
| [ai-contribution-readiness-audit](general/skills/ai-contribution-readiness-audit/) | Evaluate a repo's readiness for AI code contributions and produce concrete fixes. |
| [git-spice-stack-prs](general/skills/git-spice-stack-prs/) | Manage stacked GitHub PRs with git-spice — branch creation, submit, restack, and update cycles. |
| [receiving-code-review](https://github.com/obra/superpowers/tree/main/skills/receiving-code-review) | Protocol for handling review feedback — verify before implementing, push back when wrong. *(upstream: obra/superpowers)* |

## Gas City

Canonical skills, formulas, and local pack-family assets for the current
Gas City operating model.

### Skills

| Skill | Description |
|-------|-------------|
| [brainstorming](gascity/skills/brainstorming/) | Interactive spec writing through dialogue — clarify intent, explore approaches, write a design spec. |
| [review-implementation](gascity/skills/review-implementation/) | Review code changes against a spec to verify implementation completeness and correctness. |
| [epic-delivery](gascity/skills/epic-delivery/) | Work a convoy-backed execution plan in-session with convoy-first tracking. |

### Formula Portfolio

The current formula stack has two user-facing workflows plus reusable building
blocks underneath them.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Draft Spec  │ ───▶ │   Enrich    │ ───▶ │  Beadify    │
│             │      │ (optional,  │      │             │
│ brief →     │      │  repeatable)│      │ spec →      │
│ spec.md     │      │ spec →      │      │ beads       │
│             │      │ better spec │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
```

**Draft Spec** — Explores the codebase, asks focused questions, proposes approaches, writes a spec.

**Enrich** — Finds gaps across 6 analytical dimensions (completeness, ambiguity, feasibility, scope, risks, consistency). Auto-fixes what's obvious, asks about what needs judgment. Repeatable.

**Beadify** — Explores the codebase (3 parallel agents), decomposes the spec into feature/workstream beads, runs 3 review passes, creates beads with validated dependencies.

Any entry point works. Already have a spec? Skip to beadify. Want more rigor? Run enrich multiple times.

See [gascity/formulas/README.md](gascity/formulas/README.md) for full formula
documentation.

#### Workflow roles

**delivery-workflow** — The default feature workflow. One main Codex-owned
session goes from spec to implementation to review.

**epic-delivery-workflow** — The umbrella workflow. It breaks a larger
initiative into feature/workstream beads that are then expected to kick off
`delivery-workflow`.

**epic-delivery** (skill) — Still useful. This is the dispatch/convoy skill for
launching an epic once the bead graph already exists. It complements
`epic-delivery-workflow`; it does not replace it.

#### Design principles

**One document:** `spec.md` is the single design record. It scales from 10 lines to 200 by adding depth, not documents.

**Two artifacts:** The spec (design record) and beads (execution). Everything else is transient.

**Composable:** Each formula runs standalone or composes into workflows. No rigid pipeline.

**Signal over noise:** Analytical dimensions that surface real gaps, not exhaustive question generation.

#### Quick start

```bash
# From a brief to a spec (interactive)
gt sling draft-spec-expansion <crew> \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"

# Enrich the spec (optional, repeatable)
gt sling enrich-expansion <crew> \
  --var feature="ipv6-support"

# Create execution beads from the spec
gt sling beadify-expansion <crew> \
  --var feature="ipv6-support"
```

Or run the umbrella decomposition pipeline as a single workflow:

```bash
gt sling epic-delivery-workflow <crew> \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

#### Installing formulas

```bash
cp gascity/formulas/*.formula.toml ~/gt/.beads/formulas/
```

Or copy to a specific rig's `.beads/formulas/` directory for project-scoped use.

#### Local pack family

The canonical local Gas City pack family now lives under
[gascity/packs/](/Users/chall/gt/toolkit/crew/quick/gascity/packs).

The related planning docs stay at top level in
[docs/plans/gascity-packs/](/Users/chall/gt/toolkit/crew/quick/docs/plans/gascity-packs).

## Gastown

Legacy and compatibility assets for the older Gas Town model stay under
`gastown/`.

These are useful when:

- preserving older GT-oriented workflows
- comparing old vs new behavior during migration
- keeping GT-specific skills that do not belong in the canonical Gas City path

Examples include:

- [gastown/skills/gastown-upstream-sync/](/Users/chall/gt/toolkit/crew/quick/gastown/skills/gastown-upstream-sync)
- [gastown/skills/sling-work/](/Users/chall/gt/toolkit/crew/quick/gastown/skills/sling-work)
- [gastown/skills/workflow-cheatsheet/](/Users/chall/gt/toolkit/crew/quick/gastown/skills/workflow-cheatsheet)
- [gastown/beads/formulas/](/Users/chall/gt/toolkit/crew/quick/gastown/beads/formulas)

## What's here

| Directory | Contents |
|-----------|----------|
| `general/skills/` | Language-specific development, review, and evaluation skills. No Gas Town dependency. |
| `gascity/skills/` | Canonical Gas City skills for the current workflow model. |
| `gascity/formulas/` | Canonical Gas City formulas and workflow expansions. |
| `gascity/packs/` | Local Gas City pack family and sample city assets. |
| `gascity/docs/templates/` | Canonical spec/plan templates used by the Gas City workflows. |
| `gastown/` | Legacy / compatibility Gas Town assets. |
| `docs/plans/` | Session planning docs for this repo, including Gas City migration and pack work. |

## Acknowledgements

- [obra/superpowers](https://github.com/obra/superpowers) — the brainstorming skill and interactive design dialogue approach
- [Xexr/gt-toolkit](https://github.com/Xexr/gt-toolkit) — the expansion/workflow formula architecture, multi-stage pipeline patterns, and bidirectional review approach
- [Xexr/marketplace](https://github.com/Xexr/marketplace) — the epic-delivery and review-implementation skills
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — the Gas Town multi-agent workspace and molecule/convoy execution model
- The upstream `mol-idea-to-plan` and `mol-prd-review` formulas — the PRD review dimensions that informed the enrich formula's analytical approach

## License

MIT
