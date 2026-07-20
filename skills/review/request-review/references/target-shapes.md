# Target Shapes

`request-review` accepts several target shapes. Prefer the smallest scope that
matches the user's actual question.

## Current diff

Use when the user says:

- "review this"
- "look over my current changes"
- "sanity-check this before I commit"

Default interpretation:

- review the current git diff in the working tree

## Branch or ref range

Use when the user says:

- "review this branch"
- "review everything since `main`"
- "compare `feature/x` against `origin/main`"

Preferred evidence:

- `git diff <base>...<head>`
- changed file list

## File or directory set

Use when the user names:

- one file
- a small set of files
- a directory or package

Keep the review bounded to the named scope unless nearby context is needed to
verify a concrete finding.

## Context or decision note plus implementation

A user may name an issue, decision note, design discussion, task, or plan as
context for a code review. The main session should extract a concise statement
of the intended observable behavior, constraints, and accepted limitations for
the sidecar prompt.

Treat these documents as context by default. Add a `contract_alignment_reviewer`
only when the user explicitly designates a named document as authoritative or
when it defines an external protocol, compatibility, security, or policy
contract. The main session must identify the authoritative portions and retain
ownership of conversational intent.

## PR for local analysis

Use when the user wants technical review of a PR but not comment drafting yet.

Examples:

- "review PR 123 locally"
- "look at this PR before we post comments"

Preferred evidence:

- `gh pr view <number> --json title,body,author,baseRefName,headRefName,headRefOid,files,reviewDecision`
- `gh pr diff <number>` for the raw patch when that is enough
- verified local refs only after confirming or fetching the PR base/head

PR hygiene:

- Do not assume the base branch is `master` or `main`; use `baseRefName`.
- Do not assume a local `origin/pr-<number>` ref already exists; fetch or avoid
  local ref math.
- If `gh pr view --json` lacks a field you need, use `gh api` for the specific
  PR endpoint instead of inventing field names.

Use `review-pr` instead if the real task is:

- drafting review comments
- posting review comments
- approving or requesting changes on GitHub
