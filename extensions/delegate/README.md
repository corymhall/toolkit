# Delegate extension

`/delegate [goal]` transfers lightweight context from the current conversation
into a normal, persisted Pi session in another local repository or a new
Worktrunk worktree.

The extension is intentionally dormant until the command is invoked. It then
temporarily exposes `delegate_session` to the current agent so the agent can use
the existing conversation to propose a destination, branch, and concise context
note. The source agent is told not to research the delegated task, prescribe a
solution, or turn the context into an implementation plan. Before anything is
created, Pi frames the note as background for independent investigation, opens
the resulting destination prompt for editing, and asks for confirmation.

After confirmation the extension:

1. writes the context under Pi's agent directory in `delegations/`;
2. creates a Worktrunk worktree and runs its configured start hooks, unless the
   existing checkout was explicitly requested;
3. opens the resulting checkout as a non-focused native Herdr worktree, labels
   it with the branch name, and starts Pi in its root pane using the semantic
   delegation label as the Pi session name; and
4. disables the temporary delegation tool.

The launched process is an ordinary interactive Pi session with normal session
persistence and configured model defaults. It receives the note as background,
with an explicit request to investigate independently and verify details in the
destination checkout. Worktrunk remains responsible for worktree layout and
repository hooks.

## Requirements

- Pi must be running inside Herdr (`HERDR_ENV=1`).
- `herdr`, `wt`, and `git` must be available on `PATH`; the delegated session
  reuses the executable that launched the current Pi session.
- The destination repository must already exist locally.

Use `/delegate cancel` to disarm a delegation that is waiting for clarification.
The extension does not automatically remove a Herdr workspace or Git worktree
after a partial failure; the visible workspace and saved context are retained
for inspection and recovery.
