# Post-Launch Snapshot Reference

## TOC

1. Immediate snapshot
2. What this skill does not do
3. Resume later for completion

## 1. Immediate snapshot

After `gt convoy launch <convoy-id>`, capture one status snapshot:

```bash
gt convoy status <convoy-id>
gt mq integration status <epic-id>
```

Report:
- convoy lifecycle status
- pending/merged integration queue summary
- any immediate launch errors that require human action

## 2. What this skill does not do

This skill does not run a continuous monitor loop.

Do not:
- poll every N minutes in-session
- manually sling newly ready leaves after launch
- duplicate daemon scheduling behavior

After launch, daemon/refinery own ongoing scheduling and merge progression.

## 3. Resume later for completion

If execution is still in flight, stop after snapshot.

When user wants completion verification, rerun this skill on the same epic and proceed to validation/reporting checks.
