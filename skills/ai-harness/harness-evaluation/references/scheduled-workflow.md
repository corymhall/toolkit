# Scheduled Harness Evaluation Workflow

Use this workflow for the personal daily evaluator, its independent
review/merge task, and delayed human review.

## Durable State

State lives outside any session or worktree:

```text
${XDG_STATE_HOME:-~/.local/state}/toolkit/harness-evaluation/state.db
```

Use the bundled CLI rather than editing SQLite directly:

```bash
SKILL_DIR=<directory containing harness-evaluation/SKILL.md>
STATE="$SKILL_DIR/scripts/evaluation_state.py"
python3 "$STATE" init
python3 "$STATE" queue
```

The database stores runtime scan cursors, immutable run/session snapshots,
coalesced findings, evidence, worktree/commit metadata, independent review
results, human decisions, and merge/closure events.

## Daily Evaluator

### Start and scan

```bash
run_json=$(python3 "$STATE" begin-run --json)
run_id=$(printf '%s' "$run_json" | jq -r .run_id)
python3 "$STATE" scan --run-id "$run_id" --json > "/tmp/harness-$run_id-sessions.json"
python3 "$STATE" queue
```

The first run scans 24 hours. Later runs start from each runtime's last
successful cursor with a one-hour overlap and exclude exact session snapshots
already processed by completed runs. Pi and Codex both use latest
user/assistant activity, so resumed sessions remain visible.

Do not advance cursors until evaluation and recording finish:

```bash
python3 "$STATE" finish-run --run-id "$run_id" --report "<short outcome>"
```

On an unrecoverable evaluator failure:

```bash
python3 "$STATE" fail-run --run-id "$run_id" --note "<failure>"
```

A failed run does not move cursors.

### Coalesce findings

Use one stable, semantic key for the same issue across days, for example
`request-review:unsupported-gh-field`. Append new evidence instead of creating a
new item:

```bash
python3 "$STATE" record-finding \
  --run-id "$run_id" \
  --key '<skill>:<issue>' \
  --skill '<skill>' \
  --scope personal \
  --kind objective-fix \
  --status auto-fix-in-progress \
  --title '<short title>' \
  --summary '<current conclusion>' \
  --repository '<repo>' \
  --evidence '<session path and concrete turn>'
```

Use `discussion` / `needs-discussion` for judgment calls and `watching` /
`watching` for evidence that is not yet strong enough.

`attach-change` advances a completed correction from `auto-fix-in-progress` to
`auto-fix-awaiting-review`. If an unresolved auto-fix already changes a skill,
append evidence to that item. Do not create another conflicting worktree for the
same issue.

## Autonomous Change Boundary

The daily evaluator may edit only personal toolkit-owned behavior when the
finding has one objectively correct repair that does not change intended scope
or policy.

Eligible examples:

- invalid commands, flags, fields, or paths;
- stale references to renamed or removed files;
- deterministic parser bugs for a supported session format;
- broken package, installation, or validation instructions;
- repeated command churn caused by an objectively wrong invocation.

Not eligible without human discussion:

- skill trigger changes;
- workflow steps or output contracts;
- automation versus manual recovery policy;
- support-scope or product decisions;
- a new skill;
- review posture or orchestration;
- repo-local skill or documentation changes from the toolkit worktree;
- any case with multiple reasonable repairs.

Fix the owning tool description, schema, validator, script, or runtime when the
failure belongs there. Do not add a skill workaround.

For an eligible fix:

1. make only the narrow correction in the automation worktree;
2. run focused and repository-required validation;
3. commit the change;
4. attach it to the finding:

```bash
python3 "$STATE" attach-change \
  --key '<skill>:<issue>' \
  --worktree "$PWD" \
  --branch "$(git branch --show-current)" \
  --commit "$(git rev-parse HEAD)" \
  --validation '<commands and result>'
```

Do not merge the evaluator's own change.

For a judgment call, record evidence, options, recommendation, and the question
for the user. Do not create speculative code or a worktree-only proposal.

## Independent Review And Merge

The reviewer/merger starts with:

```bash
python3 "$STATE" pending-auto --json
```

For each `auto-fix-awaiting-review` item:

1. verify the recorded worktree, commit, diff, and validation;
2. confirm the change qualifies for the autonomous boundary above;
3. run one independent general review against the claimed objective correction;
4. rerun material validation when practical;
5. do not edit the candidate during review.

Record the result:

```bash
python3 "$STATE" review-result \
  --key '<skill>:<issue>' \
  --result passed \
  --note '<evidence>'
```

Use `failed` for a concrete defect and `needs-discussion` for any ambiguity.
Only `auto-fix-review-passed` items may be merged automatically. After merge:

```bash
python3 "$STATE" close \
  --key '<skill>:<issue>' \
  --status resolved \
  --note 'merged as <commit>'
```

A reviewer finding returns the item to the durable queue. The reviewer must not
fix and merge in one pass.

Other automation worktrees that are not linked to harness-evaluation state may
follow their existing repository review policy. Never infer that an unlinked
worktree is an evaluator-approved skill fix.

## Delayed Human Review

Show every unresolved item plus terminal decisions since the prior human review:

```bash
python3 "$STATE" queue --include-resolved --since-last-human-review
```

Record decisions as they are made:

```bash
python3 "$STATE" decide --key '<key>' --decision approve --note '<decision>'
python3 "$STATE" decide --key '<key>' --decision dismiss --note '<reason>'
python3 "$STATE" decide --key '<key>' --decision watch --note '<evidence needed>'
python3 "$STATE" decide --key '<key>' --decision revise --note '<new direction>'
```

When the user confirms the review is complete:

```bash
python3 "$STATE" mark-human-review --note '<review summary>'
```

Do not mark the review complete merely because the scheduled evaluator ran.
Unresolved items remain visible across days until explicitly resolved,
dismissed, superseded, or left watching.
