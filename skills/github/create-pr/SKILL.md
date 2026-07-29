---
name: create-pr
description: Create, draft, or update a GitHub pull request using a direct, technically specific, reviewer-oriented tone. Use when asked to open or create a PR, create a draft PR, draft or revise a PR title or body, or update an existing PR description. For stacked PRs, use git-spice-stack-prs for stack mechanics and this skill for each PR's title and description.
---

# Create PR

Author concise, reviewer-focused PR titles and descriptions, and execute GitHub PR creation/update operations.

> ℹ️ **Authorization Rule:** A request to create, open, draft, or update a PR authorizes the GitHub operation. Use `--body-file` with a temporary file to avoid multiline shell escaping errors.

---

## Quick Reference Command Table

| Operation | Command Sequence | Key Flags / Notes |
| :--- | :--- | :--- |
| **Check Existing PRs** | `gh pr list --head "$BRANCH" --json number,url` | Check if head branch already has an open PR |
| **Create Draft PR** | `gh pr create --draft --title "$TITLE" --body-file /tmp/pr-body.md` | Non-interactive PR creation |
| **Update PR Description** | `gh pr edit <PR> --title "$TITLE" --body-file /tmp/pr-body.md` | Update title and body on existing PR |
| **Verify PR Creation** | `gh pr view <PR> --json number,title,url,isDraft,baseRefName` | Verify final state after creation |

---

## PR Structure & Description Template

Write for a busy reviewer. Lead with the problem, follow with the behavioral change, and list specific validation evidence.

```markdown
## Problem
<Describe current behavior and why it matters/fails. State the root cause if known.>

## Solution
<Describe the direct behavioral or technical change. Highlight consequential tradeoffs, migration steps, or fallbacks.>

## Validation
<List specific test suites or commands executed, e.g. `go test ./pkg/resource/...` - distinguishing tests added from tests run.>

Fixes #<issue-number>
```

---

## Authoring Rules (Anti-Slop Checklist)

- [ ] **Outcome-Oriented Title:** Use a concise title matching repository conventions (e.g. `pkg/resource: fix panic on missing ID`).
- [ ] **Behavioral Focus:** Explain what behavior changes at the system boundary rather than walking the diff file by file.
- [ ] **No Generic Fluff:** Never use meaningless filler phrases (*"improves robustness"*, *"enhances maintainability"*, *"code cleanup"*). State the exact fix.
- [ ] **Proportional Detail:** Match detail to change risk: a mechanical fix needs 3 sentences; a breaking architectural change needs tradeoffs and examples.
- [ ] **Clean Metadata:** Omit empty or optional template boilerplate sections. Use closing issue keywords (`Fixes #123`) only when the relationship is intentional.
- [ ] **Body File Execution:** Always pass the PR body via `--body-file <temp-file>` instead of multiline shell arguments.

---

## Stacked PR Integration

For stacked PR workflows:
- Use `git-spice-stack-prs` to manage branch relationships, restacking, and submission.
- Treat commit-derived `--fill` bodies as temporary, and use this skill to write a deliberate, reviewer-facing body for each PR in the stack.
