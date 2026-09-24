---
name: create-pr
description: Create a GitHub pull request from a well-formed commit. Use when asked to open or create a PR. Use worktrunk-stack-prs for stacked PRs.
---

# Create PR

First check whether the current branch is tracked in a git-spice stack:

```bash
branch=$(git branch --show-current) && git rev-parse --verify --quiet "refs/spice/data:branches/$branch" >/dev/null
```

If it is tracked, use the `worktrunk-stack-prs` skill. Otherwise, use the `commit` skill to commit the intended changes, push the branch, and create the PR with `gh pr create --fill` (adding `--draft` or `--base` when requested).
