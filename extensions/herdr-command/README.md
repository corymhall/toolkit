# Herdr command extension

`herdr_run_command` runs an ordinary long-running shell command in a visible
Herdr pane and waits for the command's actual exit status.

The extension loads only when Pi itself is running inside Herdr
(`HERDR_ENV=1`). It is intentionally narrower than a general Herdr wrapper:
agent startup and explicit tab, workspace, and worktree operations remain under
the normal Herdr CLI and skill.

## Behavior

- The first call creates one non-focused horizontal split directly beneath the
  calling Pi pane. Herdr receives `--ratio 0.9`, giving the top Pi pane 90% of
  the height and the lower command pane 10%. Later calls reuse that pane while
  it remains available and idle.
- The original command text is sent directly to the pane. A visible subshell
  changes to the requested working directory without changing the persistent
  shell's directory.
- Visible shell statements print unique start and completion markers around the
  command. The completion matcher accepts every numeric exit code, so failures
  complete immediately instead of waiting for a success-only string that can
  never arrive.
- Ten-second wait intervals provide progress updates while a separate overall
  timeout controls the command.
- Failure and timeout output remains visible in the pane. A timeout stops only
  Pi's wait; it does not kill the command.
- The extension stores the pane and terminal identifiers in a non-context Pi
  session entry so `/reload` and session resume can revalidate and reuse it.
- If the managed pane is already busy, the tool refuses to submit another
  command instead of interleaving shell input.

Output returned to the model is capped at 2,000 lines or 50KB. The pane retains
its terminal scrollback for direct inspection.

## Parameters

- `command`: shell command to run
- `cwd`: optional working directory, resolved from the Pi session directory
- `timeoutMs`: overall timeout, defaulting to 30 minutes
- `label`: optional short pane label

## Requirements

- Pi must run inside Herdr.
- `herdr` must be available on `PATH`.
- The pane shell must support ordinary POSIX-style subshell, `cd`, `printf`, and
  variable-assignment syntax.

The extension does not close its pane automatically. This preserves visible
output and avoids terminating a command that outlives Pi's wait.
