# Execution Loop Reference

## TOC

1. Inspect convoy status
2. Find the next ready tracked bead
3. Execute one bead
4. Refresh and repeat

## 1. Inspect convoy status

Before each execution pass:

```bash
gt convoy status <convoy-id>
gt convoy status <convoy-id> --json
```

Use convoy status as the shared tracking surface:
- tracked beads
- closed/open counts
- any attached workers

The convoy may remain in a staged status throughout this skill. That is fine.

If `docs/plans/<feature>/session-context.md` contains `validation_bead_id`,
remember that this capstone bead may live in town-level beads rather than the
local rig store.

## 2. Find the next ready tracked bead

Get the ready frontier:

```bash
bd ready --json
```

Intersect that set with the convoy's tracked beads from `gt convoy status --json`.

Selection rules:
1. Prefer explicit review/checkpoint beads if they are the intended next gate.
2. Otherwise choose the earliest plan-ordered ready milestone bead.
3. If multiple beads are truly parallel, pick one and note the remaining ready
   siblings in your status update.
4. If no local tracked bead is ready, check whether `validation_bead_id` is the
   last remaining open tracked bead and switch to that capstone target.

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
gt convoy status <convoy-id>
bd ready --json
```

Continue until one of these is true:
- all tracked beads are closed
- open tracked beads remain but none are ready
- the bead graph is wrong and must be repaired/re-staged before proceeding

For `validation_bead_id`, it is acceptable to inspect and work the bead through
the town-level `bd` routing rather than assuming `bd ready` in the local rig
will surface it automatically.
