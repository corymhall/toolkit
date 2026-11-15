# Automatic agent tracking and manual resume

Rex preview.23 and newer restore session IDs, tabs, panes, split layouts, and
working directories when the server starts. Terminals reopen as fresh shells.
Our helper automatically remembers which Pi or Codex conversation last ran in
each pane, then resumes those conversations when requested. No manual save is
needed for the normal workflow. Agent launching remains manual.

## Use

1. Start and use Pi normally. Its existing extension updates tracking at startup
   and agent boundaries. Codex records its conversation through SessionStart.
2. After restarting Rex, let native restoration finish opening the shells.
3. Press Ctrl+A then Ctrl+R, **Resume Tracked Agents**.
4. Review the plan and type `restore` to proceed.

The preview is also available as **Preview Tracked Agent Resume** in the command
palette. Press Enter to close the control tab afterward.

Tracking is scoped to the persistent Rex host ID and pane ID, not a running
server instance or a process ID. Later registrations replace a pane's previous
conversation. If a conversation moves between panes, its latest verified pane
owns the resume reference, preventing duplicate launches.

Exiting Pi removes its live registration but retains the last resume reference.
That includes intentional exits. To forget a pane, first exit its agent and run:

```sh
python3 ~/.config/rex/workspace.py forget
```

Alternatively, pass an explicit pane ID after `forget`. A still-running agent
can register itself again at its next boundary, so stop it before forgetting.
A new Pi started with `--no-session` clears that pane's previous reference rather
than accidentally resurrecting the old conversation.

CLI equivalents for the normal workflow:

```sh
python3 ~/.config/rex/workspace.py preview
python3 ~/.config/rex/workspace.py restore
```

Existing running agents can be backfilled without restarting them:

```sh
python3 ~/.config/rex/workspace.py track
```

Backfill uses only current, verified process registrations. It does not infer
conversations from terminal text, import expired process registrations, or
change any running agent. The Python helper is loaded on each report, so this
tracking change does not require reloading the already-installed Pi extension.
Installing the extension for the first time still requires `/reload` in existing
Pi sessions.

## Resume safety

- Only tracked panes that still exist in the current tiled layout are considered.
  Closed panes and floating-only panes are skipped with a warning.
- Stable native IDs identify targets. Labels alone are never used for matching.
- A verified registration for the same conversation means it is already running,
  even if moved to another pane. It is skipped, not started again.
- A target must show a recognized empty shell prompt, have the tracked working
  directory, and have no fullscreen application. Visible drafts, busy agents,
  and different directories skip that pane with a warning. Other safe panes
  can still resume.
- Prompts recognized are plain `❯`, `$`, `%`, `#`, `>`, `➜`, and versioned
  sh/bash/zsh prompts. Other prompt styles require manual inspection.
- Missing directories, Pi files, or executables leave the shell alone and warn.
- Only quoted `pi --session FILE --tui-mode fullscreen` or `codex resume UUID`
  commands are submitted. Captured commands and environment are never replayed.
- Every write is journaled before sending. Lost replies and unconfirmed launches
  are never automatically replayed, even when other tracking records change.
- A launch is confirmed only when the exact conversation registers in the target
  pane. A successful terminal write alone is not confirmation.
- A tracked conversation may be resumed again after a previously confirmed run
  exits. Unconfirmed attempts require inspection before retrying.

Every planned launch is preflighted, then its shell is checked again immediately
before delivery. Successful launches are not rolled back if a later one fails.
Registration checks happen after releasing the state lock so Pi hooks can finish.
Global and trusted project agent settings still apply.

## Optional manual snapshot backups

Ctrl+A then Ctrl+S saves an immutable backup snapshot. It is not needed for
normal tracking or resume. To inspect or resume an older backup, give its ID:

```sh
python3 ~/.config/rex/workspace.py save
python3 ~/.config/rex/workspace.py preview SNAPSHOT_ID
python3 ~/.config/rex/workspace.py restore SNAPSHOT_ID
```

Explicit snapshots retain their conservative replay protection. Native stable
pane IDs are preferred; completed legacy layout-restorer journals may identify
older remapped sessions only when tab order, labels, topology, and directories
still match. Ambiguity stops the operation. No replacement layout is created.
Keep old journals until their older snapshots are no longer needed.

Backups include labels, tiled layouts, directories, focus/zoom metadata,
registered conversation references, and known picker ownership. Layout metadata
is retained for inspection and legacy compatibility, not replayed. Control tabs
are excluded; floating layers are omitted with a warning. Failed or empty saves
do not replace the previous backup. Unsaved buffers, scrollback, and interrupted
shell commands are not recovered.

## Registration and private storage

Pi's global `rex-session.ts` extension reports exact conversation files. Codex's
SessionStart hook calls `agent-state.py codex`. PID, start-time, and ancestry
checks validate live reports before durable tracking changes. Pi conversations
without persisted session files cannot be resumed. Codex validates saved UUIDs
when resumed. No raw process arguments, terminal contents, prompts, conversation
text, or credentials are stored by this helper.

State lives under `~/.local/state/rex/workspace`, respecting `XDG_STATE_HOME`.
Tests can override it with `REX_WORKSPACE_STATE_DIR`.

- `tracked.json` holds durable, host/pane-scoped last-conversation references.
- `agents.json` holds process-verified live registrations per server instance.
- `resumes/` journals attempts per source/server instance. Tracking has a stable
  source ID, and each attempt is keyed by pane, harness, and conversation.
- `diagnostics/` holds owner-only resume traces, whose path is printed each time.
- `snapshots/` and `latest.json` hold optional backups, never required by default.
- `restores/` retains legacy layout-creation provenance for old backups.

Diagnostics contain metadata and API outcomes, never terminal contents, messages,
full command lines, or environment variables. Server calls require an explicit
local Unix address and disable autostart. Inside Rex, `REX_SERVER` supplies it.
Outside Rex, pass `--server unix:///absolute/path/to/server.sock` before the
command. Tracking for another host is never used.

## Checks

```sh
python3 -B -m unittest discover -s packages/rex -p 'test_*.py' -v
REX_WORKSPACE_INTEGRATION=1 python3 -B -m unittest discover -s packages/rex -p 'test_workspace.py' -v
```

Integration tests use a unique tmux session, Unix socket, Rex state, Pi config,
and `/bin/sh` login shell. They restart only that server and verify native layout
persistence and exact Pi resume using automatic tracking, without a manual save
or model calls. Unit tests cover shutdown retention, replacement conversations,
forgetting, host isolation, stale reports, drafts, and uncertain replay protection.
Authenticated Codex resume still needs manual verification.
