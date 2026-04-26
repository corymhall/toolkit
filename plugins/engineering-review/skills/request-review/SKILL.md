---
name: request-review
description: Kick off a manual code or implementation review using focused reviewer agents, then synthesize the findings. Use when you want an ad hoc review of a diff, branch, file set, or spec-vs-implementation scope.
---

# Request Review

Run a manual review without entering a larger workflow.

This skill is the small entry point for ad hoc review. It identifies the review
target, chooses the smallest useful reviewer lens set, launches read-only
reviewer agents, and synthesizes their findings for the user.

Use `review-pr` instead when the user wants GitHub review comments drafted,
posted, approved, or requested-changes submitted.

## Scope

Accept review requests in any of these shapes:

- current diff
- branch or ref range
- file list or directory
- spec path plus implementation scope
- PR URL or number for local analysis only

If the user is vague, default to the current git diff.

Open [references/target-shapes.md](references/target-shapes.md) for target
interpretation details.

## Lens Selection

Use [references/reviewer-lenses.md](references/reviewer-lenses.md) as the
source of truth for which reviewer agents to launch.

Default to the smallest lens set that can answer the user's actual question.
Do not add lanes just because they exist.

If a selected reviewer lane cannot be launched, continue with the useful lanes
that are available and mention the missing lens as residual risk.

## Review Rules

- Keep setup read-only. Do not `git rebase`, `git merge`, `git cherry-pick`,
  `git reset`, or otherwise rewrite the branch unless the user explicitly asks.
- Gather the minimum evidence needed: current diff, explicit files, named refs,
  spec/task docs, or PR metadata/diff.
- Run reviewer lanes in parallel when practical.
- Reviewer lanes should return findings, not process narration.
- The parent session owns synthesis.

## Synthesis

Report findings first, ordered by severity.

Include:

- blocking findings
- important non-blocking findings
- disagreements or ambiguities across reviewer lanes
- residual risks, missing lenses, or test gaps

If there are no meaningful findings, say that clearly and name any remaining
uncertainty.

Keep scope and lens details brief. Include them only when they help the user
understand the confidence of the review.

## Stop Condition

Stop after reporting the review.

Do not automatically create beads, fix the implementation, update specs, or post
GitHub comments. If the user wants to act on the findings, continue with the
normal implementation flow, use `receiving-code-review` for implementing review
feedback, or use `review-pr` for GitHub comments.
