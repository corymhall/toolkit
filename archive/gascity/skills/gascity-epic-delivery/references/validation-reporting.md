# Validation and Reporting Reference

## TOC

1. Confirm convoy completion
2. Land the convoy
3. Run final validation
4. Produce plan-vs-actual summary
5. Final boundary

## 1. Confirm convoy completion

Before final reporting:

```bash
gc convoy status <convoy-id>
```

Proceed only when every tracked execution bead is closed.

If open tracked beads remain, return to the execution loop or blocked-state
handling. Do not summarize early.

## 2. Land the convoy

Once all tracked beads are closed:

```bash
gc convoy land <convoy-id>
```

Do not use land as the proof step. Confirm closure from convoy status first,
then land the owned convoy explicitly.

## 3. Run final validation

Resolve the target branch for comparison/reporting. Stay on the current
execution branch or worktree unless the repo's final validation flow explicitly
requires switching context:

```bash
git branch --show-current
git diff <target-branch>...HEAD --stat
```

Then consult the rig's repo-local instructions and automation for the quality
gates that still make sense for the final state. Typical sources include
`AGENTS.md`, `README.md`, `Makefile`, package scripts, or repo-specific task
runners.

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
- execution convoy + tracked execution beads

Inspect target-branch delta:

```bash
git diff <target-branch>...HEAD --stat
```

Produce a summary with this shape:

```text
Convoy <convoy-id> delivery complete.

Convoy: <convoy-id> - all tracked execution beads closed
Target branch: <branch-name>

Plan vs Actual
- <milestone 1>: Met (bead <id>)
- <milestone 2>: Met (bead <id>)
- <checkpoint/implementation review>: Met (bead <id>)

Notes
- <important execution or validation details>
- <remaining risks, if any>
```

## 5. Final boundary

This skill ends after convoy land + validation + reporting.

Do not run:
- any daemon-dispatch convoy launch path
- old integration-land commands from the pre-convoy workflow model
