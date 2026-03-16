# Failure Handling Reference

## TOC

1. Review launch failure
2. Blocking synthesis result
3. Missing artifacts

## 1. Review launch failure

If reviewer sling fails:
- report the exact failing command and first actionable error
- fix the launch/setup problem
- relaunch only the missing reviewer

Do not silently continue with a missing default reviewer.

## 2. Blocking synthesis result

If the review synthesis finds blocking issues:
- return to implementation/fix work
- update the current workflow/bead status notes
- rerun `$implementation-review` after fixes

Do not close the review boundary while blocking findings are unresolved.

## 3. Missing artifacts

If the checkpoint commit, pushed branch, or shared review directory is missing:
- recreate the checkpoint cleanly
- relaunch the reviewers against the corrected inputs

The review boundary is only meaningful if reviewers inspected stable, shared inputs.
