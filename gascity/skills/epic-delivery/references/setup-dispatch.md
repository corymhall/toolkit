# Setup Reference

## TOC

1. Resolve convoy and branch context
2. Validate convoy ownership
3. Validate execution beads
4. When to recreate convoy

## 1. Resolve convoy and branch context

### 1.1 Ensure bead type is convoy

```bash
bd show <convoy-id> --json | jq -r '.[0].issue_type // .issue_type'
```

If it is not `convoy`, stop and fix the modeling first.

### 1.2 Resolve target branch

```bash
awk -F': ' '/^target_branch:/{print $2}' docs/plans/<feature>/session-context.md
```

Record the target branch for later reporting and convoy alignment.

### 1.3 Resolve optional tracking epic

If session context still records a tracking epic:

```bash
awk -F': ' '/^epic_id:/{print $2}' docs/plans/<feature>/session-context.md
```

Treat it as a reporting surface only, not as the execution container.

## 2. Validate convoy ownership

### 2.1 Confirm convoy exists

```bash
gc convoy status <convoy-id>
```

Confirm the convoy exists, is owned, and points at the intended target branch.

## 3. Validate execution beads

Gather the convoy children:

```bash
bd list --parent <convoy-id> --all --limit 0 --json
```

Confirm the tracked graph contains the expected execution units:
- milestone beads
- explicit checkpoint beads for review-stop / shape-review points
- `implementation review`

If the convoy still contains only a tracking epic and not the execution beads,
stop and repair the parentage first.

If the graph is still lightweight status tracking instead of real execution
beads, stop and return to bead creation.

## 4. When to recreate convoy

Re-run:

```bash
gc convoy close <convoy-id>
gc convoy create "<feature> execution" <current-execution-bead-ids...> --owned --target <target-branch>
```

whenever:
- execution beads were added or removed
- deps changed materially
- milestone sequencing changed
- implementation review bead was renamed or repaired

The execution convoy is the shared tracking lens. Keep it aligned to the current
bead graph, and keep the convoy as the primary parent of those execution beads.
