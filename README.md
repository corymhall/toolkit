# toolkit

A collection of skills, formulas, and templates for AI-assisted software engineering. Organized into two namespaces you can install independently.

## General Skills

Language-specific development skills, review tools, and multi-model evaluation. No dependencies on Gas Town or Beads.

| Skill | Description |
|-------|-------------|
| [multi-model-evaluate](general/skills/multi-model-evaluate/) | Dispatch the same question to multiple AI models, synthesize consensus and disagreements. |
| [review-pr](general/skills/review-pr/) | Review a teammate's PR and produce draft comments for your approval before posting to GitHub. |
| [go-development](general/skills/go-development/) | Implement, refactor, and review production Go code using Google-style conventions. |
| [neovim-plugin-development](general/skills/neovim-plugin-development/) | Build, review, and modernize Neovim plugins in Lua. |
| [ai-contribution-readiness-audit](general/skills/ai-contribution-readiness-audit/) | Evaluate a repo's readiness for AI code contributions and produce concrete fixes. |
| [receiving-code-review](https://github.com/obra/superpowers/tree/main/skills/receiving-code-review) | Protocol for handling review feedback — verify before implementing, push back when wrong. *(upstream: obra/superpowers)* |

## Gas Town

Skills and formulas for the [Gas Town](https://github.com/steveyegge/gastown) multi-agent workspace built on [Beads](https://github.com/steveyegge/beads) issue tracking.

### Skills

| Skill | Description |
|-------|-------------|
| [brainstorming](gastown/skills/brainstorming/) | Interactive spec writing through dialogue — clarify intent, explore approaches, write a design spec. |
| [review-implementation](gastown/skills/review-implementation/) | Review code changes against a spec to verify implementation completeness and correctness. |
| [epic-delivery](gastown/skills/epic-delivery/) | Dispatch beads to polecats for swarm-style execution with dependency-aware task waves. |

### Spec-to-Beads Pipeline

A composable pipeline that takes a feature from brief to execution-ready beads. Three expansion formulas, each independently runnable.

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

**Beadify** — Explores the codebase (3 parallel agents), decomposes the spec into tasks, runs 3 review passes, creates beads with validated dependencies.

Any entry point works. Already have a spec? Skip to beadify. Want more rigor? Run enrich multiple times.

See [gastown/beads/formulas/README.md](gastown/beads/formulas/README.md) for full formula documentation.

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

Or run the full pipeline as a single workflow:

```bash
gt sling spec-to-beads-workflow <crew> \
  --var feature="ipv6-support" \
  --var brief="Add IPv6 CIDR block and subnet support to VPC components"
```

#### Installing formulas

```bash
cp gastown/beads/formulas/*.formula.toml ~/gt/.beads/formulas/
```

Or copy to a specific rig's `.beads/formulas/` directory for project-scoped use.

## What's here

| Directory | Contents |
|-----------|----------|
| `general/skills/` | Language-specific development, review, and evaluation skills. No Gas Town dependency. |
| `gastown/skills/` | Gas Town skills — brainstorming, implementation review, epic delivery. |
| `gastown/beads/formulas/` | Gas Town `.formula.toml` files — 3 expansion formulas + 1 workflow orchestrator. |
| `gastown/docs/templates/` | The [spec template](gastown/docs/templates/spec.md) — standard format for all specs. |
| `gastown/docs/plans/` | Specs for features built in this repo. |

## Acknowledgements

- [obra/superpowers](https://github.com/obra/superpowers) — the brainstorming skill and interactive design dialogue approach
- [Xexr/gt-toolkit](https://github.com/Xexr/gt-toolkit) — the expansion/workflow formula architecture, multi-stage pipeline patterns, and bidirectional review approach
- [Xexr/marketplace](https://github.com/Xexr/marketplace) — the epic-delivery and review-implementation skills
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — the Gas Town multi-agent workspace and molecule/convoy execution model
- The upstream `mol-idea-to-plan` and `mol-prd-review` formulas — the PRD review dimensions that informed the enrich formula's analytical approach

## License

MIT
