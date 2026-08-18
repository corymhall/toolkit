# Delegate extension

`/delegate` transfers a focused request from the current conversation into a
normal, persisted Pi session in another local repository or a new Worktrunk
worktree. It supports two modes:

```text
/delegate research <goal>
/delegate conversation <request>
```

If no mode is present, Pi asks the user to select one.

Research mode creates a strict `Problem` / `Task` / `Starting sources` report.
It excludes solutions, inferred causes, implementation instructions, and plans
created by the source agent. The destination session performs independent
research and does not implement a change unless the user asks later.

Conversation mode creates a new request followed by the last visible assistant
response from the source session. It copies both parts without summarizing or
rewriting them. The destination session continues the discussion and treats the
prior response as conversation context, not as an authoritative specification.

The extension is intentionally dormant until the command is invoked. It then
temporarily exposes `delegate_session` to the current agent so the agent can
propose a destination, branch, and mode-specific context note. Before anything
is created, Pi opens the resulting destination prompt for editing and asks for
confirmation.

After confirmation the extension:

1. writes the context under Pi's agent directory in `delegations/`;
2. creates a Worktrunk worktree and runs its configured start hooks, unless the
   existing checkout was explicitly requested;
3. opens the resulting checkout as a non-focused native Herdr worktree, labels
   it with the branch name, and starts Pi in its root pane using the semantic
   delegation label as the Pi session name; and
4. disables the temporary delegation tool.

The launched process is an ordinary interactive Pi session with normal session
persistence and configured model defaults. It receives the research report or
conversation excerpt with instructions for the selected mode. Worktrunk remains
responsible for worktree layout and repository hooks.

## Requirements

- Pi must be running inside Herdr (`HERDR_ENV=1`).
- `herdr`, `wt`, and `git` must be available on `PATH`; the delegated session
  reuses the executable that launched the current Pi session.
- The destination repository must already exist locally.

Use `/delegate cancel` to disarm a delegation that is waiting for clarification.
The extension does not automatically remove a Herdr workspace or Git worktree
after a partial failure; the visible workspace and saved context are retained
for inspection and recovery.
