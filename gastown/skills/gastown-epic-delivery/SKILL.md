---
name: gastown-epic-delivery
description: Execute a planned delivery epic in the current session using execution beads, with a staged convoy as the tracking surface. Use when an epic already has execution beads and you want to work the convoy-backed plan yourself without daemon dispatch.
---

# Epic Delivery

Execute a delivery epic in the current session.

This skill assumes planning is already done:
- `spec.md` exists
- `plans.md` exists for planned delivery
- execution beads already exist under the root epic

The convoy is used as a tracking artifact, not a scheduler. Keep it staged,
work the tracked beads in the current session, and use `gt convoy status` as
the shared status surface.

For planned delivery, convoy stages should use `--no-validate`, so
`implementation review` is the final expected execution unit.

## Input

Required:
- Epic ID (example: `gt-abc`)

Auto-detected:
- Rig from current workspace

Optional but expected:
- `docs/plans/<feature>/spec.md`
- `docs/plans/<feature>/plans.md`
- staged convoy already attached to the epic

## Non-Negotiable Rules

1. Keep ownership in the current session.
2. Do not run `gt convoy launch <convoy-id>`.
3. Do not `gt sling` individual execution leaves from this skill.
4. Treat the staged convoy as a tracking surface, not a dispatcher.
5. Re-stage the convoy if the execution bead graph changes materially.
6. Never run `gt mq integration land <epic-id>` in this skill.

## Workflow

1. Setup convoy context.
- Reuse an existing staged convoy if present.
- Ensure epic type is `epic`.
- Create/verify integration branch.
- Stage the convoy if needed.
- See [references/setup-dispatch.md](references/setup-dispatch.md).

2. Validate the execution graph.
- Confirm execution beads exist under the epic.
- Confirm dependencies still match the intended milestone/checkpoint order.
- Restage if the graph changed after the last stage.
- See [references/setup-dispatch.md](references/setup-dispatch.md).

3. Execute the convoy in-session.
- Inspect convoy status.
- Find the next ready tracked bead.
- If the selected bead is `implementation review`, review the implementation
  against `spec.md` and the current delivery changes instead of treating it like
  a generic execution bead.
- Launch reviewer lanes in parallel:
  - `general_reviewer` is required
  - `spec_alignment_reviewer` is required when `spec.md` exists
  - `test_reviewer` is required when behavior changes, tests changed, or
    verification strength is the main uncertainty
- If named reviewer agents are unavailable, report missing lanes and fall back
  to equivalent normal Codex reviewer subagents only when the intended lens
  stays clear.
- Add an independent `mol-review-implementation` sidecar lane only when an
  extra fresh-worker or alternate-runtime perspective is worth the latency.
- Synthesize the reviewer findings in the current session and separate blocking
  findings from residual risks.
- Work it to completion in the current session.
- Refresh convoy status and repeat.
- See [references/monitoring-handoff.md](references/monitoring-handoff.md).

4. Handle blocked or ambiguous execution states.
- If open tracked beads remain but none are ready, inspect blockers and stop on
  the real execution problem.
- If the graph or plan is wrong, repair the beads and re-stage the convoy.
- See [references/failure-handling.md](references/failure-handling.md).

5. Finalize tracking and report.
- When all tracked beads are closed, close the convoy explicitly.
- Summarize plan-vs-actual and verification state.
- See [references/validation-reporting.md](references/validation-reporting.md).

## Output Contract

Report each major transition clearly:

1. Setup complete:
- Epic ID
- Convoy ID
- Integration branch

2. Execution status:
- Open tracked beads
- Ready tracked beads
- Capstone validation bead, if present
- Next bead selected

3. Blocked state, if any:
- Open but not-ready beads
- Blocking deps or execution ambiguity
- Whether re-stage is required

4. Completion:
- Convoy close result
- Plan-vs-actual summary
- Verification/gate summary
