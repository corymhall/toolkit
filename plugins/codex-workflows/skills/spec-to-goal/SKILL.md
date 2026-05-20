---
name: spec-to-goal
description: Turn a repo-local spec, rollout doc, design note, or implementation plan into a compact /goal prompt. Use when the user wants to run Codex /goal from an existing spec-first workflow and needs the goal to preserve scope, non-goals, validations, and local constraints.
---

# Spec To Goal

Create a `/goal` prompt from the user's existing planning artifact. The goal is
not to replace the spec; it is to turn the spec into a bounded execution prompt
that another Codex session can follow.

## Process

1. Read the named spec, rollout doc, design note, issue, or plan first. Treat it
   as the source of truth.
2. Inspect enough repo context to avoid guessing file paths, branch state,
   validation commands, or local hazards.
3. Identify the exact implementation slice. Prefer one phase, one PR-sized
   change, or one reviewable milestone.
4. Preserve explicit non-goals, deferred phases, and compatibility boundaries.
5. Pull validation commands from the spec or repo conventions. Do not invent
   Docker, services, tests, or toolchains the repo did not name.
6. Include local safety constraints: dirty worktree, untracked files, borrowed
   branches, no-push requirements, generated files, or user-owned docs.
7. Add a checkpoint instruction when the work is large, risky, or likely to
   expand beyond the named slice.
8. Keep the output compact enough to paste directly into `/goal`.

If the spec is too ambiguous to produce a safe goal, do not bluff. Ask the
smallest question that would change the implementation scope, or produce a
draft goal with the ambiguity called out as a decision point.

## Goal Shape

Use plain Markdown unless the user asks for another format.

```markdown
Implement <specific slice> in <repo/worktree> on <branch>.

Source of truth:
- <spec path>
- <rollout or supporting doc path>

Scope:
- <required work item>
- <required work item>

Non-goals:
- <deferred phase or out-of-scope area>
- <compatibility boundary>

Preserve:
- <dirty/untracked/user-owned files or branches>
- <no-push/no-commit/approval constraints>

Validation:
- <exact command>
- <exact command>

Before finishing:
- Compare the diff back against <spec path>.
- Report implemented items, validation results, blocked items, and any
  intentional fail-closed behavior.
```

## Principles

- **Spec first:** preserve the user's decisions instead of re-litigating the
  design during goal creation.
- **One bounded slice:** if the spec has phases, target the next phase only.
- **Non-goals matter:** deferred work prevents the implementation run from
  expanding into a second project.
- **Validation is part of the goal:** name the exact checks that define done.
- **Local state is real:** protect untracked files and existing user changes.
- **Goal prompts are launch artifacts:** produce the prompt, then let the user
  decide whether to run `/goal`.
