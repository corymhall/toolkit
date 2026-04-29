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
3. Build or repair the stack graph with one conceptual change per branch.
4. Submit stack PRs as draft or update-only.
5. Verify branch-to-PR mapping and update PR descriptions via `gh`.

## Core Concepts
- `trunk`: the default branch, usually `main` or `master`; it has no base.
- `base`: a branch's parent in the stack.
- `upstack`: branches above the current branch.
- `downstack`: branches below the current branch, toward trunk.
- `restack`: rebase a branch onto its current base.

## Workflow

### 1) Verify Preconditions
Run:
```bash
git status --short --branch
git-spice --version
git-spice log short -a --no-prompt || true
TRUNK="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
TRUNK="${TRUNK:-main}"
echo "Using trunk: $TRUNK"
```

Decide:
- If `git-spice` reports repository not initialized, run repo init.
- If worktree is dirty, stop and decide whether to commit/stash before restacking.

### 2) Initialize git-spice (if needed)
Run with explicit trunk and remote:
```bash
git-spice repo init --trunk "$TRUNK" --remote origin --no-prompt
```

If your organization uses a non-default trunk, set `TRUNK` explicitly before init.

### 3) Create or Track Stack Branches
For new stacked work with no staged changes:
```bash
git checkout -b <branch-name>
git-spice branch track --base <base-branch> --no-prompt
```

For new stacked work with staged changes, prefer git-spice branch creation so the branch is tracked immediately:
```bash
git add <files>
git-spice branch create <branch-name> --message "<commit message>" --target <base-branch> --no-prompt
```

Use `--insert` to put a new branch between the target and its upstack. Use `--below` to place it below the target. Keep branch creation non-interactive for agent runs.

For existing branch chains, track each branch explicitly with the correct base.

Useful navigation while inspecting a stack:
```bash
git-spice up
git-spice down
git-spice top
git-spice bottom
git-spice branch checkout
```

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

For routine branch moves, prefer git-spice commands before manual git surgery:
```bash
git-spice branch onto <target> --no-prompt
git-spice upstack onto <target> --no-prompt
git-spice branch split --at=<commit>:<new-branch> --no-prompt
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
After editing a mid-stack branch, amend or create the intended commit, then restack and submit:
```bash
git add <files>
git-spice commit amend --no-edit --no-prompt
git-spice stack submit --update-only --no-web --no-prompt
```

If the change should be a new commit rather than an amend:
```bash
git add <files>
git-spice commit create --message "<commit message>" --no-prompt
git-spice upstack restack --no-prompt
git-spice stack submit --update-only --no-web --no-prompt
```

After lower PR merge (single-worktree):
```bash
git-spice repo sync --restack --no-prompt
git-spice stack submit --update-only --no-web --no-prompt
```

After lower PR merge (multi-worktree, recommended):
1. Run sync in the merged branch's own worktree first so git-spice can delete/rewire it.
2. Restack from the next open branch's worktree.
3. Restack downstream worktrees in order.
4. Submit stack updates.

Example:
```bash
(cd .worktrees/<merged-branch> && git-spice repo sync --restack --no-prompt)
(cd .worktrees/<next-open-branch> && git-spice branch restack --no-prompt)
(cd .worktrees/<downstream-1> && git-spice branch restack --no-prompt)
(cd .worktrees/<downstream-2> && git-spice branch restack --no-prompt)
(cd .worktrees/<tip-branch> && git-spice stack submit --update-only --no-web --no-prompt)
```

If restack hits conflicts:
```bash
git add <resolved-files>
git-spice rebase continue
```

To abandon the restack:
```bash
git-spice rebase abort
```

If a PR still shows `DIRTY` after restack:
```bash
gh pr view <num> --json mergeStateStatus,baseRefName,headRefName,url
git log --oneline "origin/$TRUNK"..HEAD
```

If ancestry still includes merged commits, do explicit rebase:
```bash
git rebase --onto "origin/$TRUNK" <old-base-tip> <branch>
git-spice branch track --base "$TRUNK" --no-prompt
git-spice branch restack --no-prompt
```

If submit fails because base branch was deleted after merge, re-track base then re-submit:
```bash
git-spice branch track --base "$TRUNK" --no-prompt
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
<project-test-command>
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
2. Project-equivalent full-suite command passes on stack tip (for example `go test ./...`).
3. All PRs exist and point to intended base branches.
4. PR bodies include concise `Summary` and `Testing` sections.

## References
- Command cookbook: `references/commands.md`
