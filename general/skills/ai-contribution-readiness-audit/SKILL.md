---
name: ai-contribution-readiness-audit
description: Evaluate a repository's readiness for high-quality AI code contributions and produce concrete, copy-pasteable file changes that make the repo AI-ready. Use when asked to audit AI contribution quality, diagnose why AI PRs are low quality, or prepare a repo for AI-assisted engineering.
---

# AI Contribution Readiness Audit

## Overview
Audit a codebase and produce an implementation packet of concrete file changes that make the repo ready for high-quality AI contributions. The primary deliverable is **actual file content** — not descriptions of what files should contain.

## What You Produce
An ordered set of file creates/edits, each with full content, that an engineer can apply directly. Accompanied by a brief diagnostic summary of what exists and what's missing.

## Explore First (Required)
Before recommending anything, verify the repo's actual state:

1. **Repo map**: top-level structure, key directories, language/build system.
2. **What exists**: check for AGENTS.md, CONTRIBUTING.md, PR templates, Makefile/justfile, CI workflows, policy files.
3. **Command reality**: what build/test/lint commands actually work. Run at least one if feasible.
4. **Doc accuracy**: do README/docs reference paths, commands, or workflows that don't exist?
5. **At least 3 concrete mismatches or surprises** unique to this repo.

False-positive guards:
- Confirm a file is truly missing before recommending creation.
- Confirm a command target is truly missing before recommending additions.
- If uncertain, mark as conditional and state what evidence is missing.

## Diagnostic Categories
Assess the repo across these areas. For each, note what exists vs what's missing. No weighted scores needed — just identify the gaps that matter most.

Open `references/principles-and-rubric.md` for the checklist questions per category.

| Category | What to look for |
|---|---|
| Instruction contract | AGENTS.md or equivalent with actual commands, rules, forbidden actions |
| Verification loop | Canonical test/lint/format commands; CI parity with local commands |
| Safety rails | Explicit approval rules for risky ops; sandbox/policy documentation |
| Architecture clarity | Module map, ownership, boundary documentation |
| Task surface | Makefile/justfile with standardized targets |
| Testability | Fast targeted test path; guidance on test depth |
| Observability | Structured logs, error taxonomy, debug runbook |
| Contribution ergonomics | PR template with evidence/risk sections; reviewer checklist |
| Anti-drift controls | Schema/docs/lockfile regeneration commands; CI drift checks |

## Output Format
Use `templates/audit-report-template.md` to structure output.

### Part 1: Diagnostic Summary (~20% of output)
- What artifacts exist and their quality (one-line each)
- Top 3 gaps ranked by impact on AI contribution quality
- Brief "what this repo does well" note

### Part 2: Implementation Packet (~80% of output)
Ordered list of file changes. For each:

1. **File path** (create or edit)
2. **Full file content** or exact diff — not a description of what to add
3. **Why this change** — one sentence linking to a diagnostic gap
4. **Verify** — command to confirm the change works
5. **Expected result** — what the command output should look like

Open `references/remediation-catalog.md` for example content blocks per artifact type.
Open `templates/agents-md-template.md` for AGENTS.md exemplars to adapt.
Open `templates/ci-gates-template.md` for CI and Makefile exemplars to adapt.

## Quality Rules

**Content depth:**
- Every recommended file must include its **actual content**, not a description of what it should contain.
- Adapt exemplars from `templates/` to the target repo's actual paths, commands, and conventions.
- If recommending an AGENTS.md, write the AGENTS.md. If recommending a PR template, write the PR template.

**Repo-specificity:**
- Every recommendation must reference actual paths, commands, or patterns from the target repo.
- Reject any recommendation that could be pasted unchanged into an unrelated repo.
- Prefer extending existing repo artifacts before introducing new ones.

**Minimalism:**
- Prefer the smallest effective change.
- Don't add governance frameworks when a section in an existing file would suffice.
- Don't recommend tools/dependencies the repo doesn't already use without a fallback.

**Safety-rail recommendations specifically:**
- Map each to an existing artifact (AGENTS.md, CONTRIBUTING.md, CI workflow, PR template, Makefile target).
- If introducing a new artifact, state why existing ones are insufficient.

## Calibration
After drafting recommendations, read `references/example-findings-by-project-type.md` and sanity-check that findings match typical patterns for the project type. Adjust if you're over/under-flagging relative to what matters for this kind of project.
