---
name: gastown-upstream-sync
description: Sync a gastown fork with upstream main, preserve PR-branch source of truth, rebuild the local gt binary, and refresh the rig with the local post-push conventions.
---

# Gastown Upstream Sync

Use this skill to sync a gastown fork with `steveyegge/gastown`, carry any
unmerged PR work forward safely, and finish the local post-push maintenance.

## When To Use

- Upstream `main` has new commits to pull into the fork.
- Cherry-picks on `main` may now be merged upstream and should be dropped.
- You want the standard local follow-through after the push.

## Local Conventions

- Keep **PR branches as the source of truth**. If a cherry-pick on `main`
  conflicts, fix the PR branch first, then rebuild `main`.
- After `origin/main` is updated, sync the rest of the rig with:
  `~/personal/config/bin/gt-rig-pristine gastown`
- Rebuild the binary with:
  `make build && cp ./gt ~/.local/bin/gt`
- Run doctor with:
  `gt doctor --fix --no-start`
- Do not delete stale non-PR branches unless the user asks for cleanup.

## Discovery

Detect and report:

```bash
git remote get-url origin
git remote get-url upstream
pwd
git branch --show-current
command -v dcg >/dev/null && echo yes || echo no
```

Parse:

- `FORK_OWNER` and `FORK_REPO` from `origin`
- `CREW_NAME` from `*/crew/<name>`
- `HAS_DCG` from the command check

Validate:

- `upstream` should point at `steveyegge/gastown`
- current branch should be `main`

Capture the starting point before any fetch:

```bash
OLD_HEAD=$(git rev-parse --short HEAD)
```

If the detected values are ambiguous or clearly wrong, pause and ask the user to
correct them. Otherwise, present the detected environment and continue.

## 1. Fetch And Analyze

```bash
git fetch upstream && git fetch origin
git log --oneline origin/main..upstream/main
git log --oneline upstream/main..origin/main
gh pr list --repo steveyegge/gastown --author "$FORK_OWNER" --state all \
  --json number,title,state,headRefName
git branch -r --list 'origin/fix/*' --list 'origin/feat/*'
```

Summarize:

- upstream commits to absorb
- fork-only commits on `origin/main`
- which fork PR branches are open, merged, closed, or absent
- whether the upcoming push should be a fast-forward or history rewrite

## 2. Rebase Main

Try:

```bash
git rebase upstream/main
git log --oneline upstream/main..main
```

If clean, continue.

If it conflicts:

1. Abort the main rebase.
2. Rebase the conflicting PR branch on `upstream/main`.
3. Resolve conflicts there first.
4. If the PR branch has multiple commits, squash it non-interactively:

```bash
git reset --soft upstream/main
git commit -m "squashed: <feature description>"
```

5. Rebuild `main` from `upstream/main`.

If you need to discard stale cherry-pick state:

- with DCG: use `git reset <ref>` plus `git stash` and `git stash drop`
- without DCG: `git reset --hard <ref>` is acceptable

Then cherry-pick the current squashed PR branch commits back onto `main`.

## 3. Rebase Active PR Branches

For each remaining open `origin/fix/*` or `origin/feat/*` branch that still
maps to an open upstream PR:

```bash
git checkout <branch>
git rebase upstream/main
```

If a branch changes, remember that `main` may need to be rebuilt from
`upstream/main` plus fresh cherry-picks.

Return to `main` when finished.

## 4. Build And Test

Build and test every affected branch. For non-main branches and for `main`
before `origin/main` is pushed, use:

```bash
SKIP_UPDATE_CHECK=1 make build
go test ./...
git status --short
```

Watch for:

- package-level collisions that git would miss
- generated formula drift
- environment-sensitive test failures

If build or tests change tracked files, include those changes on the source PR
branch first, then rebuild `main` from fresh cherry-picks.

If failures reproduce on a clean upstream-based `main` with no local delta, call
them out explicitly as upstream or environment failures in the checkpoint rather
than pretending the sync is green.

## 5. Push Checkpoint

Before any push, present:

- what changed on `main`
- whether `main` will push fast-forward or `--force-with-lease`
- PR branch rebase results
- build/test status, including any upstream or environment failures
- branch cleanup candidates, if any

Wait for explicit user approval before pushing.

## 6. Push

After approval:

```bash
git push origin main
```

If `main` history was rebuilt, use:

```bash
git push origin main --force-with-lease
```

Rebased PR branches always push with `--force-with-lease`.

## 7. Sync Other Clones

Preferred path:

```bash
~/personal/config/bin/gt-rig-pristine gastown
```

Use the manual mayor/refinery update flow only if that script is unavailable or
fails and the user wants you to continue without it.

## 8. Rebuild And Install The Binary

After `origin/main` is updated:

```bash
make build && cp ./gt ~/.local/bin/gt
gt version
git rev-parse --short HEAD
```

The commit in `gt version` must match `HEAD`.

## 9. Run Doctor

Run:

```bash
gt doctor --fix --no-start
```

Report:

- what doctor fixed
- warnings that remain
- failures that still need follow-up

Do not start the daemon as part of this skill.

## 10. Review Config-Sensitive Upstream Changes

Use the captured `OLD_HEAD`:

```bash
git log --oneline --name-only "$OLD_HEAD"..upstream/main -- \
  '*.yaml' '*.yml' '*.json' '*.toml' \
  'internal/config/' \
  'internal/version/' \
  'internal/town/' \
  'cmd/gt/'

git shortlog --no-merges -s "$OLD_HEAD"..upstream/main
git log --oneline --no-merges "$OLD_HEAD"..upstream/main
```

Summarize:

- user-facing features and fixes
- config or formula changes
- new doctor checks or operational changes
- contributor breakdown

## 11. Cleanup

Safe cleanup after the sync:

```bash
git remote prune origin
```

Delete merged PR branches if that is clearly safe. For stale local temp or
non-PR branches, ask before deleting them.

## Common Issues

| Issue | Response |
| --- | --- |
| Main rebase conflicts | Abort, fix the PR branch first, then rebuild `main`. |
| PR branch rebase conflicts | Resolve on the branch, then refresh `main` cherry-picks. |
| Build passes on branches but fails on `main` | Treat it as a cross-branch collision and fix the source PR branch. |
| Upstream tests already fail | Report them clearly in the checkpoint instead of claiming success. |
| Need to discard stale state with DCG installed | Use mixed reset plus stash and drop, not `reset --hard`. |
| `gt-rig-pristine` unavailable | Fall back to the manual clone update flow if the user wants to proceed. |
| Doctor reports failures after `--no-start` | Report the residual issues; do not auto-start the daemon. |
