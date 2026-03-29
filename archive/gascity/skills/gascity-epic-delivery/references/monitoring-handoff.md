# Execution Loop Reference

## TOC

1. Inspect convoy status
2. Find the next ready tracked bead
3. Execute one bead
4. Refresh and repeat

## 1. Inspect convoy status

Before each execution pass:

```bash
gc convoy status <convoy-id>
bd list --parent <convoy-id> --all --limit 0 --json
```

Use convoy status as the shared tracking surface:
- tracked beads
- closed/open counts
- target branch

## 2. Find the next ready tracked bead

Get the ready frontier:

```bash
bd ready --json
```

Intersect that set with the convoy's tracked beads from `bd list --parent <convoy-id> --json`.

Selection rules:
1. Prefer explicit review/checkpoint beads if they are the intended next gate.
2. Otherwise choose the earliest plan-ordered ready milestone bead.
3. If multiple beads are truly parallel, pick one and note the remaining ready
   siblings in your status update.

Do not pick work outside the convoy just because it is globally ready.

## 3. Execute one bead

For the selected tracked bead:

```bash
bd show <bead-id>
bd update <bead-id> --claim
```

Then execute that bead to completion in the current session:
- follow the bead's execution contract
- update artifacts named by the bead
- run the validation/proof commands named by the bead
- close the bead when the contract is actually satisfied

```bash
bd close <bead-id>
```

## 4. Refresh and repeat

After each closed bead:

```bash
gc convoy status <convoy-id>
bd ready --json
```

Continue until one of these is true:
- all tracked beads are closed
- open tracked beads remain but none are ready
- the bead graph is wrong and must be repaired/recreated before proceeding
