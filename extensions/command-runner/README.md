# Command runner

`start_command` starts a long-running shell command in a visible reusable pane
without blocking Pi. In interactive and RPC sessions, completion arrives
automatically as a follow-up with the exit code and a short output tail. The
follow-up resumes an idle agent without interrupting ongoing work.
`command_status` provides immediate state, process, and output diagnostics.
Use Bash for short synchronous work.

The extension selects Herdr when `HERDR_ENV=1`, otherwise Rex when both
`REX_SESSION` and `REX_BLOCK` are set. Tools report the selected backend and pane
identity. Outside these environments it registers no tools. Tmux remains a
manual fallback, not a command-runner backend.

## Contract

- One non-focused command pane per calling Pi terminal. Rex uses a floating
  pane in the caller's tab, minimized by default. Herdr splits below Pi with
  approximately 10 percent of its height. Separate Pi terminals get separate
  command panes. Later Pi sessions in the same terminal can adopt the pane.
- Commands return after terminal input is accepted, not after completion. They
  survive tool cancellation, Pi reload, and Pi exit. Rex closes its registered
  pane on orderly Pi quit only when the shell is idle and any tracked command
  has a completion marker. Running, uncertain, and unrecognized work is retained.
  Reloads and conversation switches retain the pane. Herdr never closes panes
  automatically. Forceful exits may leave panes for later reuse.
- Only one command may occupy the pane. A busy or unrecognized foreground
  process prevents another submission.
- Commands must occupy one physical line, without tabs or newlines. Use shell
  separators or a script file for multi-step work. The shell must support
  subshells, `builtin cd`, `printf`, and variable assignment, such as Bash or Zsh.
- Each command runs in a subshell with an explicit working directory. The
  persistent shell's directory remains unchanged. Unique start and numeric exit
  markers distinguish running work from successful and failed completion.
- Pane and run metadata are stored outside model context in Pi session entries.
  Backend recovery metadata is persisted before submission. An uncertain
  submission response does not erase tracking or trigger automatic resubmission.
- Missing completion markers never imply success. Closing a pane or losing
  scrollback can make a result unavailable.

The public tools replace `herdr_start_command` and `herdr_command_status`.
Legacy Herdr session-entry identifiers and marker format remain readable for
recovery of existing panes. No old tool aliases are registered.

## Backend differences

Herdr uses stable terminal IDs, pane metadata, recent unwrapped output, and
`pane wait-output`. It requires Herdr 0.7.5 or newer.

Rex scopes every call to the inherited server address and explicit session and
block IDs, with server autostart disabled. It uses full server-instance-scoped
block identities, process inspection, and the terminal `format` method for
scrollback. `rex capture` only returns the screen and is not used for status.
The current Rex API returns the complete scrollback; displayed results are
bounded locally, but reading it can transfer more data than the displayed limit.

Rex has no arbitrary pane metadata API. A private registry under
`${XDG_STATE_HOME:-~/.local/state}/toolkit/command-runner` stores opaque owner,
pane, and run identities and start times. It does not store command text or cwd.
Files are atomically replaced with owner-only permissions. Registry keys include
the Rex server instance, session, and calling block. Recovery validates the live
session and blocks before adoption. A unique temporary pane label allows
recovery after a lost creation response. Server restarts require reloading Pi.

Rex requires `session.new_layer`, `session.float_block`, and
`session.set_layer_state`. Existing registered tiled panes are floated and
minimized on recovery without restarting their shells or losing output.
Restoring a floating pane in Rex leaves it visible during subsequent tool calls.
The extension never adopts or cleans up unrelated panes by label. Older orphaned
panes need explicit ownership and process checks before manual cleanup.

If a pane creation response remains unresolved, the runner stops rather than
creating another pane. Inspect the live Rex session and the registry file named
in the error. If the temporary labeled pane exists, leave it in place and retry
so the runner can adopt it. Only remove that registry file after confirming that
creation failed without leaving a pane or a running command. The next start can
then create a pane normally. Do not delete tracking for an uncertain live command.

Rex's native `wait` waits for the terminal program to exit. Since the command
pane runs a persistent shell, status instead checks completion markers with
bounded cancellable polling inside the adapter. Cancelling that wait leaves the
command running. Rex shell-prompt detection supports sh, Bash, and Zsh. Other
shells are treated as busy rather than receiving potentially unsafe input.

On macOS, Atuin's PTY proxy can hide the real shell behind an outer `login`
process in Rex's response. For a Unix-socket server and a block on that server's
host, the adapter checks the local process table for the exact
`login → atuin → shell` chain and the inner terminal's foreground process group.
It accepts only an idle supported shell, never `login` itself or a visible prompt
as proof of readiness. Unknown wrappers, running commands, nested shells, and
remote blocks remain busy. Process snapshots exclude command arguments.

## Parameters and monitoring

`start_command` accepts `command`, optional `cwd` resolved from Pi's working
directory, and an optional short pane `label`.

`command_status` accepts optional `waitMs`, from 1 second through 30 minutes,
and `lines`, from 1 through 2,000 with a default of 120. Results are capped at
50KB. Waits return early on completion. Full output remains in pane scrollback
until the terminal discards it.

Continue independent work after starting. If nothing independent remains, end
the turn and let the completion follow-up resume work. Do not poll or use long
status waits for routine completion. Use `command_status` without `waitMs` when
output or process diagnostics are needed. Explicit bounded waits remain available
for callers that require them, including print and JSON modes, which have no
automatic notifications.

The extension checks tracked commands in the background every two seconds,
without overlapping inspections or holding a model tool call open. Each terminal
outcome sends at most one follow-up with the last 20 output lines, capped at
50KB. Missing markers, vanished panes, and backend errors report unavailable
tracking, never success. A backend error ends that watcher; inspect with
`command_status` rather than automatically resubmitting the command.

Notification receipts survive reload and resume. Receipts record dispatch to
Pi's follow-up queue, not that the agent has processed the message. Only runs
recorded in the active conversation branch are watched. Adopting a pane in a new conversation
does not subscribe to the previous conversation's command. Session shutdown and
tree navigation cancel stale monitoring without stopping shell commands.
An explicit terminal `command_status` result acknowledges the outcome without a
duplicate follow-up. Starting another command delivers any pending previous
outcome before reusing the pane.

Never restart or terminate work solely because output is quiet. Confirm a
successful completion notification or status result before relying on artifacts
or reporting success.

Both tools use shared Pi UI cards. Running status stays compact. Completed
status and automatic completion notifications show the command, outcome, exit
code, elapsed time to observation, and a short output preview. Elapsed time
includes any time Pi was closed or monitoring was paused, so it is not an exact
execution duration. Notifications render as separate Command Result cards, even
when a saved session is reopened outside Herdr or Rex. Pi's expansion key reveals
the full bounded result, including truncation and recovery notices. Lost tracking
uses a warning card.

## Checks

Run unit and adapter tests with `mise x -- npm run test:command-runner`.
For a live Rex check, run the following from a Rex terminal. It creates one
non-focused test pane, checks minimized floating placement, focus preservation,
waiting, exit status, reuse, replacement-session recovery, and idle-quit cleanup.
It closes only that test pane.

```sh
mise x -- env REX_RUNNER_INTEGRATION=1 node --experimental-strip-types --test extensions/command-runner/test/rex-integration.test.ts
```

## Activation and removals

The packaged extension entry is `extensions/command-runner/index.ts`. Existing
Pi settings that list `extensions/herdr-command/index.ts` individually must be
updated to the new entry, then Pi reloaded or restarted.

The former Herdr delegation workflow and Herdr Neovim file-link integration
have been removed. The current [delegate extension](../delegate/README.md) uses
Rex instead. Remove obsolete Herdr file-link entries from old Pi configurations.
This repository change does not uninstall a previously installed macOS
URL-handler app or Neovim package, or delete saved delegation context.
