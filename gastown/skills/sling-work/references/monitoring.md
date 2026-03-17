# Monitoring Reference

## TOC

1. Primary signals
2. Terminal conditions
3. Retry policy
4. Dispatch-later handoff

## 1. Primary signals

Treat `gt peek <rig>/<polecat>` as the primary live-progress signal.

Secondary signals:

- `gt polecat status <rig>/<polecat>`
- `gt hook show <rig>/<polecat>`
- expected artifact existence checks such as `find "$OUTPUT_DIR" -type f`

Use the artifact or hook signal as the completion proof, not a guess based on
"it has probably finished by now."

## 2. Terminal conditions

Choose the relevant terminal condition before launch. Common examples:

- expected output file exists
- hooked bead is closed
- worker is idle with no hook and expected artifact exists
- work was intentionally only launched and ownership transferred

Do not stop monitoring until the chosen condition is met or the run is
explicitly classified as failed/stalled.

## 3. Retry policy

- If `gt peek` shows the worker still at the initial assigned prompt after the
  first wait window, send one explicit nudge.
- If it still has not started after the second wait window, classify startup as
  failed.
- If the hook clears but the expected artifact is missing, inspect worker state
  before assuming success.
- If the worker is clearly making progress, keep waiting instead of summarizing
  early.

Example nudge:

```bash
gt nudge <rig>/<polecat> "Run gt hook and execute the hooked work now."
```

## 4. Dispatch-later handoff

If you are not monitoring to completion, record enough to resume later:

- what was slung
- who owns it now
- where status should be checked
- what artifact or completion signal you expect later

Good follow-up surfaces:

- bead notes
- session ledger
- handoff note
