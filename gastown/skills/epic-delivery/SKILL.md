---
name: epic-delivery
description: Deliver a beads epic via staged convoy launch with daemon-managed scheduling. Use when an epic is ready and you need to ensure merge-gated dependencies, stage/launch convoy, and report execution status without manual dispatch loops or gt mq integration land.
---

# Epic Delivery

Run a stage-and-launch workflow for epic execution. Let convoy + daemon handle scheduling after launch.

## Input

Required:
- Epic ID (example: `gt-abc`)

Auto-detected:
- Rig from current workspace

## Non-Negotiable Rules

1. Use single auto mode only: stage then launch.
2. Never run `gt sling <convoy-id>`.
3. Do not run manual per-leaf dispatch loops after launch.
4. Prefer `merge-blocks` for code-order dependencies (`bd dep add <blocked> <blocker> --type merge-blocks`).
5. Validate dependency modeling before launch.
6. Never run `gt mq integration land <epic-id>` in this workflow.

## Workflow

1. Setup integration context.
- Reuse staged convoy if it already tracks the epic.
- Ensure epic type is `epic`.
- Create/verify integration branch.
- Stage convoy.
- See [references/setup-dispatch.md](references/setup-dispatch.md).

2. Validate merge-gated dependencies before launch.
- For code-order dependencies, ensure `merge-blocks` is used.
- Convert legacy `blocks` edges used for code-order gating to `merge-blocks`.
- Record validation summary (how many `merge-blocks` edges found/converted).
- See [references/setup-dispatch.md](references/setup-dispatch.md).

3. Launch convoy.
- Launch the staged convoy with `gt convoy launch <convoy-id>`.
- Do not manually sling leaves.
- See [references/setup-dispatch.md](references/setup-dispatch.md).

4. Post-launch snapshot (no loop).
- Capture one status snapshot for user visibility:
  - `gt convoy status <convoy-id>`
  - `gt mq integration status <epic-id>`
- Report what was launched and what the daemon/refinery will process next.
- Do not run continuous monitor loops in this skill.
- See [references/monitoring-handoff.md](references/monitoring-handoff.md).

5. Validate and report when execution is complete.
- If work is already complete now, run validation and reporting now.
- Otherwise, stop after snapshot and tell user this skill should be rerun for final validation once daemon/refinery finish.
- See [references/validation-reporting.md](references/validation-reporting.md).

## Output Contract

Report each major transition clearly:

1. Setup complete:
- Epic ID
- Convoy ID
- Integration branch

2. Dependency validation:
- `merge-blocks` edges detected
- Legacy `blocks` edges converted
- Any remaining blockers requiring human decision

3. Launch result:
- Launch command outcome
- Wave summary from launch output

4. Post-launch snapshot:
- Convoy status
- Integration queue status
- Explicit note that daemon/refinery now own scheduling

5. Validation handoff:
- If not complete: exact command to rerun this skill later
- If complete: gate results + plan-vs-actual summary
