# Recovery

Use this reference to identify available recovery operations. Choose an operation from the actual Git, git-spice, worktree, publication, and GitHub state rather than following a fixed repair sequence.

## Restack Conflicts

When `git-spice branch restack` stops, the conflict belongs to the branch worktree where the command ran. Git shows the active operation and conflicted files:

After resolving and staging the current branch's patch against its new parent, git-spice can continue:

```bash
git -C <path> add <resolved-files>
(cd <path> && git-spice rebase continue)
```

To restore the pre-restack state:

```bash
(cd <path> && git-spice rebase abort)
```

Do not start another restack while the current rebase is active. A later descendant should not be restacked until its direct parent is clean and has its final tip.

## A PR Has the Wrong Base or Is Not in the Native Stack

First compare local ancestry with the intended PR chain. To set PR bases and link active branches bottom to top:

```bash
gh stack link --remote <remote> <bottom> <middle> <top>
```

`link` adds or updates members but does not remove obsolete PRs from an existing stack. Removal or reordering can have wider remote effects, so inspect the current GitHub stack before changing membership.
