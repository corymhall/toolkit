# Failure Handling Reference

## TOC

1. Staging failure
2. No ready tracked bead
3. Graph drift during execution
4. Convoy close failure
5. Never-do list

## 1. Staging failure

Detect with:

```bash
gt convoy stage <epic-id> --json
```

Action:
- Report the exact failing command and the first actionable error line.
- Fix the execution bead graph or epic modeling issue.
- Re-stage after the fix.

## 2. No ready tracked bead

Symptom:
- tracked beads are still open
- `bd ready --json` contains no convoy-tracked bead

Action:
1. Inspect blockers:

```bash
gt convoy status <convoy-id>
bd blocked --json
```

2. Decide which of these is true:
- the current dependency graph is correct and you are waiting on a prior bead
- the graph is wrong and needs repair
- the plan is wrong and needs revision

Do not improvise external dispatch just because nothing is ready.

## 3. Graph drift during execution

If bead titles, deps, or checkpoint structure change materially during execution:

```bash
gt convoy stage <epic-id> --json
```

Re-stage so convoy tracking matches the current graph.

If the drift comes from a real plan mistake, repair `plans.md` before repairing
the beads.

## 4. Convoy close failure

Detect with:

```bash
gt convoy close <convoy-id>
```

If close fails:
- inspect the allegedly still-open tracked beads
- reconcile any stale bead status
- close the convoy only after the tracked set is genuinely complete

## 5. Never-do list

- Never run `gt convoy launch <convoy-id>` in this skill.
- Never fall back to `gt sling` loops for execution leaves.
- Never treat the staged convoy as proof that execution is complete.
- Never run `gt mq integration land <epic-id>` here.
