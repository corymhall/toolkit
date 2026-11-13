---
name: commit
description:
  Create a well-formed git commit from current changes using session history for
  rationale and summary; use only when the user explicitly asks to create or
  finalize a commit.
---

# Commit

## Goals

- Produce a commit that reflects the actual code changes and the session
  context.
- Follow the repository's commit conventions and common Git formatting.
- Preserve motivation and consequences that the diff does not explain.
- Associate the commit with its issue using the repository's established syntax.

## Inputs

- session history for intent and rationale.
- `git status`, `git diff`, and `git diff --staged` for actual changes.
- Repo-specific commit conventions if documented.

## Steps

1. Read session history to identify scope, intent, and rationale.
2. Inspect the working tree and staged changes (`git status`, `git diff`,
   `git diff --staged`).
3. Stage intended changes, including new files (`git add -A`) after confirming
   scope.
4. Sanity-check newly added files; if anything looks random or likely ignored
   (build artifacts, logs, temp files), flag it to the user before committing.
5. If staging is incomplete or includes unrelated files, fix the index or ask
   for confirmation.
6. Identify the issue associated with the work from reliable context such as the
   user's request, branch name, or linked task. If the issue is unknown, ask the
   user only when the repository is under `~/work`. Outside `~/work`, proceed
   without a reference unless an issue is already known. Never guess an issue.
   If the user confirms there is no issue, proceed without a reference.
7. Inspect recent repository history and documented conventions. Use their
   established issue syntax and relationship keyword. Use a closing keyword
   such as `Fixes #123` or `Closes #123` only when the change resolves the issue;
   otherwise use a non-closing reference such as `Refs #123`.
8. Use a type and optional scope only when the repository uses that style (for
   example, `feat(scope): ...`, `fix(scope): ...`, or `refactor(scope): ...`).
9. Write an imperative subject with no trailing period. Aim for 50 characters
   and do not exceed 72. Capitalize a plain subject; follow repository casing
   when a prefix or other convention applies.
10. Add a body when it preserves useful context or is needed for the issue
    reference. Separate it from the subject with a blank line.
11. In the body, explain the problem, the material change, and why this approach
    was selected. Include important trade-offs, side effects, or validation when
    useful. Do not narrate implementation details that are clear from the diff.
12. Use natural paragraphs by default. Add headings or bullets only when they
    make a complex message easier to scan. Do not require `Summary`,
    `Rationale`, or `Tests` sections.
13. Put the issue reference where repository convention expects it, normally on
    its own final line in the body.
14. Wrap body lines at 72 characters.
15. Create the commit message with a here-doc or temp file and use
    `git commit -F <file>` so newlines are literal (avoid `-m` with `\n`).
16. Commit only when the message matches the staged changes: if the staged diff
    includes unrelated files or the message describes work that is not staged,
    fix the index or revise the message before committing.

## Output

- A single commit created with `git commit` whose message reflects the session.

## Message Shapes

When no issue reference is needed, use a subject alone if it records all useful context:

```
Fix typo in installation guide
```

For a change that needs context, use a short subject and natural paragraphs:

```
<type>(<scope>): <imperative summary>

<Explain the prior problem and the material change. Explain why this approach
was selected when that reason is not clear from the diff.>

<Include an important trade-off, consequence, or validation result when useful.>

<Fixes #123, Closes #123, Refs #123, or the repository's equivalent.>
```

Type and scope are examples only. Follow the repository's established style.
