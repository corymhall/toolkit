# Validation and Reporting Reference

## TOC

1. Confirm convoy completion
2. Close the convoy
3. Run final validation
4. Produce plan-vs-actual summary
5. Final boundary

## 1. Confirm convoy completion

Before final reporting:

```bash
gt convoy status <convoy-id>
```

Proceed only when every tracked execution bead is closed.

If open tracked beads remain, return to the execution loop or blocked-state
handling. Do not summarize early.

## 2. Close the convoy

Once all tracked beads are closed:

```bash
gt convoy close <convoy-id>
```

If convoy close fails because tracked beads are still open, treat that as a
real execution-state mismatch and resolve it before continuing.

## 3. Run final validation

Always update the integration branch first:

```bash
git checkout <integration-branch>
git pull
```

Then run the repo-configured quality gates that still make sense for the final
state:

```bash
gt rig settings show <rig>
```

Run configured gates in this order when present:
1. `setup_command`
2. `typecheck_command`
3. `lint_command`
4. `build_command`
5. `test_command`

If execution beads already included final verification commands, summarize that
evidence as part of the final report instead of pretending it happened twice.

## 4. Produce plan-vs-actual summary

Read:
- `docs/plans/<feature>/spec.md`
- `docs/plans/<feature>/plans.md`
- root epic + child execution beads

Inspect integration delta:

```bash
git diff main...<integration-branch> --stat
```

Produce a summary with this shape:

```text
Epic <epic-id> delivery complete.

Convoy: <convoy-id> - all tracked execution beads closed
Integration branch: <branch-name>

Plan vs Actual
- <milestone 1>: Met (bead <id>)
- <milestone 2>: Met (bead <id>)
- <checkpoint/implementation review>: Met (bead <id>)

Notes
- <important execution or validation details>
- <remaining risks, if any>
```

## 5. Final boundary

This skill ends after convoy close + validation + reporting.

Do not run:
- `gt convoy launch <convoy-id>`
- `gt mq integration land <epic-id>`
