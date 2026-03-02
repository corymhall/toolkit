# Setup and Launch Reference

## TOC

1. Setup steps
2. Merge-blocks validation gate
3. Launch
4. Notes

## 1. Setup steps

### 1.1 Reuse staged convoy if present

```bash
gt convoy list --all --json
```

If a staged convoy already tracks this epic, reuse it. Do not create duplicates.

### 1.2 Ensure bead type is epic

```bash
bd show <epic-id> --json | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(d['issue_type'])"
# If not epic:
bd update <epic-id> -t epic
```

### 1.3 Create or verify integration branch

```bash
gt mq integration status <epic-id>
# If missing:
gt mq integration create <epic-id>
```

Record integration branch name for later validation gates.

### 1.4 Stage convoy

```bash
gt convoy stage <epic-id> --json
```

Record convoy ID from output.

## 2. Merge-blocks validation gate

Goal: code-order dependencies should use `merge-blocks`.

### 2.1 Gather implementable leaves

```bash
bd list --parent <epic-id> --all --limit 0 --json
```

Focus on types: `task`, `bug`, `feature`, `chore`.

### 2.2 Inspect dependency types per leaf

For each leaf:

```bash
bd dep list <leaf-id> -t merge-blocks --json
bd dep list <leaf-id> -t blocks --json
```

### 2.3 Convert legacy code-order blocks

If a `blocks` edge represents code-order merge gating, convert it:

```bash
bd dep remove <blocked-id> <blocker-id>
bd dep add <blocked-id> <blocker-id> --type merge-blocks
```

Keep `blocks` for non-merge sequencing dependencies.

### 2.4 Validation output

Report:
- total `merge-blocks` edges found
- total legacy edges converted
- any ambiguous edges left for human decision

## 3. Launch

```bash
gt convoy launch <convoy-id>
```

Do not manually sling leaves after launch.

## 4. Notes

- Launch dispatches Wave 1 and transitions to daemon-managed feeding for later waves.
- This skill does not run a long-lived monitor loop.
