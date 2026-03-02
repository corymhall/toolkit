# Monitoring and Handoff Reference

## TOC

1. Monitoring loop
2. Completion criteria
3. 15-cycle handoff protocol
4. Resume protocol

## 1. Monitoring loop

Poll every 2 minutes. Track merged MRs as the primary readiness signal.
Use an `awaiter` subagent for this loop so monitoring continues while long waits occur.
Do not pause after a single cycle; re-arm wait + poll repeatedly until completion,
handoff threshold, or a true blocker.

Cycle commands:

```bash
gt mq integration status <epic-id>
gt convoy status <convoy-id>
```

Then branch behavior:

1. If merged MR count increased since last cycle:
- Announce landed work.
- Re-check completion criteria.
- If not complete, run:

```bash
bd ready --parent <epic-id> --json
```

- Apply merge-gate checks for each candidate.
- Sling each newly eligible leaf with `gt sling <leaf> <rig> --no-convoy`.
- If that sling fails with known `bd mol wisp ... --root-only` compatibility errors, retry once with:
  `gt sling <leaf> <rig> --no-convoy --hook-raw-bead`.
- Reset no-change counter to 0.

2. If merged MR count unchanged:
- Increment no-change counter.
- At 5+ no-change cycles (~10 minutes), escalate to user.

Wait behavior:

- Use `awaiter` subagent delay/wait primitives for ~120s between cycles.
- Do not end the workflow just because no immediate output appears.
- After each awaiter return, immediately continue to the next monitor cycle unless
  a stop condition is met (completion, escalation threshold, handoff threshold).
- If `awaiter` is unavailable, fall back to `sleep 120` in-session and continue the same loop.

Reporting cadence:
- Report immediately on transitions: new merge, new sling dispatch, escalation, completion.
- During steady no-change periods, batch status and report every 5 cycles (or at handoff).

## 2. Completion criteria

Treat epic wave as complete using leaf-task completion, not parent-epic closure.

Required:

1. Integration status shows no pending queue items.
2. No open/in-progress leaf tasks remain (`task`, `bug`, `feature`, `chore`).

Checks:

```bash
gt mq integration status <epic-id>
bd list --parent <epic-id> --status open --limit 0 --json
bd list --parent <epic-id> --status in_progress --limit 0 --json
```

Interpretation rule:
- Open parent epics alone do not mean work is still running.
- If open/in-progress results contain only `epic` items and there are no pending MRs, treat this as bookkeeping-only state.

Bookkeeping-only closure step:

```bash
# Close open child epics under the top epic when all leaves are done.
bd close <child-epic-1> <child-epic-2> ...

# Then close the top epic itself.
bd close <epic-id>
```

After closure, proceed to validation/reporting.

If deferred leaves exist, include them in final report and close convoy manually if needed:

```bash
gt convoy close <convoy-id> --force
```

## 3. 15-cycle handoff protocol

After 15 cycles, hand off if work remains in flight.

```bash
gt handoff -s "Epic delivery: <epic-id> monitoring" -m "
IMPORTANT: Resume this epic-delivery workflow FIRST.

Epic: <epic-id>
Convoy: <convoy-id>
Integration branch: <branch-name>
Progress: N/total MRs merged, M deferred, K in-flight
Pending MRs: <ids>
Open leaves: <ids>
Active polecats: <count>
Refinery re-assignments: <notes>
Last slung: <timestamp>
No-change counter: <value>
Phase: MONITORING
Next action: reload skill, continue monitor cycle
"
```

## 4. Resume protocol

Mandatory first step: reload the core workflow (`SKILL.md`) before taking actions.

Then:

1. Check convoy state:

```bash
gt convoy status <convoy-id>
```

2. Check epic tree:

```bash
bd list --parent <epic-id> --tree
```

3. Route:
- If leaves still open: return to monitor loop.
- If all leaves closed/deferred: go to validation.

4. Re-run ready/merge-gate dispatch for newly eligible leaves:

```bash
bd ready --parent <epic-id> --json
```

The convoy is the persistent state machine. Do not create sidecar state files.
