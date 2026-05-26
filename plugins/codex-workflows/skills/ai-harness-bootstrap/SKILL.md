---
name: ai-harness-bootstrap
description: Bootstrap a deterministic, repo-local AI harness skeleton with entrypoint docs, harness manifest, workflow skills, tool/sensor inventory, and validation loops. Use when a repo already has basic AI contribution readiness and the user wants to move toward a v1 harness for continuous AI-assisted engineering.
---

# AI Harness Bootstrap

Use this to move a repo from ad hoc AI guidance or basic contribution readiness
to a deterministic v1 harness skeleton.

This is a second-stage skill. If the repo lacks a usable `AGENTS.md`, command
canon, generated-file rules, or basic validation path, run an AI contribution
readiness pass first.

## Explore First

Read the repo before designing the harness:

1. Root and scoped instructions: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, etc.
2. Command surface: `Makefile`, `justfile`, package scripts, CI config.
3. Generated boundaries: SDKs, schemas, lock files, workflow outputs, docs.
4. Existing AI surfaces: `.agents/`, `.codex/`, `.github/agents/`, gh-aw,
   review prompts, MCP/tool config.
5. Test and evidence surfaces: fast tests, targeted tests, integration/live
   tests, replay/recording paths, review automation.
6. Domain map: the repo-specific modules and ownership boundaries agents must
   understand before editing.

Do not rely on file names alone. Inspect the source of truth. In particular,
verify what build/test targets actually do and which generated-looking files are
source exceptions.

## Target Skeleton

Prefer extending existing artifacts. A typical v1 skeleton is:

- `AGENTS.md`: short entrypoint and routing map.
- `docs/ai-harness/README.md`: harness purpose and session loop.
- `docs/ai-harness/harness-manifest.md`: active docs, skills, commands, tools,
  generated outputs, and known gaps.
- `docs/ai-harness/architecture.md`: repo-specific domain map and ownership
  boundaries.
- `docs/ai-harness/testing.md`: evidence ladder and canonical commands.
- `docs/ai-harness/generated-boundaries.md`: source/generated ownership and
  regeneration commands.
- `docs/ai-harness/review-guardrails.md`: repo-specific review risks.
- `docs/ai-harness/tooling.md`: deterministic scripts, MCPs, sensors, and gaps.
- `.agents/skills/<repo>-change-strategy/SKILL.md`
- `.agents/skills/<repo>-verification/SKILL.md`
- `.agents/skills/<repo>-review/SKILL.md`
- `.agents/skills/<repo>-harness-retrospective/SKILL.md`

Only add files that fit the repo. If the repo already has an equivalent surface,
adapt it instead of duplicating it.

## Design Rules

- Keep `AGENTS.md` short; put detailed guidance in harness docs and focused
  skills.
- Every harness claim must reference actual repo commands, paths, or behavior.
- Encode repo-specific judgment, not generic AI advice.
- Distinguish source files, generated outputs, and source exceptions precisely.
- Do not claim a command proves more than it actually proves.
- If docs require an automation or review prompt to stay aligned, update that
  automation or soften the claim.
- Treat tool/MCP gaps honestly. A manifest may list future tools, but must not
  pretend they exist.
- Prefer one small skill per repeated workflow over one giant harness skill.

## Minimum Repo-Local Skills

Create or adapt these only when they add real routing value:

- **change strategy**: classify owning layer, expected files, generated impact,
  validation path, and escalation points.
- **verification**: choose and report the cheapest honest evidence.
- **review**: check repo-specific correctness, generated boundaries, public
  surface, live-test risk, and weak validation.
- **harness retrospective**: decide whether a session exposed a reusable harness
  gap and how to encode it.

## Validation

Run validation appropriate to changed files:

- Always run `git diff --check`.
- Check that manifest-listed files exist.
- Validate skill frontmatter if the repo has a validator.
- If workflow or prompt sources produce generated outputs, run the repo's
  compile/generate command and include generated locks only when produced by
  that command.
- If command guidance changed, verify the command definition from source.
- Use reviewer agents for repo-instruction compliance and harness consistency
  when the change is more than trivial.

Do not run live/integration tests unless the repo and user context make that
safe and necessary.

## Output

When implementing, report:

- the harness files added or changed;
- the deterministic commands or automations now covered;
- any existing AI workflow prompts aligned with the harness;
- validation run and warnings;
- known gaps left in the manifest.

When planning only, produce a phased bootstrap plan with exact files and
validation commands.

