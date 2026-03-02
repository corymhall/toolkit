---
name: review-pr
description: "Review a teammate's PR and produce draft comments for your approval before posting. Use when asked to review a PR, look at a PR, or give feedback on someone's code."
---

# Review PR

Review a pull request and produce draft comments for human approval before
posting anything to GitHub. Nothing gets posted without your explicit go-ahead.

## When to Use

- Teammate asks you to review their PR
- You want AI-assisted review of an external PR
- You want to review a PR before approving/merging
- Any PR review where you want draft comments, not auto-posted feedback

## The Process

### 1. Load the PR

Accept PR input as:
- A PR URL (`https://github.com/org/repo/pulls/123`)
- A PR number (assumes current repo: `gh pr view 123`)
- "Review the open PR" (find it: `gh pr list`)

Fetch PR details:

```bash
gh pr view <number> --json title,body,author,baseRefName,headRefName,files,additions,deletions,commits
gh pr diff <number>
gh pr checks <number>
```

Present a summary:

```
## PR #<number>: <title>

Author: <author>
Base: <base> ← <head>
Files changed: <count> (+<additions>/-<deletions>)
CI: <passing/failing/pending>

<PR description summary>
```

### 2. Review the Code

Review the diff systematically. For each changed file, assess:

**Correctness**
- Logic errors, edge cases, null/nil handling
- Race conditions, off-by-one errors
- Does the code do what the PR description claims?

**Security**
- Input validation, injection risks, auth checks
- Exposed secrets, unsafe operations
- OWASP top 10 concerns

**Design**
- Does it fit the existing codebase patterns?
- Is complexity justified?
- Are abstractions appropriate (not over/under-engineered)?

**Error Handling**
- Swallowed errors, missing checks
- Unclear error messages
- Recovery paths

**Testing**
- Are changes tested? Are tests meaningful?
- Edge cases covered?
- Do tests actually verify behavior (not just coverage)?

**Style & Conventions**
- Consistent with existing codebase?
- Naming, formatting, organization
- Documentation for non-obvious logic

### 3. Produce Draft Comments

For each finding, draft a comment. Categorize:

- **Blocking** — must fix before merge
- **Suggestion** — should consider but not blocking
- **Question** — need clarification, not a judgment
- **Nit** — minor style/preference, definitely not blocking

For each draft comment, include:
- File and line reference
- The comment text (written as if you're posting it)
- Category (blocking/suggestion/question/nit)

### 4. Present Drafts for Approval

Show all draft comments grouped by category:

```
## Draft Review: PR #<number>

### Overall Assessment: <APPROVE / REQUEST CHANGES / COMMENT>

### Blocking (<count>)

**<file>:<line>**
> <the code being commented on>

Draft comment: "<your comment>"

---

### Suggestions (<count>)

**<file>:<line>**
> <the code>

Draft comment: "<your comment>"

---

### Questions (<count>)
...

### Nits (<count>)
...
```

Then ask:

- `Post all as-is (Recommended)`: Submit the review with all comments
- `Edit first`: Let me modify comments before posting
- `Post without nits`: Submit blocking + suggestions + questions, skip nits
- `Don't post`: Just show me the review, I'll handle it manually

### 5. Post Review (if approved)

Based on the overall assessment:

```bash
# If APPROVE (no blocking issues):
gh pr review <number> --approve --body "<summary>"

# If REQUEST CHANGES (blocking issues exist):
gh pr review <number> --request-changes --body "<summary>"

# If COMMENT (questions only, no judgment):
gh pr review <number> --comment --body "<summary>"
```

For inline comments, post each as a review comment on the specific file/line.
Use the GitHub review API to batch them into a single review submission.

### 6. Report

```
## Review Posted: PR #<number>

Decision: <APPROVE / REQUEST CHANGES / COMMENT>
Comments posted: <count>
  - Blocking: <count>
  - Suggestions: <count>
  - Questions: <count>
  - Nits: <count>
```

## Key Principles

- **Nothing posts without approval** — always show drafts first
- **Write comments as yourself** — the tone should sound like you, not an AI
- **Be specific** — file:line references, quote the code, explain why
- **Blocking means blocking** — only use for genuine issues that would cause bugs, security problems, or significant maintenance burden
- **Don't be noisy** — fewer high-quality comments beat many nitpicks
- **Questions are valuable** — "why did you choose X over Y?" is a great review comment
- **Acknowledge what's good** — if the PR has strengths, say so in the summary
