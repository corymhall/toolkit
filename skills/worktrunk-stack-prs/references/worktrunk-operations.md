# Worktrunk Operations

Use Worktrunk for worktree lifecycle. Use Git and git-spice inside the worktree that owns a branch.

## Inspect Worktrees

Agent-readable state:

```bash
wt list --format=json
```

Worktrunk has two JSON schema versions: a bare array and a versioned envelope. Inspect the returned shape before selecting fields. Useful facts include branch, worktree path, local changes, operation state, and upstream divergence.

Human-readable state, including branches without worktrees:

```bash
wt list --branches --full
```

The table is useful for diagnosis but is not a stable parsing interface.

## Create or Open a Worktree

Create a new branch and worktree from a parent:

```bash
wt switch --create --base <parent> --no-cd --format=json <branch>
```

Create a worktree for an existing branch:

```bash
wt switch --no-cd --format=json <branch>
```

`--no-cd` is useful for agents and scripts because a child process cannot change the parent process's directory. The JSON result contains the created or selected path. `wt list --format=json` can resolve it again later.

Worktrunk can run project hooks during creation. Hooks can install dependencies or initialize local files. `--no-hooks` bypasses that project behavior and is appropriate only when the user requests it or a diagnosed hook failure makes it necessary.
