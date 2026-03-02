# toolkit

A collection of formulas, skills, and templates for [Gas Town](https://github.com/steveyegge/gastown) — the multi-agent workspace manager built on [Beads](https://github.com/steveyegge/beads) issue tracking.

## Spec-to-Beads Pipeline

The headline feature: a composable pipeline that takes a feature from brief to execution-ready beads. Three expansion formulas, each independently runnable.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Draft Spec  │ ───▶ │   Enrich    │ ───▶ │  Beadify    │
│             │      │ (optional,  │      │             │
│ brief →     │      │  repeatable)│      │ spec →      │
│ spec.md     │      │ spec →      │      │ beads       │
│             │      │ better spec │      │             │
└─────────────┘      └─────────────┘      └─────────────┘
```

**Draft Spec** — Explores the codebase, asks focused questions, proposes approaches, writes a spec. Interactive dialogue or autonomous from a detailed brief.

**Enrich** — Reads a spec, finds gaps across 6 analytical dimensions (completeness, ambiguity, feasibility, scope, risks, consistency). Auto-fixes what's obvious, asks about what needs judgment. Repeatable — each pass deepens the spec.

**Beadify** — The execution entry point. Explores the codebase (3 parallel agents), decomposes the spec into tasks, runs 3 review passes (completeness, dependencies, clarity), then creates beads with validated dependencies.

Any entry point works. Already have a spec? Skip to beadify. Want more rigor? Run enrich multiple times. Wrote the spec yourself? Go straight to beadify.

See [beads/formulas/README.md](beads/formulas/README.md) for full formula documentation.

## Design Principles

**One document:** `spec.md` is the single design record. No separate PRD, plan, or design doc. It scales from 10 lines (small feature) to 200 lines (large feature) by adding depth, not documents.

**Two artifacts:** The spec (design record) and beads (execution). Everything else is transient — created during a formula run, deleted after.

**Composable:** Each formula is a standalone expansion that also composes into larger workflows. No rigid pipeline — use what you need.

**Signal over noise:** Enrich uses analytical dimensions that surface real gaps, not exhaustive question generation. No "generate 10 questions per category" — just find what's actually missing or ambiguous.

## What's here

| Directory | Contents |
|-----------|----------|
| `beads/formulas/` | `.formula.toml` files — the spec-to-beads pipeline. 3 expansion formulas + 1 workflow orchestrator. |
| `docs/templates/` | The [spec template](docs/templates/spec.md) — standard format for all specs. |
| `skills/brainstorming/` | Interactive spec writing through dialogue — the skill version of `draft-spec-expansion`. |
| `skills/epic-delivery/` | Dispatch beads to polecats for swarm-style execution. Sets up integration branch, creates convoy, dispatches task waves in parallel respecting dependencies. |
| `skills/review-implementation/` | Review code changes against the spec to verify implementation correctness. |

## Installing formulas

Copy formulas into your town-level formulas directory to make them available across all rigs:

```bash
cp beads/formulas/*.formula.toml ~/gt/.beads/formulas/
```

Or copy to a specific rig's `.beads/formulas/` directory for project-scoped use.

## Quick start

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

Or skip straight to beadify if you already have a spec:

```bash
gt sling beadify-expansion <crew> \
  --var feature="ipv6-support"
```

## Acknowledgements

The brainstorming approach draws inspiration from [obra/superpowers](https://github.com/obra/superpowers/tree/main). The expansion formula architecture builds on patterns from [Xexr/gt-toolkit](https://github.com/Xexr/gt-toolkit).

## License

MIT
