---
name: review-pr
description: Review a GitHub PR by loading PR context, running or reusing the core request-review findings, drafting comments for approval, and posting only after explicit go-ahead.
disable-model-invocation: true
---

# Review PR

Manage GitHub PR review workflows, draft inline comments, and post batched reviews after explicit user approval.

> ⚠️ **Golden Rule:** **Nothing posts to GitHub without explicit user approval.** `review-pr` manages IO and GitHub payloads; technical analysis is delegated to `request-review`.

---

## Quick Reference Command Table

| Action | Command | Key Flags / Notes |
| :--- | :--- | :--- |
| **Inspect PR Context** | `gh pr view <PR> --json title,body,author,baseRefName,headRefName,headRefOid,files,additions,deletions` | Read-only context inspect |
| **View PR Diff** | `gh pr diff <PR>` | Use `git diff` if path filtering is required |
| **Inspect CI Status** | `gh pr checks <PR>` | Check CI build/test status |
| **Submit Top-Level Only** | `gh pr review <PR> --approve --body "<summary>"` | Use when no inline comments exist (`--comment` / `--request-changes`) |
| **Batch Inline Review** | `gh api -X POST repos/{owner}/{repo}/pulls/<PR>/reviews --input /tmp/review.json` | Batches all inline comments into one review |

---

## Review Workflow

### 1. Load PR Context
- Inspect base/head refs, author, file counts, and CI status via `gh pr view` and `gh pr checks`.
- Keep setup read-only. Do not rebase, reset, or rewrite local branches unless explicitly instructed.

### 2. Technical Analysis
- Delegate technical analysis to `request-review` or use user-provided findings.
- Convert actionable findings into 4 categories: **Blocking** (bugs/security/data loss), **Suggestions**, **Questions**, or **Nits**.

### 3. Draft Review Display (For User Approval)
Present the drafted review in chat for user confirmation:

```markdown
## Draft Review: PR #<number>

Overall assessment: <APPROVE / COMMENT / REQUEST CHANGES>

Review body: <brief high-level summary>

### Blocking
- `<file>:<line>`: <draft comment>

### Suggestions
- `<file>:<line>`: <draft comment>
```

Options for user:
1. Post all as-is
2. Edit comments first
3. Post without nits
4. Do not post

### 4. Batched Post (API Execution)

When inline comments are approved, batch them into a single GitHub API call:

```bash
PR=<number>
HEAD_SHA="$(gh pr view "$PR" --json headRefOid --jq .headRefOid)"

jq -n \
  --arg commit_id "$HEAD_SHA" \
  --arg body "I left inline comments for review." \
  '{
    commit_id: $commit_id,
    event: "REQUEST_CHANGES",
    body: $body,
    comments: [
      {
        path: "pkg/example.go",
        line: 42,
        side: "RIGHT",
        body: "This can return nil here, which will panic below. Handle the empty case explicitly."
      }
    ]
  }' > /tmp/review.json

gh api -X POST repos/{owner}/{repo}/pulls/$PR/reviews --input /tmp/review.json
```

---

## Quality Rules

- [ ] Use `side: "RIGHT"` for added/modified lines; `side: "LEFT"` for deleted lines.
- [ ] Use `event: "REQUEST_CHANGES"` whenever any Blocking finding is present.
- [ ] Report final decision, comment counts, and category breakdown after posting.
