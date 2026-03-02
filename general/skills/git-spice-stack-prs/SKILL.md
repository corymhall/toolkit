---
name: git-spice-stack-prs
description: Manage stacked GitHub pull requests with git-spice from branch creation through submit, restack, and update cycles. Use when work should be split into reviewable stacked branches, when a stack must be submitted or repaired, when branch base relationships must be changed, or when a branch-to-PR map needs to be captured and maintained.
---

# Git-Spice Stack PRs

## Overview
Use this skill to run stacked-branch workflows with `git-spice` and keep GitHub PRs synchronized with local branch history.

Use deterministic command sequences, keep one conceptual change per branch, and verify stack health after every restack.

## Quick Start
1. Confirm tool and repo state.
2. Initialize tracking when needed.
3. Build or repair the stack graph.
4. Submit stack PRs as draft or update-only.
5. Verify branch-to-PR mapping and update PR descriptions via `gh`.

## Workflow

### 1) Verify Preconditions
Run:
```bash
git status --short --branch
git-spice --version
git-spice log short -a --no-prompt || true
```

Decide:
- If `git-spice` reports repository not initialized, run repo init.
- If worktree is dirty, stop and decide whether to commit/stash before restacking.

### 2) Initialize git-spice (if needed)
Run with explicit trunk and remote:
```bash
git-spice repo init --trunk master --remote origin --no-prompt
```

Use `main` instead of `master` when applicable.

### 3) Create or Track Stack Branches
For new stacked work:
```bash
git checkout -b <branch-name>
git-spice branch track --base <base-branch> --no-prompt
```

For existing branch chains, track each branch explicitly with the correct base.

### 4) Insert or Reorder Foundations
Use this when review improves by moving foundational work earlier.

Typical sequence:
1. Create new foundation branch at the target base.
2. Commit only foundation files.
3. Rebase downstream branches onto the new foundation with `git rebase --onto`.
4. Re-run `git-spice branch track --base ...` for each branch so stack metadata matches git history.

After reordering:
```bash
git-spice log short -a --no-prompt
```

### 5) Submit Stack to GitHub
Create draft PRs for whole stack:
```bash
git-spice stack submit --fill --draft --no-web
```

Update already-created PRs only:
```bash
git-spice stack submit --update-only --no-web
```

### 6) Maintain Stack After Changes
After editing a mid-stack branch:
```bash
git-spice upstack restack
git-spice stack submit --update-only --no-web
```

After lower PR merge (single-worktree):
```bash
git-spice repo sync
git-spice branch restack
git-spice stack submit --update-only --no-web
```

After lower PR merge (multi-worktree, recommended):
1. Run sync in the merged branch's own worktree first so git-spice can delete/rewire it.
2. Restack from the next open branch's worktree.
3. Restack downstream worktrees in order.
4. Submit stack updates.

Example:
```bash
(cd .worktrees/<merged-branch> && git-spice repo sync --no-prompt)
(cd .worktrees/<next-open-branch> && git-spice branch restack --no-prompt)
(cd .worktrees/<downstream-1> && git-spice branch restack --no-prompt)
(cd .worktrees/<downstream-2> && git-spice branch restack --no-prompt)
(cd .worktrees/<tip-branch> && git-spice stack submit --update-only --no-web --no-prompt)
```

If a PR still shows `DIRTY` after restack:
```bash
gh pr view <num> --json mergeStateStatus,baseRefName,headRefName,url
git log --oneline origin/master..HEAD
```

If ancestry still includes merged commits, do explicit rebase:
```bash
git rebase --onto origin/master <old-base-tip> <branch>
git-spice branch track --base master --no-prompt
git-spice branch restack --no-prompt
```

If submit fails because base branch was deleted after merge, re-track base then re-submit:
```bash
git-spice branch track --base master --no-prompt
git-spice stack submit --update-only --no-web --no-prompt
```

### 6.1) Verify No Behavior Drift After Rebase
Use this when the goal is "restack only, no behavior changes".

Check patch equivalence:
```bash
git show <old-tip> --pretty=format: | git patch-id --stable
git show <new-tip> --pretty=format: | git patch-id --stable
git diff --name-status <old-tip>..<new-tip>
```

Interpretation:
- Same patch-id + empty diff means no content drift.
- If commits were dropped as "already upstream", verify only those dropped commits were merged earlier.

Then run project verification:
```bash
go test ./...
gh pr checks <num>
```

### 7) Keep PR Descriptions Clean
Use `gh` for all GitHub edits.

Examples:
```bash
gh pr list --head <branch> --json number,title,url
gh pr edit <number> --title "<title>" --body "$(cat <<'PR_BODY_EOF'
## Summary
- ...

## Testing
- ...
PR_BODY_EOF
)"
```

Do not rely on stack-navigation comments for core rationale; put rationale in PR body sections.

## Branch-to-PR Mapping Procedure
Record mapping in a task tracker whenever a new stack is submitted.

Recommended commands:
```bash
for b in <branch-1> <branch-2> <branch-3>; do
  gh pr list --head "$b" --json number,headRefName,baseRefName,title,url --jq '.[0]';
done
```

Store:
- Branch name
- PR number and URL
- Base branch
- Purpose summary

## Quality Gates
Before claiming stack-ready:
1. `git-spice log short -a --no-prompt` shows expected linear order.
2. `go test ./...` (or project-equivalent full suite) passes on stack tip.
3. All PRs exist and point to intended base branches.
4. PR bodies include concise `Summary` and `Testing` sections.

## References
- Command cookbook: `references/commands.md`
