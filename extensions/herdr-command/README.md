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

In Pi's interactive TUI, both tools use the toolkit's Cendre-aware cards.
`Herdr Start` shows the command with the same shell syntax colors as Bash and
omits internal pane IDs. While a command is incomplete, `Herdr Status` stays
compact and shows the original command, requested wait, state, and running
duration. On successful or failed completion, it becomes a Bash-style full card
with the original command and the last five output lines. Press Pi's global tool
expansion key, `Ctrl+O` by default, to show the complete tool result inside the
card.

## Behavior

- The first start for a calling Pi terminal creates one non-focused horizontal
  split directly beneath the Pi pane. Herdr receives `--ratio 0.9`, giving the
  top Pi pane 90% of the height and the lower command pane 10%. The extension
  tags the split with the calling pane's stable terminal ID, so later Pi
  sessions in that terminal adopt and reuse the same command pane while it
  remains available and idle. Separate Pi panes receive separate command panes.
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
  entries so `/reload` and session resume can recover status. Before submitting
  a command, it also stores that run's opaque ID and start time in Herdr pane
  metadata. A replacement Pi session can therefore recover the marker protocol
  for an adopted pane even if Pi exits between submission and session persistence.
  A failed `pane run` response does not clear that record: Herdr may already
  have accepted the input, and the next start safely replaces a stale record.
  Command text and its working directory remain in Pi session entries, not
  pane metadata visible to Herdr clients.
- If the managed pane is already busy, start refuses to submit another command
  instead of interleaving shell input. A new Pi session can detect an adopted
  busy pane even when that session has no metadata for the command already
  running there.
- The extension never closes its pane or kills its command automatically.

`herdr_command_status` returns immediately by default. Its optional `waitMs`
parameter waits only for completion and is capped at 30 minutes. The wait
returns as soon as the command finishes, so use it instead of a fixed shell
sleep when no independent work remains. Status output is capped at 50KB and
defaults to the latest 120 lines; up to 2,000 lines can be requested. Full
output remains in terminal scrollback.

## Monitoring policy

Use short waits while a command is new or uncertain: 1–2 minutes, then 5
minutes. If expected progress remains absent, preserve the command and run at
most 1–2 read-only checks of its known processes, logs, dependencies, disk, or
resource pressure. Once output, dependencies, and resource use show a stable
phase, use 10–30 minute waits or wait for completion. Return to short waits
when the command changes phase, stops progressing, emits an error, or resource
pressure changes; never restart or terminate it solely because no new output
arrived.

## Tool parameters

### `herdr_start_command`

- `command`: single-line shell command to start
- `cwd`: optional working directory, resolved from the Pi session directory
- `label`: optional short pane label

### `herdr_command_status`

- `waitMs`: optional completion wait in milliseconds, from 1 second to 30
  minutes; omitted for an immediate check
- `lines`: recent output lines to return, defaulting to 120 and capped at 2,000

## Requirements

- Pi must run inside Herdr.
- Herdr 0.7.5 or newer must be available on `PATH`.
- The pane shell must support ordinary subshell, `builtin cd`, `printf`, and
  variable-assignment syntax (for example zsh or bash).
