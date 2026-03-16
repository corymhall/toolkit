---
name: implementation-review
description: Run the shared multi-agent implementation review boundary for a feature by creating a review checkpoint, slinging Codex and Claude reviewers, monitoring them, and synthesizing findings. Use when a workflow stage or execution bead says implementation review is required before proceeding.
---

# Implementation Review

Run the shared implementation review boundary for a feature.

This skill is the canonical "how" for:
- `delivery-workflow-quick` review stage
- planned-delivery `implementation review` execution beads

## Input

Required:
- Feature name

Expected artifacts:
- `docs/plans/<feature>/spec.md`
- optional `docs/plans/<feature>/plans.md`
- `docs/plans/<feature>/session-context.md`
- `docs/plans/<feature>/session-ledger.md` when the execution flow keeps one

## Non-Negotiable Rules

1. Create a reviewable checkpoint commit before launching reviewers.
2. Push the checkpointed branch before review workers inspect it.
3. Use Codex and Claude as the default two-reviewer stack.
4. Add a specialist review only when `review_profiles_selected` strongly warrants it.
5. Do not synthesize results until the expected shared review reports exist.
6. If blocking findings exist, return to implementation/fix work before calling this review boundary complete.

## Workflow

1. Prepare review inputs.
- Materialize spec/plans/session artifacts into a shared `.runtime/reviews/...` directory.
- See [references/setup-review.md](references/setup-review.md).

2. Launch review workers.
- Sling Codex and Claude `mol-review-implementation` runs.
- Optionally add one specialist run.
- See [references/setup-review.md](references/setup-review.md).

3. Monitor and synthesize.
- Monitor workers to terminal state.
- Read the reports.
- Deduplicate and classify findings.
- See [references/monitoring.md](references/monitoring.md).

4. Resolve blocking issues.
- If the synthesis is blocking, return to implementation work.
- Re-run this skill after fixes.
- See [references/failure-handling.md](references/failure-handling.md).

5. Report clean review boundary.
- Record review artifact paths and synthesis result.
- Return only when the review boundary is actually clear.

## Output Contract

Report:
1. Review checkpoint:
- branch reviewed
- review directory
- reviewer runs launched

2. Review result:
- blocking findings
- non-blocking findings
- disagreements across reviewers

3. Outcome:
- clean to proceed
- or returned to fix work
