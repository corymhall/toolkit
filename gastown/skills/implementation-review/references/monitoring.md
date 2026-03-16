# Monitoring Reference

## TOC

1. Primary signals
2. Retry policy
3. Synthesis rules

## 1. Primary signals

Treat `gt peek <rig>/<polecat>` as the primary live-progress signal.

Secondary signals:
- `gt polecat status <rig>/<polecat>`
- `gt hook show <rig>/<polecat>`
- `find "$REVIEW_DIR" -type f`

Do not synthesize until the expected report files exist.

## 2. Retry policy

- If `gt peek` shows the worker still sitting at the initial assigned prompt
  after the first wait window, send one explicit nudge.
- If it still has not started after the second wait window, classify startup as
  failed and record that in the session ledger or status notes.

Example nudge:

```bash
gt nudge <rig>/<polecat> "Run gt hook and execute the hooked mol-review-implementation now. This is a report-only task writing to the shared .runtime review directory; do not commit the report."
```

## 3. Synthesis rules

After the required reports exist:
- read all review reports
- deduplicate overlaps
- classify blocking vs non-blocking issues
- inspect the session ledger when present to verify proof models actually match evidence
- if `plans.md` exists, inspect for material implementation drift

If blocking issues exist:
- return to implementation/fix work
- do not call the review boundary complete

If reviewers materially disagree:
- summarize the disagreement clearly
