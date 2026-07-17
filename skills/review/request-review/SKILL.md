---
name: request-review
description: Run a focused manual review of a diff, branch, file set, or spec-aligned implementation using the smallest useful set of independent review lenses, then synthesize verified findings.
disable-model-invocation: true
---

# Request Review

Run a manual review without entering a larger workflow. Identify the target,
choose the smallest useful lens set, and synthesize findings for the user.

Use `review-pr` instead when the user wants GitHub review comments drafted,
posted, approved, or requested-changes submitted.

## Scope

Accept review requests for:

- current diff
- branch or ref range
- file list or directory
- spec path plus implementation scope
- PR URL or number for local analysis only

If the user is vague, default to the current git diff. Open
[references/target-shapes.md](references/target-shapes.md) for interpretation
details.

## Lens Selection

Use [references/reviewer-lenses.md](references/reviewer-lenses.md) as the source
of truth for lens selection and each lens contract. Choose the smallest set that
answers the user's actual question. Do not add lanes merely because they exist.
The `references/` links are relative to this `request-review` skill directory;
do not probe a sibling or parent `skills/review/references/` directory.

Inspect enough of the target in the main session to frame precise sidecar
prompts. Do not use sidecars to outsource baseline repository understanding.

## Launch Visible Sidecars

When `HERDR_ENV=1`, load the Herdr skill and give each independent review lane
its own tab:

1. Re-list panes and tabs, identify the current workspace, and do not rely on
   remembered IDs because Herdr IDs can compact.
2. Prepare a mode-`0600` prompt file containing the exact target, cwd,
   applicable lens contract, and these boundaries: remain read-only, return
   findings directly, and do not implement fixes.
3. Create one non-focused tab per selected lens with a semantic label such as
   `agent-general-review`. Add a short task suffix when duplicate roles may
   coexist. Parse the new tab's root pane ID from the create response.
4. Start another interactive instance of the active harness in that root pane,
   wait for it to become idle, then send the prompt as terminal input. The
   sidecar owns only this tab and must not spawn additional agents.
5. Run independent lanes in parallel when practical. Wait about five minutes
   for small reviews and up to ten minutes for larger reviews.
6. Re-list before later operations, wait for completion, then read unwrapped
   recent output. Never repurpose a tab containing a working or blocked agent.
   Retry one timeout with a larger wait before declaring a lane unavailable.
7. Keep sidecar tabs through synthesis so the user can inspect or steer them.
   Close them and remove prompt files after findings are captured, verified,
   and reported unless the user asks to retain the tabs.

### Herdr Launch Commands

Use this tab creation pattern for each sidecar:

```bash
TAB_JSON=$(herdr tab create \
  --workspace "$WORKSPACE_ID" \
  --label "$TAB_LABEL" \
  --no-focus)

PANE_ID=$(printf '%s' "$TAB_JSON" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

CWD_Q=$(python3 -c 'import shlex,sys; print(shlex.quote(sys.argv[1]))' "$REVIEW_CWD")
```

Start Pi without discovered extensions, skills, or prompt templates so the lane
receives only the review contract supplied by the parent:

```bash
herdr pane run "$PANE_ID" \
  "cd $CWD_Q && pi --no-session --no-extensions --no-skills --no-prompt-templates --tools read,grep,find,ls,bash"
```

For `go_reviewer`, explicitly add the shared Go skill while leaving general
skill discovery disabled:

```bash
GO_SKILL_Q=$(python3 -c 'import shlex,sys; print(shlex.quote(sys.argv[1]))' "$GO_SKILL_DIR")
herdr pane run "$PANE_ID" \
  "cd $CWD_Q && pi --no-session --no-extensions --no-skills --skill $GO_SKILL_Q --no-prompt-templates --tools read,grep,find,ls,bash"
```

Pi has no read-only sandbox; `bash` remains available for Git evidence, so the
prompt's no-modification boundary is important. If the prompt contains all
needed command output, omit `bash` and use `--tools read,grep,find,ls`.

Start Codex in its actual read-only sandbox:

```bash
herdr pane run "$PANE_ID" \
  "codex -C $CWD_Q --sandbox read-only"
```

Read-only Codex lanes must stick to inspection commands. Do not ask them to
create temporary checkouts, run tests from extracted archives, or otherwise
write to `/tmp`; perform that verification in the main session when it is
needed.

For either harness, wait for startup, send the prompt without interpreting it as
a shell command, and wait for the review turn:

```bash
herdr wait agent-status "$PANE_ID" --status idle --timeout 30000
herdr pane send-text "$PANE_ID" "$(cat "$PROMPT_FILE")"
herdr pane send-keys "$PANE_ID" Enter
herdr wait agent-status "$PANE_ID" --status done --timeout "$WAIT_MS"
herdr pane read "$PANE_ID" --source recent-unwrapped --lines 500
```

Set `WAIT_MS` to about `300000` for a small review or `600000` for a larger one.
If a user focuses or reads the tab, a completed agent may appear `idle` instead
of `done`; inspect its recent output before treating that as a timeout.

Use a concise Markdown artifact when lane output must survive the session or be
consumed without relying on terminal scrollback. Do not create artifacts for
small reviews when the visible output is enough.

If Herdr is unavailable, apply the selected lenses in the main session, keep
their observations distinct during analysis, and disclose that isolated review
contexts were unavailable. Do not introduce another generic subagent framework
just to run these lenses.

## Review Rules

- Keep setup read-only. Do not rebase, merge, cherry-pick, reset, or otherwise
  rewrite the branch unless the user explicitly asks.
- Gather only the evidence needed for the target: diff, files, named refs,
  spec/task documents, or PR metadata.
- For PR-backed reviews, read `baseRefName`, `headRefName`, and `headRefOid` from
  the PR. Verify refs with `git rev-parse --verify` and fetch exact refs when
  necessary before using `git diff <base>...<head>`.
- `gh pr diff` supports `--name-only`, not `--name-status`. Use verified local
  refs with `git diff --name-status` when status letters matter.
- Treat non-zero `gh pr checks` results as potentially useful failing or pending
  CI state, not automatically as command misuse.
- Use supported `gh pr view --json` fields. Use `gh api` when review comments,
  reviews, or threads are not exposed there.
- Review lanes return evidence-backed findings rather than process narration.
- The main session owns synthesis and implementation. Verify material sidecar
  findings against the code before reporting or acting on them.

## Synthesis

Report findings first, ordered by severity. Include:

- blocking findings
- important non-blocking findings
- disagreements or ambiguities across lenses
- residual risks, unavailable lenses, or test gaps

If there are no meaningful findings, say so clearly and name remaining
uncertainty. Keep scope and lens details brief unless they explain review
confidence.

## Stop Condition

Stop after reporting the review. Do not automatically fix the implementation,
update specs, or post GitHub comments. Continue only when the user asks to act
on the findings, or use `review-pr` for GitHub comments.
