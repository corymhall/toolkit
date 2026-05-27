---
name: ai-harness-bootstrap
description: Bootstrap a small, deterministic repo-local AI harness by adding only the docs, skills, or checks that have concrete repo-specific content. Use when a repo already has basic AI contribution readiness and the user wants continuous harness improvement without placeholder process.
---

# AI Harness Bootstrap

Use this to move a repo from ad hoc AI guidance or basic contribution readiness
to a small, deterministic harness surface.

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

## Target Shape

Prefer extending existing artifacts. Do not create a full directory tree just
because a framework suggests one.

Start with the smallest set of surfaces that have real content today. Common
surfaces are:

- `AGENTS.md`: short entrypoint and routing map.
- `REVIEW.md`: repo-specific review rules, if there are concrete rules.
- `docs/ai-harness/README.md`: brief current-state map and known gaps.
- focused docs such as `docs/ai-harness/testing.md`, only when they explain how
  to create or evaluate new work in this repo.
- focused repo-local skills, only when invocation itself adds value beyond
  reading a short doc.

It is valid for a v1 pass to add only one or two files.

## Design Rules

- Keep `AGENTS.md` short; put detailed guidance in harness docs and focused
  skills.
- Every harness claim must reference actual repo commands, paths, or behavior.
- Encode repo-specific judgment, not generic AI advice.
- Every word, sentence, paragraph, and file should earn its place.
- Do not add placeholders. If content is missing, name the gap directly.
- Do not duplicate command lists. Pick one source of truth and point at it.
- Distinguish source files, generated outputs, and source exceptions precisely.
- Do not claim a command proves more than it actually proves.
- If docs require an automation or review prompt to stay aligned, update that
  automation or soften the claim.
- Treat tool/MCP gaps honestly. Name a gap only when it helps the next session.
- Prefer one small skill per repeated workflow over one giant harness skill.

## Skill Admission Rule

Do not add repo-local skills for generic duties like "run tests", "validate your
work", or "review the diff". A skill is worth adding only when it encodes a
repo-specific workflow that is too long, too fragile, or too easy to miss in a
short doc.

Before creating a skill, ask:

- What does invocation do that reading `AGENTS.md` or `REVIEW.md` would not?
- Is there enough repo-specific procedure to justify the token cost?
- Will future agents know when to invoke it?

If the answer is weak, write or tighten a doc instead.

## Validation

Run validation appropriate to changed files:

- Always run `git diff --check`.
- Check that referenced files exist.
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
- the concrete repo behavior each file captures;
- any deterministic commands or automations now covered;
- validation run and warnings;
- gaps intentionally left unfilled because the repo-specific guidance is not yet
  known.

When planning only, produce a phased bootstrap plan with exact files and
validation commands.
