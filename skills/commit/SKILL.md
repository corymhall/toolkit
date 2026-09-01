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
6. Inspect recent repository history and documented conventions. Use a type
   and optional scope only when the repository uses that style (for example,
   `feat(scope): ...`, `fix(scope): ...`, or `refactor(scope): ...`).
7. Write an imperative subject with no trailing period. Aim for 50 characters
   and do not exceed 72. Capitalize a plain subject; follow repository casing
   when a prefix or other convention applies.
8. Add a body only when it preserves useful context that the subject and diff
   do not make clear. Separate it from the subject with a blank line.
9. In the body, explain the problem, the material change, and why this approach
   was selected. Include important trade-offs, side effects, or validation when
   useful. Do not narrate implementation details that are clear from the diff.
10. Use natural paragraphs by default. Add headings or bullets only when they
    make a complex message easier to scan. Do not require `Summary`,
    `Rationale`, or `Tests` sections.
11. Wrap body lines at 72 characters.
12. Create the commit message with a here-doc or temp file and use
    `git commit -F <file>` so newlines are literal (avoid `-m` with `\n`).
13. Commit only when the message matches the staged changes: if the staged diff
    includes unrelated files or the message describes work that is not staged,
    fix the index or revise the message before committing.

## Output

- A single commit created with `git commit` whose message reflects the session.

## Message Shapes

Use a subject alone when it records all useful context:

```
Fix typo in installation guide
```

For a change that needs context, use a short subject and natural paragraphs:

```
<type>(<scope>): <imperative summary>

<Explain the prior problem and the material change. Explain why this approach
was selected when that reason is not clear from the diff.>

<Include an important trade-off, consequence, issue reference, or validation
result when useful.>
```

Type and scope are examples only. Follow the repository's established style.
