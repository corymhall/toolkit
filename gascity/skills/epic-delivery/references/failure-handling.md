# Failure Handling Reference

## TOC

1. Convoy creation failure
2. No ready tracked bead
3. Graph drift during execution
4. Early convoy close risk
5. Never-do list

## 1. Convoy creation failure

Detect with:

```bash
gc convoy create "<feature> execution" <execution-bead-ids...> --owned --target <target-branch>
```

Action:
- Report the exact failing command and the first actionable error line.
- Fix the execution bead graph or tracking/convoy modeling issue.
- Recreate the convoy after the fix.

## 2. No ready tracked bead

Symptom:
- tracked beads are still open
- `bd ready --json` contains no convoy-tracked bead

Action:
1. Inspect blockers:

```bash
gc convoy status <convoy-id>
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
gc convoy close <convoy-id>
gc convoy create "<feature> execution" <current-execution-bead-ids...> --owned --target <target-branch>
```

Recreate the convoy so tracking matches the current graph.

If the drift comes from a real plan mistake, repair `plans.md` before repairing
the beads.

## 4. Early convoy close risk

`gc convoy close` will close the convoy even if tracked beads remain open, so
do not use close as a completion test.

Before closing:
- inspect convoy status
- confirm every tracked bead is genuinely closed
- only then run `gc convoy close <convoy-id>`

## 5. Never-do list

- Never dispatch from convoy creation in this skill.
- Never fall back to ad-hoc sling loops for execution leaves.
- Never treat convoy existence as proof that execution is complete.
- Never fall back to old integration-land commands here.
