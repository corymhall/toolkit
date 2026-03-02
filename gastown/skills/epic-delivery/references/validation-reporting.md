# Validation and Reporting Reference

## TOC

1. Validate integration state
2. Run quality gates
3. Handle gate failures
4. Produce plan-vs-actual summary
5. Offer deeper review
6. Final boundary and next steps

## 1. Validate integration state

```bash
gt mq integration status <epic-id>
```

Proceed only after pending MRs are fully processed.

Before gates, reconcile bookkeeping state:
- If all implementable leaves are closed but parent epics remain open, close child epics and then close the top epic.
- Do not treat open parent epics alone as execution-in-flight.

## 2. Run quality gates

Always update local integration branch first:

```bash
git checkout <integration-branch>
git pull
```

Load configured gate commands:

```bash
gt rig settings show <rig>
```

Run configured gates in this order (skip empty commands):
1. `setup_command`
2. `typecheck_command`
3. `lint_command`
4. `build_command`
5. `test_command`

Fail fast. On first failure, switch to failure flow.

## 3. Handle gate failures

Report failing gate + concise output, then ask user for direction.

Recommended path: bug-fix sub-epic under same parent epic.

Example commands:

```bash
bd create "<epic-title>: bug fixes" -t epic --parent <epic-id>
bd create "Fix: <issue 1>" -t bug --parent <bugfix-epic-id>
bd create "Fix: <issue 2>" -t bug --parent <bugfix-epic-id>
gt convoy add <convoy-id> <fix-1-id> <fix-2-id>
```

Then return to stage/launch flow. After fixes merge, re-run all configured gates from the beginning.

## 4. Produce plan-vs-actual summary

1. Read plan source.
- Prefer plan files: `plans/`, `.beads/plans/`, `docs/plans/`.
- If no plan file exists, use epic + leaf acceptance criteria from beads.

2. Inspect integration delta:

```bash
git diff main...<integration-branch> --stat
```

3. Produce summary with this shape:

```text
Epic <epic-id> delivery complete.

Convoy: <convoy-id> - N leaves closed, M deferred
Integration branch: <branch-name> - all configured gates pass

Plan vs Actual
- <criterion 1>: Met (task <id>)
- <criterion 2>: Met (task <id>)
- <criterion 3>: Partial (<reason>)

Skipped/Deferred
- <bead-id>: <title> (<reason>)

Notes
- <important refinery or execution events>
```

## 5. Offer deeper review

After lightweight summary, ask whether to run deeper implementation review.

If yes, run repo-configured review flow before final report.

## 6. Final boundary and next steps

This skill ends after integration-branch validation + reporting.

Final reminder:
1. QA run is separate.
2. Finalization is PR/manual maintainer path.
3. Do not run `gt mq integration land <epic-id>` in this workflow.
