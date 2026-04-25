---
name: stage-pulumi-provider-repro
description: "Stage durable Pulumi-side repro artifacts for provider issues after the routing question has already narrowed to a Pulumi repro, or when the user explicitly asks for that help. Use when Codex needs to create maintainer-quality examples or tests in a provider repo, preserve the exact lifecycle path that matters, prefer repo-native repros over ad hoc temp directories, and report what can or cannot be executed without credentials."
---

# Stage Pulumi Provider Repro

Stage the smallest durable Pulumi-side repro that honestly captures the issue.

Prefer repo-native examples and tests over temporary scratch work. Use ad hoc
local directories only as a fallback or quick probe, not as the main artifact.

Stay in the repro lane. Do not restart ownership analysis here unless the repro
result directly contradicts the current working theory.
Prefer `triage-provider-issue` first unless a prior pass already established
that a Pulumi repro is the next best action or the user explicitly invoked this
skill.

## Goals

- preserve the user-visible failure
- preserve the lifecycle stage that matters
- create an artifact another maintainer can rerun
- avoid substituting a weaker path just because credentials are unavailable

Read `references/repro-shape.md` before editing.

## Workflow

1. Identify the exact Pulumi behavior being tested.
   Examples: create, update, read, refresh, import, preview, diff.
2. Find the closest repo-native repro surface.
   Prefer an existing example harness, provider test program, or focused test.
3. Preserve the exact lifecycle path that matters.
   If the issue is about update followed by read, do not collapse it into a
   simpler create-only repro.
4. Encode the smallest input shape that still reproduces the bug.
5. If the relevant repro surface lives in another repo, move there and stage it
   in that repo instead of stopping.
6. Stage the artifact locally.
7. Run only what is safe and available.
8. If credentialed execution is required and unavailable, stop with the best
   artifact staged and the exact commands the human should run.

## Operating Rules

- Prefer committed-style repro artifacts over one-off shell transcripts.
- If `--refresh --run-program` is part of the question, stage that path
  explicitly rather than mentioning it abstractly.
- Preserve version constraints or local provider wiring when the report depends
  on them.
- If the issue report includes a user repro, start from that shape before
  minimizing.
- Do not silently swap in HEAD semantics if the issue depends on older versions.
- If you cannot execute the best path, do not invent a weaker one and present
  it as equivalent.

## Deliverable

Leave behind:

- current state
- confidence
- what is settled
- what is not settled
- next best action
- the staged Pulumi repro artifact
- the narrow command matrix to run it
- what behavior the repro is intended to prove
- what blocked execution, if anything
- the unresolved question this repro should answer
- workaround status
