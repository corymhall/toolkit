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
| u | Native Rex Picker session and tab map |
| g | Pick a running Pi and queue a follow-up message |
| Shift+U / Ctrl+U | Aliases for the native Rex Picker |
| Shift+O | Floating Television repository, worktree, and scratch-directory browser |
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

Ctrl+A then Shift+S or Shift+L invokes the native picker binary with `--previous`, without opening its window. It returns to the exact session and tab departed by the last acknowledged native picker switch, then swaps the pair on subsequent presses. State is scoped to the Rex host and app client. Closed tabs report an error instead of choosing a replacement. First use requires a native picker switch to seed history. After updating the picker binary, quit the old resident picker with Cmd-Q and reopen it once. The older Television registry is unchanged.

In resize mode, arrows and h/j/k/l resize. Shift uses steps of 15.
Equals balances splits. Enter or Escape leaves the mode.

Ctrl+A then / runs **Open Floating Scratch Terminal**, also available in the
command palette. It creates an 80% floating shell per tab, inheriting the focused
pane's process working directory on first creation. Subsequent presses minimize the
same terminal if visible, or restore and focus it if minimized. Ctrl+A then m minimizes it without
stopping its shell. Type `exit` or Ctrl+D to close it; the next Ctrl+A then / creates a new one.
The reserved pane label `__rex_scratch_terminal` identifies it across config reloads.
Floating layers are window-scoped, not session-wide modal popups. Rex provides their opaque
backgrounds; Television uses your normal global theme.
Close actions use Rex's native behavior, which may differ from Herdr confirmations.

`init.lua` also loads the local Commentry integration from
`~/plugins/commentry.nvim/integrations/rex`. That checkout must exist before
loading this configuration.

Annotation mode, last-pane navigation, pane rename, scrollback editing,
notification targeting, detach, and direct Shift+G worktree creation remain unbound.

## Queue a message to another Pi

Ctrl+A then g opens an agent picker without switching sessions. Type to filter,
use arrows to select, and press Enter to compose. Enter submits the message,
Ctrl+J adds a newline, and Escape cancels. Multiline and Unicode paste are
supported. Closing the popup returns focus to its originating pane.

`agent-message.toml` lists preferred working directories and friendly names.
Config and Commentry appear first; other running Pi sessions remain available.
The conversation ID suffix distinguishes agents in the same directory.

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
Exiting Pi retains its last reference; `workspace.py forget` clears it.
Ctrl+A then Ctrl+S remains an optional backup. See [WORKSPACE.md](WORKSPACE.md)
for safety checks, backfill, explicit backup restore, diagnostics, and tests.

## Television pickers

Requires Television, Worktrunk, Git, and Python 3.11 or newer. The launcher adds
personal bin and Homebrew to PATH for GUI-launched Rex servers, preserving
Rex's injected CLI directory.
All picker files live here, separate from the Herdr plugins.

- `picker.toml` contains roots copied from the live Herdr repository-browser config.
- `cables/` contains the four adapted Herdr Television channels.
- `picker.py` implements discovery, previews, session selection, and Worktrunk operations.
- `picker-snapshot.lua` collects live layouts, pane statuses, titles, and working
  directories over one Rex connection per tab or worktree source refresh.

Source refreshes reuse this snapshot instead of spawning a Rex CLI for every pane
query. Snapshots last only for that refresh; destructive actions still perform live
validation. Repository branch names are read directly from Git HEAD files, including
linked worktrees, without starting a Git process per repository.

Pickers open in an 80% native floating popup. The October 28 Rex update fixes
transparent default backgrounds, including the Television preview. No separate
Television theme override or fzf dependency is needed. Worktree and scratch
browsers use the same popup and global Television settings.
Escape cancels Television and explicitly closes its floating layer, restoring
focus to the invoking pane. Natural terminal-process exit currently selects a
different tiled pane in Rex, so picker cleanup uses `session.close_layer` instead.
Native Rex Cmd shortcuts remain available. The tab picker refreshes once per
second and lists each tab as `repository / tab`, with its own status.
Autogenerated `Window ...` labels
fall back to the focused pane's folder, then terminal title, including default
labels retained across restore. Explicit branch names are preserved. It marks
the originating tab, excludes the picker pane, and orders states as done/error, blocked,
working, idle, unknown. Its preview shows the selected tab's pane roster and
up to 80 current-screen lines from its highest-priority pane. Enter selects
that exact tab, including across repository sessions. Rex program status is used;
no agent state is inferred from screen text. Herdr GitHub-status tokens and
repository aliases are not ported. Git status is shown in previews.

### Last picker tab

Ctrl+A then Shift+L or Shift+S toggles between the current tab and the tab you left through
a Television picker. Both session and repository/worktree selections record the
originating tab, not the picker pane. Repeated presses toggle back and
forth across repository sessions. Closed targets are ignored. Cancelled pickers,
failed selection commands, and selecting the originating tab preserve history.

History is stored per Rex client in `navigation.json` beside the checkout registry.
Mouse clicks, native Rex navigation, and numeric tab shortcuts do not update it.
A new app client starts with no history. Right-resize moved from Shift+L to
Ctrl+A then Ctrl+L; resize mode still supports l and Right.

Repository picker actions:

- Enter opens or focuses the primary-checkout tab in the repository session.
  Plain scratch roots still open independent sessions.
- Ctrl+W browses worktrees or scratch directories.
- Ctrl+G creates a worktree or scratch directory.

Worktree picker actions:

- Enter opens or focuses a branch-named checkout tab in the repository session.
- Ctrl+G creates a worktree from the freshly fetched origin default branch and
  opens its setup in a new tab in that same session.
- Ctrl+D removes a checkout and lets Worktrunk delete an integrated branch.
- Ctrl+K removes a checkout while retaining its branch.
- Ctrl+X force-removes a checkout and unmerged branch, including dirty files.

Repository sessions are identified by Git's shared common directory, so linked
worktrees share one session even when their folders live elsewhere. The session
is named after the primary repository directory. Tabs use branch names, falling
back to the checkout directory name for detached HEADs. Reopening a checkout
selects its existing tab, including after its shell changes directory.

A locked registry in `$XDG_STATE_HOME/rex/picker/registry.json`, or
`~/.local/state/rex/picker/registry.json`, tracks session and checkout-tab ownership.
Closed resources are pruned on discovery. Existing repo-named sessions can be
adopted when their panes identify only that repository. Old per-worktree sessions
are not automatically moved, renamed, or closed. A checkout already open in an
old session is focused there rather than duplicated. Scratch sessions keep their
independent-session behavior.

All removals require typing `yes`. Confirmation lists checkout tabs and closes
only those tabs, never the repository session or its other checkout tabs. The
primary checkout, the originating checkout tab, and the picker tab cannot be
removed. Tabs containing panes in another checkout are protected. A failed
removal leaves the selected tabs closed and reports how to reopen the preserved
checkout.

Creation runs Worktrunk pre-switch before checkout creation with automatic hooks
disabled. The new checkout tab runs pre-start synchronously, then post-start and
post-switch, before opening a login shell. Setup failure stops before the shell;
the pane remains for diagnosis. A checkout is never automatically deleted after
a session or tab creation or focus failure. Inspect Rex and `wt list` before retrying.
To resume setup manually after fixing its cause, run:

```sh
python3 ~/.config/rex/picker.py setup /path/to/checkout origin/main
```

The toolkit Pi `/delegate` extension uses `create_worktree(repo, command=None,
branch=None)` to reuse this lifecycle. An optional command is passed to `setup`
as a third argument containing a JSON argv list. Setup runs all hooks in the
foreground for that launch, then starts the command through an interactive login
shell in the new checkout. The shell's job control gives the agent its own
foreground process group so Rex can identify it and show its emblem. Arguments
are forwarded literally, and the shell exits when the command finishes. A
failing hook prevents launch. Ordinary picker creation still opens
a login shell and retains its existing background post-hook behavior.

Use the actual origin default branch in place of `main`. Hook commands remain
owned by Worktrunk's user and project configuration. Linear launching and the
Herdr metadata daemon are separate workflows and are not changed here.

Checks:

```sh
python3 -B -m unittest discover -s packages/rex -p 'test_*.py' -v
rex config check
```

Manual smoke checks: open both pickers, verify previews, cancel with Escape,
and select an existing session. Use a disposable repository to exercise
creation and each removal mode, including a failing pre-start hook.

Validate changes with `rex config check`, then apply them with
`rex config reload`. Rex does not automatically watch these files.

Rex uses `$XDG_CONFIG_HOME/rex/init.lua` when `XDG_CONFIG_HOME` is set.
`REX_CONFIG` overrides the configuration file path. These variables must be
set in the Rex server environment to affect which file it loads.

Documentation: https://www.superlogical.com/rex/docs/customize/config
