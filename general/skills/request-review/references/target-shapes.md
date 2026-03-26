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

Preferred interpretation:

- keep the review bounded to the named scope unless the reviewer needs nearby
  context

## Spec plus implementation scope

Use when the user says:

- "does this match the spec?"
- "review implementation against `spec.md`"
- "check whether phase 2 is actually complete"

Preferred evidence:

- explicit spec/plan/task document
- implementation file set, branch, or diff

This is the main trigger for `spec_alignment_reviewer`.

## PR for local analysis

Use when the user wants technical review of a PR but not comment drafting yet.

Examples:

- "review PR 123 locally"
- "look at this PR before we post comments"

Use `review-pr` instead if the real task is:

- drafting review comments
- posting review comments
- approving or requesting changes on GitHub
