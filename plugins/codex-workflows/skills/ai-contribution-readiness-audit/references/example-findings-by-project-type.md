# Example Findings by Project Type

Use these to calibrate your audit — avoid over-flagging things that don't matter for the project type, and avoid under-flagging things that do.

## 1. Early-stage startup app
Typical gaps:
- No AGENTS.md or instruction contract at all
- Ad hoc test commands; CI discovered late
- No PR template or evidence requirements

What matters most here:
- AGENTS.md with command canon (biggest single win)
- One fast test command that CI also runs
- PR template with minimal evidence sections

What matters less:
- Formal architecture docs (codebase is small enough to read)
- Policy engine or approval workflows (small team, high trust)
- Anti-drift controls (not enough generated artifacts yet)

## 2. Enterprise monorepo
Typical gaps:
- Strong infra, weak local ownership boundaries
- AI changes leak across packages
- Multiple inconsistent ways to build/test

What matters most here:
- Per-package AGENTS.md or scoped instruction files
- Module boundary documentation and ownership map
- Consistent command surface per package (fmt/lint/test)

What matters less:
- Single root AGENTS.md (too broad for a monorepo)
- Runbook (usually exists already in some form)

## 3. OSS library/tooling project
Typical gaps:
- Great code quality, but contributor norms are implicit
- AI misses compatibility constraints and semver rules
- PR template exists but doesn't require evidence

What matters most here:
- CONTRIBUTING.md with explicit AI workflow section
- PR template requiring test evidence and compatibility notes
- Regeneration rules for generated docs/schemas

What matters less:
- Safety rails (less risky ops in a library context)
- Observability (libraries don't usually have runtime logs)

## 4. Data/ML platform
Typical gaps:
- Notebook/script sprawl, weak reproducibility
- No canonical test commands; "run this cell" culture
- Generated artifacts drift silently

What matters most here:
- Canonical data validation and test commands
- Schema/contract tests for data pipelines
- Reproducible environment setup (pinned deps, fixtures)

What matters less:
- PR template (less PR-driven workflow)
- Architecture docs (data flow docs matter more)

## 5. Infrastructure / Pulumi provider / bridged project
Typical gaps:
- Complex code generation pipelines with implicit ordering
- Regeneration rules undocumented or scattered across scripts
- Fast test path unclear (full suite takes 30+ minutes)

What matters most here:
- AGENTS.md with explicit "if you change X, regenerate Y" rules
- Fast targeted test command (test one resource, not all)
- CI parity with local commands
- Clear module map (generated vs hand-written code boundaries)

What matters less:
- Contribution ergonomics (small team, high context)
- Formal observability (build-time project, not runtime)
