# Herdr command extension

This extension provides two tools for running ordinary long-running commands in
a visible Herdr pane without blocking the Pi agent:

- `herdr_start_command` submits a command and returns immediately.
- `herdr_command_status` reports the latest command's state, exit code,
  foreground processes, and recent pane output.

The extension loads only when Pi itself is running inside Herdr
(`HERDR_ENV=1`). It is intentionally narrower than a general Herdr wrapper:
agent startup and explicit tab, workspace, and worktree operations remain under
the normal Herdr CLI and skill.

## Intended use

Use `herdr_start_command` for builds, long test suites, code generation, and
similar work that can remain visible while the agent performs independent work.
Use Pi's synchronous `bash` tool for short commands or when the result is needed
before the next action.

After starting a command, avoid frequent status polling. Continue independent
work, then call `herdr_command_status` before relying on generated artifacts or
reporting that the command succeeded.

## Behavior

- The first start creates one non-focused horizontal split directly beneath the
  calling Pi pane. Herdr receives `--ratio 0.9`, giving the top Pi pane 90% of
  the height and the lower command pane 10%. Later starts reuse that pane while
  it remains available and idle.
- Starting returns after Herdr accepts the terminal input. It does not wait for
  output or command completion. The command continues if Pi is cancelled,
  reloaded, or exits.
- The original command text is sent directly to the pane on one physical line.
  Tabs and newlines are rejected so interactive paste and completion widgets
  cannot consume them. Use shell separators or a script file for multi-step
  commands.
- A visible subshell uses the shell's builtin `cd` to change to the requested
  working directory without changing the persistent shell's directory or
  invoking interactive `cd` replacements such as enhancd.
- Visible shell statements print unique start and numeric exit markers around
  the command. Status uses those markers to distinguish running commands from
  successful and nonzero completion.
- The extension stores pane and latest-run metadata in non-context Pi session
  entries so `/reload` and session resume can recover status.
- If the managed pane is already busy, start refuses to submit another command
  instead of interleaving shell input.
- The extension never closes its pane or kills its command automatically.

`herdr_command_status` returns immediately by default. Its optional `waitMs`
parameter waits only for completion and is capped at 30 seconds, providing a
bounded synchronization point without making command launch synchronous.
Status output is capped at 50KB and defaults to the latest 120 lines; up to
2,000 lines can be requested. Full output remains in terminal scrollback.

## Tool parameters

### `herdr_start_command`

- `command`: single-line shell command to start
- `cwd`: optional working directory, resolved from the Pi session directory
- `label`: optional short pane label

### `herdr_command_status`

- `waitMs`: optional completion wait in milliseconds, from 1 to 30 seconds;
  omitted for an immediate check
- `lines`: recent output lines to return, defaulting to 120 and capped at 2,000

## Requirements

- Pi must run inside Herdr.
- `herdr` must be available on `PATH`.
- The pane shell must support ordinary subshell, `builtin cd`, `printf`, and
  variable-assignment syntax (for example zsh or bash).
