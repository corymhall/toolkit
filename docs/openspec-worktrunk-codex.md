# OpenSpec + Worktrunk + Codex

This repo is moving to a simpler workflow built from three separate parts:

- `OpenSpec` for planning artifacts
- `worktrunk` for worktree creation and cleanup
- `tmux` for session management

The goal is a workflow that stays lightweight, customizable, and easy to reason
about.

## Recommended Flow

### 1. Start work in a fresh worktree

Use `worktrunk` to create a branch and worktree, then attach to its tmux
session:

```bash
wt switch --create feature-name -x 'tmux attach -t {{ branch | sanitize }}'
```

With the shared project config in [.config/wt.toml](/Users/chall/personal/toolkit/.config/wt.toml):

- a tmux session is created automatically
- Codex starts in the left pane if the `codex` CLI is installed
- a shell stays open in the right pane
- removing the worktree also removes the tmux session

### 2. Plan only when the work benefits from planning

Use OpenSpec when the task is large enough, risky enough, or fuzzy enough that
durable artifacts will reduce rework.

Suggested default:

- small/obvious work: go straight to implementation in the worktree
- medium/large work: use OpenSpec before or during implementation

### 3. Use Codex as the main implementation owner

The intended execution model is:

- one main Codex session owns the build
- sidecar agents help with bounded research, review, or parallelizable slices
- milestone review beats micro-task orchestration

That keeps the workflow aligned with
[docs/codex-evaluation-lens.md](/Users/chall/personal/toolkit/docs/codex-evaluation-lens.md).

## Why This Structure Works

This structure keeps distinct concerns separate:

- OpenSpec owns artifacts
- worktrunk owns worktrees
- tmux owns terminal/session layout
- Codex owns implementation

That makes the workflow easier to evolve without coupling all behavior into one
system.

## Planning Shape

The default OpenSpec flow is a good fit for most work:

- proposal for intent and scope
- specs for behavior changes
- design for technical approach when needed
- tasks for implementation tracking

Use the stock workflow first and only add repo-local customization after you
have repeated evidence that the default shape is not enough.

## OpenSpec Notes

This repo does not need to carry a local OpenSpec schema or config in order to
use the default OpenSpec workflow.

Practical next step after installing OpenSpec:

```bash
openspec init --tools codex
```

If you want to keep the stock setup, that is enough.

If you want the expanded command set, configure your workflow profile first:

```bash
openspec config profile
openspec update
```

## Worktrunk Notes

`worktrunk` already supports the important mechanics needed here:

- `wt switch --create`
- `-x/--execute` to run `tmux attach ...`
- `pre-start` hooks to create a tmux session before attach
- `pre-remove` hooks to clean up the session

This is a good fit for the workflow:

1. new worktree
2. new tmux session
3. Codex starts in that session
4. optional OpenSpec planning inside that worktree
