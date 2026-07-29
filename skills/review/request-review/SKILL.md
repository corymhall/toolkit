---
name: request-review
description: Run a focused independent review of a diff, branch, file set, or pull request using one general reviewer by default and only the additional test, Go, error-handling, contract-alignment, or domain lenses that answer distinct unresolved questions.
disable-model-invocation: true
---

# Request Review

Run a technical code review across a target diff, branch, file list, or PR using targeted reviewer lenses.

> ℹ️ **Scope Rule:** Use `request-review` for local technical analysis. Use `review-pr` when the user wants GitHub review comments drafted or posted.

---

## Reviewer Lens Selection

Always start with **one `general_reviewer`**. Add secondary lenses only when they answer a distinct unresolved question:

| Lens Name | Target Questions / Scope | Requirements |
| :--- | :--- | :--- |
| **`general_reviewer`** | Core logic, correctness, edge cases, error handling, security | Default for all reviews |
| **`go_reviewer`** | Go concurrency, channels, interfaces, error wrapping, memory | Add only for non-trivial Go changes |
| **`contract_alignment`** | Protocol, API schema, or policy contract compliance | Add only when an authoritative contract document exists |

---

## Herdr Sidecar Launch Reference (`HERDR_ENV=1`)

When Herdr is active, launch independent review lanes in separate tabs:

```bash
# 1. Create tab for review lane
TAB_JSON=$(herdr tab create --workspace "$WORKSPACE_ID" --cwd "$CWD" --label "agent-general-review" --no-focus)
PANE_ID=$(printf '%s' "$TAB_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

# 2. Start Pi read-only review agent
herdr agent start "review-general" --kind pi --pane "$PANE_ID" -- \
  --no-session --no-extensions --no-skills --no-prompt-templates \
  --tools read,grep,find,ls,bash

# 3. Prompt agent and wait (300000ms for small, 600000ms for large)
herdr agent prompt "review-general" "$(cat "$PROMPT_FILE")" --wait --timeout 300000
herdr agent read "review-general" --source recent-unwrapped --lines 500
```

*Fallback:* If Herdr is unavailable, run selected lenses sequentially in the main session.

---

## Review & Synthesis Rules

1. **Read-Only Inspection:** Never rebase, merge, cherry-pick, or edit code during review setup.
2. **Ref Verification:** For PRs, verify exact commit SHAs via `git rev-parse --verify` before diffing.
3. **Severity Ordering:** Report findings ordered strictly by severity:
   - **Blocking Findings** (Bugs, security risks, data loss, severe regressions)
   - **Non-Blocking Suggestions**
   - **Lens Disagreements & Ambiguities**
   - **Residual Risks & Test Gaps**
4. **Stop Condition:** Stop after presenting the synthesis report. Do **not** automatically edit code, update specs, or post GitHub comments.
