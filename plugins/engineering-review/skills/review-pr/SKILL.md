---
name: review-pr
description: "Review a GitHub PR by loading PR context, running or reusing the core request-review findings, drafting comments for approval, and posting only after explicit go-ahead."
---

# Review PR

Use this skill for GitHub PR review IO.

`review-pr` does not define the technical review lens. Use `request-review` for
the actual review, then turn approved findings into GitHub review comments.
Nothing posts without explicit approval.

## When To Use

- review a GitHub PR
- draft inline PR comments for human approval
- approve, comment, or request changes after the user approves the review
- turn existing review findings into GitHub review comments

Use `request-review` directly when the user only wants local technical analysis
and no draft GitHub comments.

## Load PR Context

Accept PR input as:

- PR URL
- PR number in the current repo
- "the open PR" when there is only one obvious candidate

Use `gh` for GitHub work:

```bash
gh pr view <number> --json title,body,author,baseRefName,headRefName,headRefOid,files,additions,deletions,commits,reviewDecision
gh pr diff <number>
gh pr checks <number>
```

Summarize the PR briefly:

- title, author, base/head refs
- changed file count and diff size
- CI state
- short PR-description summary

Keep setup read-only. Do not rebase, merge, reset, cherry-pick, or otherwise
rewrite local history unless the user explicitly asks for branch surgery.

## Review Source

Use the core review flow for technical findings.

- If the user already provided findings, use those.
- Otherwise invoke or follow `request-review` against the PR diff and relevant
  local context.
- Include the `repo_instructions_reviewer` lane when applicable instructions
  exist.

Do not duplicate the generic review rubric here. `request-review` owns reviewer
lens selection and findings synthesis.

## Draft Comments

Convert only actionable findings into draft GitHub comments.

For each draft, include:

- category: blocking, suggestion, question, or nit
- file, line, and side for the inline review comment
- comment text written as it should appear on GitHub
- source finding or rationale when that helps approval

Prefer inline review comments for specific findings. The overall review body
should be brief and high-level; do not list all specific comments in the body.
Use body-only comments only for feedback that cannot be anchored to a changed
line.

Use `gh pr diff` to confirm that each inline comment can be anchored to a
changed line:

- use `side: "RIGHT"` for added or changed lines in the PR
- use `side: "LEFT"` for deleted or base-side lines
- include `start_line` and `start_side` only for multi-line comments

Prefer fewer high-quality comments. Skip praise, non-issues, and correctness
narration unless they belong in a short overall review body.

Use blocking only for genuine bugs, security issues, data loss risks, serious
regressions, or significant maintainability hazards.

## Approval Display

Show the draft review before posting:

```markdown
## Draft Review: PR #<number>

Overall assessment: <APPROVE / COMMENT / REQUEST CHANGES>

Review body: <brief high-level summary>

### Blocking
- `<file>:<line>`: <draft comment>

### Suggestions
- `<file>:<line>`: <draft comment>

### Questions
- `<file>:<line>`: <draft comment>

### Nits
- `<file>:<line>`: <draft comment>

### Body-only Comments
- <draft comment that cannot be anchored to a changed line>
```

Ask for approval with clear options:

- post all as-is
- edit first
- post without nits
- do not post

## Post Review

Post only after explicit approval.

### Overall-only review

Use `gh pr review` only when there are no inline comments to submit:

```bash
gh pr review <number> --approve --body "<summary>"
gh pr review <number> --comment --body "<summary>"
gh pr review <number> --request-changes --body "<summary>"
```

### Inline review comments

Use the GitHub review API for inline comments so all approved comments are
batched into a single review. Specific findings should be posted as inline
review comments on the relevant changed lines; the review body should stay
brief.

Create a review payload:

```bash
PR=<number>
HEAD_SHA="$(gh pr view "$PR" --json headRefOid --jq .headRefOid)"

jq -n \
  --arg commit_id "$HEAD_SHA" \
  --arg body "Thanks. I left a couple of inline comments." \
  '{
    commit_id: $commit_id,
    event: "REQUEST_CHANGES",
    body: $body,
    comments: [
      {
        path: "pkg/example.go",
        line: 42,
        side: "RIGHT",
        body: "This can return nil here, which would panic below. Can we handle the empty result explicitly?"
      },
      {
        path: "pkg/example_test.go",
        line: 88,
        side: "RIGHT",
        body: "This test only checks that the call succeeds. Can we assert the behavior that regressed?"
      }
    ]
  }' > /tmp/review.json
```

Submit the review:

```bash
gh api \
  -X POST \
  repos/{owner}/{repo}/pulls/$PR/reviews \
  --input /tmp/review.json
```

Use `event: "APPROVE"`, `event: "COMMENT"`, or `event: "REQUEST_CHANGES"` to
match the approved overall assessment. Use `REQUEST_CHANGES` when any blocking
finding is being posted.

## Report

After posting, report:

- decision
- number of comments posted
- category counts
- anything approved but not posted

If nothing was posted, say so plainly.
