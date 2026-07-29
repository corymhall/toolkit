---
name: git-spice-stack-prs
description: Manage stacked GitHub pull requests with git-spice from branch creation through submit, restack, and update cycles. Use when work should be split into reviewable stacked branches, when a stack must be submitted or repaired, when branch base relationships must be changed, or when a branch-to-PR map needs to be maintained.
---

# Git-Spice Stack PRs

Manage stacked-branch workflows with `git-spice` and keep GitHub PRs synchronized with local branch history.

---

## Quick Reference Command Table

| Action | Command Sequence | Key Flags / Notes |
| :--- | :--- | :--- |
| **Verify Stack State** | `git-spice log short -a --no-prompt` | Inspect local stack graph |
| **Init Repository** | `git-spice repo init --trunk "$TRUNK" --remote origin --no-prompt` | Non-interactive initialization |
| **Track New Branch** | `git-spice branch track --base <base> --no-prompt` | Tracks current branch against base |
| **Create & Track Branch** | `git-spice branch create <name> -m "<msg>" --target <base> --no-prompt` | Stage files first; tracks immediately |
| **Submit Stack PRs** | `git-spice stack submit --fill --draft --no-web` | Non-web, draft stack submission |
| **Update Existing PRs** | `git-spice stack submit --update-only --no-web --no-prompt` | Updates existing PRs only |
| **Restack Upstack** | `git-spice upstack restack --no-prompt` | Rebases branches onto updated base |
| **Sync After Merges** | `git-spice repo sync --restack --no-prompt` | Syncs & rewires after lower PR merges |

---

## Core Concepts

- **`trunk`**: Default branch (`main` or `master`).
- **`base`**: Parent branch in the stack.
- **`upstack` / `downstack`**: Branches above (dependent) or below (toward trunk) the current branch.
- **`restack`**: Rebase a branch onto its updated base.

---

## Workflow Guide

### 1. Preconditions & Setup
Verify repository health before running stack operations:

```bash
git status --short --branch
git-spice --version
git-spice log short -a --no-prompt || true
TRUNK="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
TRUNK="${TRUNK:-main}"
```

If repo is not initialized, run:
```bash
git-spice repo init --trunk "$TRUNK" --remote origin --no-prompt
```

### 2. Creating & Tracking Stack Branches
- **Unstaged Changes:**
  ```bash
  git checkout -b <branch-name>
  git-spice branch track --base <base-branch> --no-prompt
  ```
- **Staged Changes:**
  ```bash
  git add <files>
  git-spice branch create <branch-name> --message "<commit msg>" --target <base-branch> --no-prompt
  ```

*Navigation helpers:* `git-spice up`, `git-spice down`, `git-spice top`, `git-spice bottom`.

### 3. Reordering & Restacking Foundations
To insert foundational work lower in the stack:
1. Create new foundation branch at target base.
2. Commit foundation files.
3. Rebase downstream work using `git-spice branch onto <target> --no-prompt` or `git rebase --onto`.
4. Re-track base: `git-spice branch track --base <base> --no-prompt`.

### 4. Submitting & Updating GitHub PRs
- **Initial Submission:**
  ```bash
  git-spice stack submit --fill --draft --no-web
  ```
- **Updating Existing PRs:**
  ```bash
  git add <files>
  git-spice commit amend --no-edit --no-prompt
  git-spice stack submit --update-only --no-web --no-prompt
  ```
- **Syncing After Lower PR Merges (Multi-Worktree):**
  ```bash
  (cd .worktrees/<merged-branch> && git-spice repo sync --restack --no-prompt)
  (cd .worktrees/<next-open-branch> && git-spice branch restack --no-prompt)
  (cd .worktrees/<tip-branch> && git-spice stack submit --update-only --no-web --no-prompt)
  ```

---

## Recovery & Troubleshooting Matrix

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Rebase Conflicts** | Upstack changes conflict with base. | Resolve files $\rightarrow$ `git add <files>` $\rightarrow$ `git-spice rebase continue` (or `git-spice rebase abort`). |
| **`DIRTY` Status on PR** | Merged commits remain in branch ancestry. | Rebase explicitly: `git rebase --onto "origin/$TRUNK" <old-base-tip> <branch>` $\rightarrow$ `git-spice branch track --base "$TRUNK" --no-prompt`. |
| **Deleted Base Branch** | Lower PR was merged and deleted. | Re-track to trunk: `git-spice branch track --base "$TRUNK" --no-prompt` $\rightarrow$ `git-spice stack submit --update-only --no-web --no-prompt`. |
| **Behavior Drift Check** | Verify zero content drift after restack. | Compare patch IDs: `git show <tip> --pretty=format: \| git patch-id --stable`. |

---

## Quality Checklist

Before marking stack tasks complete:
- [ ] `git-spice log short -a --no-prompt` shows expected linear order.
- [ ] Test suite passes on tip branch (`go test ./...` or project equivalent).
- [ ] All PRs exist, are linked to intended bases, and titles/descriptions explain the branch's specific scope.
