---
name: worktrunk-stack-prs
description: Manage stacked GitHub pull requests that use one Worktrunk worktree per branch. Use when the current stack already uses Worktrunk worktrees, or when the user asks to create, edit, restack, submit, or repair a PR stack with Worktrunk.
disable-model-invocation: true
---

# Worktrunk Stack PRs

Use this skill as a map of the tools available for a worktree-based PR stack. Derive the exact procedure from the current repository, worktree, branch, and GitHub state.

## Tool Ownership

- Worktrunk (`wt`) creates, finds, switches, and removes worktrees.
- git-spice records local branch ancestry and rebases branches onto their recorded parents.
- `gh stack link` creates or updates a native GitHub stack without local `gh stack` state.
- The `create-pr` skill provides guidance for reviewer-facing PR titles and descriptions.

Avoid local `gh stack init`, `add`, `checkout`, `rebase`, and `sync` when stack branches are checked out in separate worktrees. These commands can use local stack state or try to check out a branch that another worktree owns.

## Stack Model

A stack is a linear dependency chain:

```text
(main) <- foundation <- component <- integration
```

A child includes its parent's commits. Each branch normally represents the concern that reviewers should see in that PR.

`references/stack-design.md` contains guidance for choosing layers and assigning changes to them.

## Inspect Available State

Worktrunk can report worktree paths and state as JSON:

```bash
wt list --format=json
```

Worktrunk supports two JSON schema versions. Inspect the returned shape rather than assuming a fixed path to its items.

git-spice can show recorded ancestry as text or JSON:

```bash
git-spice log short -a --no-prompt
git-spice log short -a --json --no-prompt
```

Git can confirm the branch and local changes in a specific worktree:

```bash
git -C <worktree-path> branch --show-current
git -C <worktree-path> status --short --branch
```

Resolve worktree paths from Worktrunk output. Do not assume a directory layout.

## Worktree Capabilities

To create a branch and worktree from a parent branch:

```bash
wt switch --create --base <parent> --no-cd --format=json <branch>
```

To create a worktree for an existing branch:

```bash
wt switch --no-cd --format=json <branch>
```

Worktrunk hooks can initialize or modify the new worktree. Keep hooks enabled unless the user asks to bypass them or a diagnosed hook failure makes that necessary.

See `references/worktrunk-operations.md` for path, state, and cleanup details.

## Ancestry Capabilities

To initialize git-spice with explicit repository settings:

```bash
git-spice repo init --trunk <trunk> --remote <remote> --no-prompt
```

To record the current branch's direct parent:

```bash
git-spice branch track --base <parent> --no-prompt
```

Run branch-local git-spice commands from the worktree that owns the branch. For example:

```bash
(cd <branch-path> && git-spice branch track --base <parent> --no-prompt)
```

To rebase the current branch onto its recorded parent:

```bash
(cd <branch-path> && git-spice branch restack --no-prompt)
```

When several descendants need a new parent tip, direct-child-first ordering prevents a branch from being replayed onto a stale parent. Do not restack branches concurrently. Do not restack a worktree with uncommitted changes or an active Git operation.

Conflict and repair options are in `references/recovery.md`.

## GitHub Capabilities

To push branches, create or find their PRs, set their bases, and link them as a native GitHub stack:

```bash
gh stack link --remote <remote> <bottom> <middle> <top>
```

Arguments are in bottom-to-top order. `link` is additive: it does not remove old PRs from a stack. The `create-pr` skill can help replace generated PR text with a description of each layer.

To inspect the branch-to-PR mapping:

```bash
for branch in <bottom> <middle> <top>; do
  gh pr list --head "$branch" --json number,headRefName,baseRefName,title,url --jq '.[0]'
done
```
