# Setup Reference

## TOC

1. Resolve epic and branch context
2. Reuse or stage convoy
3. Validate execution beads
4. When to re-stage

## 1. Resolve epic and branch context

### 1.1 Ensure bead type is epic

```bash
bd show <epic-id> --json | jq -r '.[0].issue_type // .issue_type'
```

If it is not `epic`, stop and fix the modeling first.

### 1.2 Create or verify integration branch

```bash
gt mq integration status <epic-id>
# If missing:
gt mq integration create <epic-id>
```

Record the integration branch name for later reporting and validation.

## 2. Reuse or stage convoy

### 2.1 Reuse staged convoy if present

```bash
gt convoy list --all --json
```

If a staged convoy already tracks this epic, reuse it. Do not create duplicates.

### 2.2 Stage convoy if needed

```bash
gt convoy stage <epic-id> --json
```

Record:
- convoy ID
- staged status
- warnings, if any
- wave summary

Do not run `gt convoy launch`.

## 3. Validate execution beads

Gather the root epic children:

```bash
bd list --parent <epic-id> --all --limit 0 --json
```

Confirm the child graph contains the expected execution units:
- milestone beads
- explicit checkpoint beads for review-stop / shape-review points
- `final review`
- `verification and ship`

If the graph is still lightweight status tracking instead of real execution
beads, stop and return to bead creation.

## 4. When to re-stage

Re-run:

```bash
gt convoy stage <epic-id> --json
```

whenever:
- execution beads were added or removed
- deps changed materially
- milestone sequencing changed
- final review / verification beads were renamed or repaired

The staged convoy is the shared tracking lens. Keep it aligned to the current
bead graph.
