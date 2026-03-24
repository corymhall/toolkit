---
name: epic-delivery
description: Execute a planned delivery convoy in the current session using convoy-owned execution beads as the primary container. Use when planning is done and you want to work the convoy-backed plan yourself without daemon dispatch.
---

# Epic Delivery

Execute a delivery epic in the current session.

This skill assumes planning is already done:
- `spec.md` exists
- `plans.md` exists for planned delivery
- execution beads already exist under the owned convoy

The convoy is used as a tracking artifact, not a scheduler. Keep ownership in
the current session, work the tracked beads directly, and use `gc convoy status`
as the shared status surface.

## Input

Required:
- Convoy ID (example: `gc-42`)

Auto-detected:
- Rig from current workspace

Optional but useful:
- Tracking epic ID, if one still exists
- `docs/plans/<feature>/spec.md`
- `docs/plans/<feature>/plans.md`
- execution convoy already exists as the initiative container

## Non-Negotiable Rules

1. Keep ownership in the current session.
2. Do not use any daemon-dispatch convoy launch path here.
3. Do not `gt sling` individual execution leaves from this skill.
4. Treat the convoy as a tracking surface, not a dispatcher.
5. Recreate the convoy if the execution bead graph changes materially.
6. Never run `gt mq integration land <epic-id>` in this skill.

## Workflow

1. Setup convoy context.
- Confirm the input bead is a convoy.
- Resolve the target branch from session context.
- Resolve the optional tracking epic only for notes/reporting.
- See [references/setup-dispatch.md](references/setup-dispatch.md).

2. Validate the execution graph.
- Confirm the execution convoy directly owns the intended milestone/checkpoint beads.
- Confirm tracked execution beads still match the intended milestone/checkpoint order.
- Recreate the convoy if the graph changed after the last create.
- See [references/setup-dispatch.md](references/setup-dispatch.md).

3. Execute the convoy in-session.
- Inspect convoy status.
- Find the next ready tracked bead.
- If the selected bead is `implementation review`, run
  `$review-implementation` instead of treating it like a generic execution
  bead.
- Work it to completion in the current session.
- Refresh convoy status and repeat.
- See [references/monitoring-handoff.md](references/monitoring-handoff.md).

4. Handle blocked or ambiguous execution states.
- If open tracked beads remain but none are ready, inspect blockers and stop on
  the real execution problem.
- If the graph or plan is wrong, repair the beads and recreate the convoy.
- See [references/failure-handling.md](references/failure-handling.md).

5. Finalize tracking and report.
- When all tracked beads are closed, land the owned convoy.
- Summarize plan-vs-actual and verification state.
- See [references/validation-reporting.md](references/validation-reporting.md).

## Output Contract

Report each major transition clearly:

1. Setup complete:
- Convoy ID
- Optional tracking epic ID
- Target branch

2. Execution status:
- Open tracked beads
- Ready tracked beads
- Capstone validation bead, if present
- Next bead selected

3. Blocked state, if any:
- Open but not-ready beads
- Blocking deps or execution ambiguity
- Whether convoy recreation is required

4. Completion:
- Convoy land result
- Plan-vs-actual summary
- Verification/gate summary
