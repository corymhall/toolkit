---
name: request-review
description: Run a focused independent review of a diff, branch, file set, or pull request using one general reviewer by default and only the additional test, Go, error-handling, contract-alignment, or domain lenses that answer distinct unresolved questions.
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
- PR URL or number for local analysis only

An issue, decision note, design discussion, task, or plan is context by default,
not an authoritative checklist for an isolated sidecar. Treat a named document
as authoritative only when the user explicitly says so or when it defines the
external protocol, compatibility, security, or policy contract being reviewed.
The main session owns interpreting intent because it retains the conversation
with the user.

If the user is vague, default to the current git diff. Open
[references/target-shapes.md](references/target-shapes.md) for interpretation
details.

## Lens Selection

Use [references/reviewer-lenses.md](references/reviewer-lenses.md) as the source
of truth for lens selection and each lens contract. Start with one
`general_reviewer`. Add another lane only when it answers a distinct unresolved
question; the presence of tests, Go files, repository instructions, or a plan
does not by itself justify another lane. A contract-alignment lane is appropriate
only for an explicitly authoritative document or external contract, not an
ordinary implementation plan.

The `references/` links are relative to this `request-review` skill directory;
do not probe a sibling or parent `skills/review/references/` directory.

Inspect enough of the target in the main session to frame precise sidecar
prompts. Include a concise statement of intended observable behavior and
accepted constraints from the conversation. Read and apply repository
instructions in the main session. Do not use sidecars to reconstruct user intent,
enforce a lossy specification, perform author documentation work, or outsource
baseline repository understanding.

## Launch Visible Sidecars

When `HERDR_ENV=1`, load the Herdr skill and give each independent review lane
its own tab:

1. Re-list panes and tabs and identify the current workspace before creating
   anything.
2. Prepare a mode-`0600` prompt file containing the exact target, cwd,
   applicable lens contract, and these boundaries: remain read-only, return
   findings directly, and do not implement fixes.
3. Create one non-focused tab per selected lens with a semantic label such as
   `agent-general-review`. Choose a matching unique agent name such as
   `review-general`; names must match `[a-z][a-z0-9_-]{0,31}`. Add a short task
   suffix when duplicate roles may coexist. Parse the new tab's root pane ID
   from the create response.
4. Start another interactive instance of the active harness in that root pane
   with `agent start`, then submit the prompt with `agent prompt --wait`. The
   sidecar owns only this tab and must not spawn additional agents.
5. Run independent lanes in parallel when practical. Wait about five minutes
   for small reviews and up to ten minutes for larger reviews.
6. Re-list before later operations, inspect the resolved agent after the prompt
   wait settles, then read unwrapped recent output. Never repurpose a tab
   containing a working or blocked agent. Retry one timeout with a larger wait
   before declaring a lane unavailable.
7. Keep sidecar tabs through synthesis so the user can inspect or steer them.
   Close them and remove prompt files after findings are captured, verified,
   and reported unless the user asks to retain the tabs.

### Herdr Launch Commands

Use this tab creation pattern for each sidecar. Retain both `TAB_LABEL` and the
strict, unique `AGENT_NAME` chosen for the lane:

```bash
TAB_JSON=$(herdr tab create \
  --workspace "$WORKSPACE_ID" \
  --cwd "$REVIEW_CWD" \
  --label "$TAB_LABEL" \
  --no-focus)

PANE_ID=$(printf '%s' "$TAB_JSON" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
```

Start Pi without discovered extensions, skills, or prompt templates so the lane
receives only the review contract supplied by the parent. `agent start` returns
after Herdr detects Pi and considers it ready for input:

```bash
herdr agent start "$AGENT_NAME" --kind pi --pane "$PANE_ID" -- \
  --no-session --no-extensions --no-skills --no-prompt-templates \
  --tools read,grep,find,ls,bash
```

For `go_reviewer`, explicitly add the shared Go skill while leaving general
skill discovery disabled:

```bash
herdr agent start "$AGENT_NAME" --kind pi --pane "$PANE_ID" -- \
  --no-session --no-extensions --no-skills --skill "$GO_SKILL_DIR" \
  --no-prompt-templates --tools read,grep,find,ls,bash
```

Pi has no read-only sandbox; `bash` remains available for Git evidence, so the
prompt's no-modification boundary is important. If the prompt contains all
needed command output, omit `bash` and use `--tools read,grep,find,ls`.

Start Codex in its actual read-only sandbox:

```bash
herdr agent start "$AGENT_NAME" --kind codex --pane "$PANE_ID" -- \
  -C "$REVIEW_CWD" --sandbox read-only
```

Read-only Codex lanes must stick to inspection commands. Do not ask them to
create temporary checkouts, run tests from extracted archives, or otherwise
write to `/tmp`; perform that verification in the main session when it is
needed.

Set `WAIT_MS` to about `300000` for a small review or `600000` for a larger one.
Submit the prompt atomically and wait for the first settled `idle`, `done`, or
`blocked` state, then inspect and read the agent:

```bash
herdr agent prompt "$AGENT_NAME" "$(cat "$PROMPT_FILE")" \
  --wait --timeout "$WAIT_MS"
herdr agent get "$AGENT_NAME"
herdr agent read "$AGENT_NAME" --source recent-unwrapped --lines 500
```

If the prompt wait times out, stalls, or settles as `blocked`, inspect the agent
with `agent get` and `agent read` before deciding what to do. After a timeout on
a turn that is still working, retry the wait once without resending the prompt:

```bash
herdr agent wait "$AGENT_NAME" --timeout "$LARGER_WAIT_MS"
```

Because the default settled states include both `idle` and `done`, user focus no
longer requires a different completion wait.

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
  concise intent context, or PR metadata.
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
- Do not turn hypothetical unsupported behavior, a context-note detail, or a
  residual risk into a requirement without grounding it in the intended change.
- The main session owns synthesis and implementation. Verify material sidecar
  findings against both the code and the conversation before reporting or
  acting on them.

## Synthesis

Report findings first, ordered by severity. Include:

- blocking findings
- important non-blocking findings
- disagreements or ambiguities across lenses
- residual risks, unavailable material lenses, or test gaps
- findings rejected because they conflict with accepted scope, when that context
  is important

If there are no meaningful findings, say so clearly and name remaining
uncertainty. Keep scope and lens details brief unless they explain review
confidence.

## Stop Condition

Stop after reporting the review. Do not automatically fix the implementation,
update specs, or post GitHub comments. Continue only when the user asks to act
on the findings, or use `review-pr` for GitHub comments.
