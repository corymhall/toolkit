# Failure Handling Reference

## TOC

1. Refinery re-assignments
2. Orphaned polecat work
3. Stale bead status after merge
4. Sling formula/wisp compatibility mismatch
5. Truly stuck tasks
6. Never-do list

## 1. Refinery re-assignments (normal)

Refinery may re-assign after conflicts.

Detect with:

```bash
gt convoy status <convoy-id>
gt mq integration status <epic-id> --json
gt mq list <rig> --epic <epic-id> --json
```

Action:
- Inform user with explicit task + status.
- Keep monitoring.
- Do not kill polecats.

## 2. Orphaned polecat work (code exists, no MR)

Symptom:
- No active polecat for task, but remote branch has commits.

Detect:

```bash
git branch -r | grep "<task-id>"
git log origin/polecat/<name>/<task-id>@<session> --oneline -5
git diff origin/<integration-branch>...origin/polecat/<name>/<task-id>@<session> --stat
```

Recovery (if branch work is valid):

```bash
gt mq submit --branch polecat/<name>/<task-id>@<session> --issue <task-id> --epic <epic-id> --no-cleanup
```

## 3. Stale bead status after merge

Symptom:
- MR merged to integration branch.
- Bead still open or in-progress.

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

## 4. Sling formula/wisp compatibility mismatch

Symptom:
- Manual leaf dispatch fails during `gt sling <leaf> <rig> --no-convoy`
- Error shows `bd mol wisp` rejected `--root-only` (or equivalent unknown-flag failure)

Detect:

```bash
gt sling <leaf> <rig> --no-convoy
```

If output includes:
- `unknown flag: --root-only`
- `Error: creating wisp: exit status 1`

Recovery:

```bash
gt sling <leaf> <rig> --no-convoy --hook-raw-bead
```

Rules:
- Retry once with `--hook-raw-bead` only for this known compatibility class.
- Keep `--no-convoy`.
- If fallback also fails, escalate with command output and do not loop retries.

## 5. Truly stuck tasks

Indicators:
- Bead in progress but no active polecat.
- MR submitted but refinery not progressing.
- Repeated no-change cycles beyond threshold.
- Bead in `merge-blocked` with no upstream merge progress for multiple cycles.

Before presenting options, inspect dependency impact:

```bash
bd dep tree <bead-id> --direction=up
```

Escalation options:

1. If task has downstream dependents:
- Offer: wait longer, re-sling fresh polecat, user manual fix pause, abort delivery.
- Do not offer skip.

2. If task has no downstream dependents:
- Offer: wait longer, re-sling fresh polecat, skip (defer), user manual fix pause.

If user selects skip (only when no dependents):

```bash
bd update <bead-id> --status deferred
```

If user selects manual fix:
- Pause monitor loop.
- Resume only when user explicitly says continue/resume.

## 6. Never-do list

- Never kill polecats.
- Never re-sling hooked/in-progress beads.
- Never retry destructive recovery without user approval when true failure occurred.
