# Rex

This directory is symlinked to `~/.config/rex` by the root `mise.toml`.

- `init.lua` loads the configuration modules.
- `keys.lua` defines custom keybindings.
- `actions.lua` defines custom actions.

Ctrl+A is the prefix. Native Rex shortcuts remain active.

| Keys after Ctrl+A | Action |
| --- | --- |
| Ctrl+A | Send literal Ctrl+A |
| ? / s / Shift+R | Command palette / settings / reload config |
| Ctrl+S / Ctrl+R | Optional snapshot backup / resume automatically tracked agents |
| w | Native session picker |
| u | Preview-free fzf session/tab switcher |
| g | Pick a running Pi and queue a follow-up message |
| Shift+U | Native Rex Picker session and tab map |
| Ctrl+U | Preview-free fzf session/tab switcher |
| Shift+O | Global fzf project picker, open or focus the project's session |
| Shift+N / Shift+W / Shift+D | New / rename / close session |
| c / Shift+T / Shift+X | New / rename / close tab |
| p / n / 1 through 9 | Previous / next / indexed tab in current session |
| < / > | Move tab backward / forward |
| h / j / k / l | Focus left / down / up / right |
| Shift+H/J/K, Ctrl+L | Resize left / down / up / right by 5 |
| Shift+L or Shift+S | Toggle last native picker tab, including across sessions |
| Tab / Shift+Tab | Next / previous pane |
| v or Shift+Backslash | Split right, Shift+Backslash types a pipe on US keyboards |
| - / x / z | Split down / close pane / zoom |
| b / Shift+E | Toggle sidebar / balance splits |
| / | Toggle this tab's floating scratch terminal, creating it if needed |
| m | Minimize the focused floating pane, or restore via Rex's native toggle |
| a / Shift+A / i | Commentry capture / new conversation / inbox |
| r | Enter exclusive resize mode |

Build the native picker, quit its resident app with Cmd-Q, and run `scripts/package-app.sh` in `~/personal/picker-ui` after each rebuild. The launcher uses `target/debug/Rex Picker.app/Contents/MacOS/rex-picker` so macOS receives the app's Aperture emblem and identity.

Ctrl+A then Shift+S or Shift+L invokes the native picker binary with `--previous`, without opening its window. It returns to the exact session and tab departed by the last acknowledged native picker switch, then swaps the pair on subsequent presses. State is scoped to the Rex host and app client. Closed tabs report an error instead of choosing a replacement. First use requires a native picker switch to seed history. After updating the picker binary, quit the old resident picker with Cmd-Q and reopen it once. Project selection does not maintain a second last-tab history.

In resize mode, arrows and h/j/k/l resize. Shift uses steps of 15.
Equals balances splits. Enter or Escape leaves the mode.

Ctrl+A then / runs **Open Floating Scratch Terminal**, also available in the
command palette. It creates an 80% floating shell per tab, inheriting the focused
pane's process working directory on first creation. Subsequent presses minimize the
same terminal if visible, or restore and focus it if minimized. Ctrl+A then m minimizes it without
stopping its shell. Type `exit` or Ctrl+D to close it; the next Ctrl+A then / creates a new one.
The reserved pane label `__rex_scratch_terminal` identifies it across config reloads.
Floating layers are window-scoped, not session-wide modal popups. Rex provides their opaque
backgrounds.
Close actions use Rex's native behavior.

`init.lua` also loads the local Commentry integration from
`~/plugins/commentry.nvim/integrations/rex`. That checkout must exist before
loading this configuration.

Annotation mode, last-pane navigation, pane rename, scrollback editing,
notification targeting, detach, and direct Shift+G worktree creation remain unbound.

## Queue a message to another Pi

Ctrl+A then g runs `toolkit rex message` in a floating popup. Huh provides the
agent selection, multiline message editor, and send confirmation. Escape cancels.
Agents are sorted by working directory and conversation ID; there is no separate
favorites configuration or custom editor. Closing the popup restores its origin.

Run `/reload` once in existing Pi sessions to enable discovery. New Pi sessions
load the global `rex-session.ts` extension automatically. Only agents connected
to the same Rex server are listed. Codex is not supported by this composer yet.

Messages go directly to Pi with `deliverAs: "followUp"`. Pi runs them after the
current work finishes, or immediately if idle. Existing editor drafts are not
read, cleared, or submitted. The target conversation is rechecked on delivery.
Local Unix sockets are private to your user, and metadata contains only process,
conversation, working-directory, and Rex connection information. Neither the
composer nor the endpoint persists message text. Pi records delivered messages
in its own conversation as usual.

If delivery cannot be confirmed, the popup shows an error and never retries.
Check the target before resubmitting, since a lost acknowledgement does not
prove the message was rejected. The existing generic Rex `agent_queue` action
still uses native terminal keys; its Pi Alt+Enter encoding is fixed in the
Commentry integration. The composer does not use terminal-key injection.

## Automatically tracked agents

Rex restores windows, tabs, panes, and directories as fresh shells. Our helper
tracks the last conversation in each pane automatically. Ctrl+A then Ctrl+R
resumes those conversations in the existing panes, with no manual save needed.
Exiting Pi retains its last reference; `toolkit rex workspace forget` clears it.
Ctrl+A then Ctrl+S remains an optional backup. See [WORKSPACE.md](WORKSPACE.md)
for safety checks, backfill, explicit backup restore, diagnostics, and tests.

## fzf session switcher

Ctrl+A then u or Ctrl+U lists live sessions and tabs as `session / tab`. Type to
filter, Enter to switch, or Escape to cancel. `sessions.sh` queries Rex when
opened and keeps the selected IDs only in memory. It rechecks the selected tab
before switching. There is no registry, polling, preview, or Worktrunk operation.
The native picker remains on Ctrl+A then Shift+U.

## Projects

Ctrl+A then Shift+O opens a preview-free fzf list of repositories under the roots
in `projects.sh`. Enter opens or focuses that project's session. Escape cancels.

`projects.sh` discovers directories and calls `rex do open_project path=...`.
`projects.lua` looks for an exact session-label match, or creates a session with
one shell in the project's canonical directory.

The label is the canonical project path, shortened under your home directory,
for example `~/personal/toolkit`. Different roots with the same project name
remain distinct. Duplicate labels report an error instead of choosing a session.
Renaming a session breaks the match. Existing sessions can be renamed to their
project path to participate. Paths exceeding Rex's label limit are rejected.

There is no registry, checkout/tab ownership, terminal inspection, or automatic
worktree grouping. Inside the project terminal, run `wt switch` for Worktrunk's
picker or `wt switch --create branch` to create a worktree. Worktrunk owns paths,
setup hooks, and directory changes. The global selector does not launch agents.

Both fzf pickers target the originating app through `REX_CLIENT`; CLI-triggered
navigation requires Remote Control. Floating scratch terminals remain available
through Ctrl+A then /. The native session picker remains independent.

Project and session selection use Bash, jq, fzf, Git, and Rex, with no Python. Worktrunk is only needed
when you use it inside the terminal.

## Apply and validate

```sh
bash ~/.config/rex/projects.sh list
bash ~/.config/rex/sessions.sh list
rex config check
rex config reload
mise run test:go
mise run install:toolkit
```

Install the Go CLI with `mise run install:toolkit`. The Pi lifecycle extension
and Codex hook call `toolkit rex workspace register-pi` or `register-codex`.
Rex does not automatically watch these files. Reload Pi to remove the retired
`/delegate` command. The config lives at `$XDG_CONFIG_HOME/rex/init.lua` or
`~/.config/rex/init.lua`; `REX_CONFIG` overrides it.

Documentation: https://www.superlogical.com/rex/docs/customize/config
