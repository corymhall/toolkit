---
name: stage-terraform-provider-repro
description: "Stage durable Terraform-side repro artifacts for provider issues after the routing question has already narrowed to a Terraform discriminator, or when the user explicitly asks for that help. Use when Codex needs to answer whether Terraform reproduces, build an upstream acceptance-style repro, preserve the exact discriminator being tested, and avoid replacing a strong Terraform path with a weaker local experiment just because credentials are unavailable."
---

# Stage Terraform Provider Repro

Stage the sharpest Terraform-side discriminator for the issue.

Prefer durable upstream or repo-native artifacts over disposable local
experiments. When a temporary config is useful as a quick check, treat it as a
probe, not the final repro artifact.

Stay in the repro lane. Do not drift back into broad routing or bridge-theory
work unless the Terraform result directly changes the question.
Prefer `triage-provider-issue` first unless a prior pass already established
that a Terraform repro is the next best action or the user explicitly invoked
this skill.

Read `references/repro-shape.md` before editing.

## Workflow

1. State the exact question Terraform needs to answer.
   Examples: Does Terraform reproduce the same read failure? Does the issue
   disappear with `-refresh=false`? Is this accepted upstream behavior?
2. Choose the strongest durable artifact available.
   Prefer upstream acceptance tests or the closest durable Terraform repro in
   the relevant repo.
3. Preserve the exact discriminator.
   If refresh semantics matter, stage that explicitly.
4. Keep the config minimal, but not so minimal that it erases the behavior.
5. If the relevant repro surface lives in another repo, move there and stage it
   in that repo instead of stopping.
6. Stage the artifact locally.
7. Run only what is safe and available.
8. If credentials or approvals are missing, stop with a ready-to-run artifact
   and exact commands.

## Operating Rules

- Do not substitute a loose temp-dir config when the real next step is an
  upstream acceptance-style repro.
- Preserve semantic variants intentionally, including flags like
  `-refresh=false`, import, or read-after-update behavior.
- Treat "Terraform did not reproduce" as a meaningful result only when the
  repro actually matches the question being asked.
- If the upstream repo has a testing harness, use it instead of inventing a
  new convention.

## Deliverable

Leave behind:

- current state
- confidence
- what is settled
- what is not settled
- next best action
- the staged Terraform repro artifact
- the exact command matrix
- the discriminator being tested
- what blocked execution, if anything
- workaround status
