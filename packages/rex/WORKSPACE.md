# Agent tracking and resume

Rex restores sessions, tabs, panes, and working directories as fresh shells.
The Go CLI remembers the last Pi/Codex conversation per pane and resumes it
only when requested. Nothing automatically relaunches agents.

- Ctrl+A then Ctrl+R runs `toolkit rex workspace restore`.
- Ctrl+A then Ctrl+S runs `toolkit rex workspace save`, an optional backup.
- The command palette exposes a read-only preview.

```sh
toolkit rex workspace preview
toolkit rex workspace restore
toolkit rex workspace forget
toolkit rex workspace track
toolkit rex workspace save
toolkit rex workspace preview SNAPSHOT_ID
toolkit rex workspace restore SNAPSHOT_ID
```

Restore previews the plan and requires typing `restore`. It rechecks and prints
the current plan after confirmation, so conversations started while the prompt
was open are skipped. It never creates,
closes, renames, or focuses sessions or panes. Native IDs identify the existing
session, tab, and tiled pane. Missing IDs fail closed. Old legacy snapshots
requiring remapped layout IDs must be inspected manually; no layout remapping
or recreation is attempted.

Each launch checks the agent executable, exact conversation file/ID, working
directory, process identity, and an empty shell prompt with no fullscreen app.
Drafts, busy agents, changed directories, and missing prerequisites are skipped.
A saved Pi header must identify the exact saved conversation. Only plain `❯`,
`$`, `%`, `#`, `>`, `➜`, and versioned sh/bash/zsh prompts are recognized. Other
prompt styles require manual resume. Captured commands and environment are
never replayed.

Attempts are journaled before terminal delivery. Missing acknowledgements are
uncertain and never automatically retried. An exact live conversation registration
confirms the launch. The state lock is released while waiting for registrations.
A confirmed tracked conversation can resume again after it exits; an explicit
backup snapshot cannot be blindly replayed.

## Registration and storage

Pi's `rex-session` extension runs `toolkit rex workspace register-pi` at lifecycle
boundaries and `unregister-pi` at shutdown. Codex's SessionStart hook invokes
`register-codex`. Payloads arrive on stdin. Only allowlisted identity and resume
metadata is retained, never prompts or tokens. A Pi without a saved session file
clears the pane's old reference. The most recently verified pane owns a conversation.

Private state stays in `~/.local/state/rex/workspace`, respecting
`XDG_STATE_HOME` and the explicit `REX_WORKSPACE_STATE_DIR` override:

- `tracked.json` holds host/pane-scoped conversation references.
- `agents.json` holds process-verified registrations per running server instance.
- `resumes/` journals attempts. `diagnostics/` records allowlisted launch metadata.
- `snapshots/` and `latest.json` hold optional backups.

The existing version-1 JSON state remains readable. Go replaces the Python
implementation, not the storage format. Endpoint discovery for messaging stays
under `rex/agent-input` and the Pi extension still owns those private sockets.

Server calls require a local Unix address from `REX_SERVER` or the
`toolkit rex --server unix:///path/server.sock` flag and never autostart a server.
Install the CLI with `mise run install:toolkit`; reload existing Pi sessions
after updating the lifecycle extension. `TOOLKIT_CLI` can select an explicit
absolute CLI path before starting Pi.

## Validation

`mise run test:go` exercises real message sockets, uncertain acknowledgement,
tracking ownership, session mismatch, cancellation, and replay guards. Use
`toolkit rex agents` and `toolkit rex workspace preview` for non-mutating live
inspection. Full interactive restart/resume is a manual acceptance check; there
is no parallel Python or tmux integration-test server.
