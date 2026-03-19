# Failure Handling Reference

## TOC

1. Launch failure
2. Stalled startup
3. Missing result
4. Wrong target or wrong hook

## 1. Launch failure

If `gt sling` itself fails:

- report the exact command
- report the first actionable error line
- fix the launch inputs before retrying

Do not keep retrying a structurally bad command.

## 2. Stalled startup

If the worker never gets past the initial prompt:

1. confirm with `gt peek`
2. nudge once
3. check `gt polecat status` and `gt hook show`

If it still does not start, classify the run as stalled/failed and decide
whether to retarget or stop.

## 3. Missing result

If the worker appears to run but the expected result is missing:

- inspect hook status
- inspect worker state
- inspect the expected output location
- if the worker claimed it sent mail, re-check `gt mail inbox` and read recent
  matching subjects
- if the report/mail is still missing, nudge the worker to resend it or restate
  where it was written

Do not call the run successful without the promised artifact or completion
signal.

## 4. Wrong target or wrong hook

If the work lands on the wrong worker or wrong hook:

- stop launching more related work
- reconcile the incorrect hook/assignment first
- only then relaunch or continue monitoring

Misrouted work compounds quickly when multiple sidecars are involved.
