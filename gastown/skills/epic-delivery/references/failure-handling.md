# Failure Handling Reference

## TOC

1. Stage or launch failure
2. Dependency modeling issues
3. Refinery anomalies after launch
4. Stale bead status after merge
5. Never-do list

## 1. Stage or launch failure

Detect with:

```bash
gt convoy stage <epic-id> --json
gt convoy launch <convoy-id>
```

Action:
- Report exact failing command and first actionable error line.
- Do not fall back to manual per-leaf sling loops.
- Fix the blocking condition, then rerun stage/launch.

## 2. Dependency modeling issues

If code-order dependencies are still represented as `blocks`, convert before launch:

```bash
bd dep remove <blocked-id> <blocker-id>
bd dep add <blocked-id> <blocker-id> --type merge-blocks
```

If edge intent is ambiguous (code-order vs sequencing), escalate for user decision.

## 3. Refinery anomalies after launch

Detect with:

```bash
gt convoy status <convoy-id>
gt mq integration status <epic-id> --json
gt mq list <rig> --epic <epic-id> --json
```

Action:
- Report anomaly clearly (re-assignment, stuck queue, missing MR progression).
- Keep convoy/daemon model intact; do not switch to manual dispatch mode in this skill.

## 4. Stale bead status after merge

Symptom:
- MR merged to integration branch.
- Bead still open/in_progress.

Detect:

```bash
gt mq integration status <epic-id>
bd show <task-id>
```

Recovery:

```bash
bd close <task-id> --force
```

Use only after merge confirmation.

## 5. Never-do list

- Never run manual per-leaf dispatch loops as fallback for this skill.
- Never kill polecats.
- Never run `gt mq integration land <epic-id>` here.
