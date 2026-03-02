---
name: epic-delivery
description: Deliver a beads epic through polecats and refinery using merge-gated dependencies. Use when an epic is ready for execution and you need to create/verify integration branch state, keep convoy staged as tracker only, manually sling eligible leaf tasks, monitor refinery progress, run quality gates, and report readiness without running gt mq integration land.
---

# Epic Delivery

Run a strict staged-convoy workflow for epic execution. Dispatch manually per leaf task. Use `merge-blocks` dependencies for code-order readiness.

## Input

Required:
- Epic ID (example: `gt-abc`)

Auto-detected:
- Rig from current workspace

## Non-Negotiable Rules

1. Never run `gt convoy launch`.
2. Never run `gt sling <convoy-id>`.
3. Never use bead closure alone as dependency readiness when dependencies are modeled as `blocks`.
4. Never use `merge=local` or `merge=direct` in this workflow.
5. Never run `gt mq integration land <epic-id>` in this workflow.
6. Keep convoy staged as tracker/state machine only.
7. Sling leaf IDs with `gt sling <leaf-id> <rig> --no-convoy`.
   If that fails with known formula/wisp `--root-only` compatibility errors, retry once with:
   `gt sling <leaf-id> <rig> --no-convoy --hook-raw-bead`.
8. Prefer `merge-blocks` dependency type for code-order deps (`bd dep add <blocked> <blocker> --type merge-blocks`).
9. Use the `awaiter` subagent for long-running monitor waits; do not stop after initial sling dispatch.
10. Completion must be leaf-based: do not wait on open parent epics if all implementable leaves are done and no MRs are pending.
11. When only parent epics remain open, close those parent epics (and then the top epic) as bookkeeping before final validation/reporting.

## Workflow

1. Setup integration context.
- Reuse staged convoy if it already tracks the epic.
- Ensure epic type is `epic`.
- Create/verify integration branch.
- Stage convoy as tracker (no launch).
- See [references/setup-dispatch.md](references/setup-dispatch.md).

2. Dispatch ready leaves manually.
- Get ready leaves with `bd ready --parent <epic-id> --json`.
- Ensure dependency semantics are correct:
  - `merge-blocks` for code-order dependencies.
  - `blocks` for non-merge sequencing dependencies.
- Only run per-candidate manual merge-proof checks for legacy trees still using `blocks` for code-order deps.
- Sling each eligible leaf with `--no-convoy`.
- See [references/setup-dispatch.md](references/setup-dispatch.md).

3. Monitor and continue dispatch.
- Poll integration status every 2 minutes.
- Run the monitor loop inside an `awaiter` subagent.
- Continue cycles autonomously in the same run until completion, 15-cycle handoff, or explicit blocker.
- Treat merged/pending MR state as progress signal.
- Re-run ready + dispatch checks each cycle.
- If no open/in-progress leaves remain and no pending MRs remain, close any still-open parent epics as bookkeeping.
- Hand off after 15 cycles if still in flight.
- See [references/monitoring-handoff.md](references/monitoring-handoff.md).

4. Handle abnormal states.
- Detect refinery re-assignment, orphaned polecat branches, stale beads, and stuck tasks.
- Escalate with dependency-aware options.
- See [references/failure-handling.md](references/failure-handling.md).

5. Validate and report.
- Confirm integration state.
- Run configured quality gates in order.
- If gates fail, create bug-fix sub-epic and resume dispatch/monitor loop.
- Produce lightweight plan-vs-actual summary.
- Offer optional deeper review.
- End by reporting QA + PR/manual maintainer next steps.
- See [references/validation-reporting.md](references/validation-reporting.md).

## Output Contract

Report each major transition clearly:

1. Setup complete:
- Epic ID
- Convoy ID
- Integration branch
- Count of currently ready leaf tasks

2. Dispatch action:
- Slung task IDs/titles
- Any tasks held back by `merge-blocks` (or by legacy manual merge checks)

3. Monitoring updates:
- Merged MR count / pending count
- Newly eligible tasks dispatched this cycle
- No-change counter
 - Report cadence: only on transitions (new merge, new dispatch, escalation, completion) or every 5 no-change cycles.

4. Final validation:
- Gate results (pass/fail per configured gate)
- Plan-vs-actual summary
- Deferred/skipped tasks
- Bookkeeping actions taken (for example parent-epic closure)
- Final next step reminder: QA then PR/manual maintainer path
