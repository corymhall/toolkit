# Delegate

Run `/delegate <instructions>` inside Pi in Rex. A floating Television picker lists Git projects from your existing Rex picker configuration. Select a project, enter a new branch name, then confirm worktree creation, repository hooks, and the Pi launch.

The Rex picker fetches the default branch from origin, creates a Worktrunk worktree, and opens a tab in the repository's Rex session when possible. It creates a repository session if needed. The new Pi conversation starts only after setup hooks succeed. For delegated launches the picker waits for post-start and post-switch hooks in the foreground, while ordinary picker actions keep their existing behavior. Its initial prompt contains your instructions and a saved source-session reference for Evaler, using the same formatting as Ctrl+S. It does not fork the conversation, copy uncommitted changes, use the clipboard, or type into another terminal.

This is a command-only extension. The model cannot invoke delegation. Ctrl+S keeps its existing behavior.

## Requirements

This is a local-machine workflow. The Rex server must be able to access the same checkout, Pi installation, and saved session files. Requires Python 3.11+, Television, Worktrunk, Git, and the updated local Rex `picker.py` from the config repository. The destination Pi must have Evaler and its skill available. Normal destination project-trust checks remain enabled.

The picker defaults to `~/.config/rex/picker.py`. Set `TOOLKIT_REX_PICKER` to an absolute file path before starting Pi to override it. The picker must expose `create_worktree(repo, command=None, branch=None)` and support the optional JSON argv argument to its `setup` subcommand. It owns all worktree lifecycle behavior, hooks, checkout tracking, and Rex session selection.

Pi launches using the current runtime, supporting standalone and Node installations without copying the source process's resume or session flags. An interactive login shell gives Pi its own foreground process group so Rex can identify it and show its emblem. The shell exits when Pi finishes. Instructions are passed as a literal initial prompt argument. Source sessions must be saved. Handoff prompts are limited to 32 KB. The private temporary request is consumed by the popup once.

Escape or an empty branch cancels before creation. A failed setup leaves the checkout and diagnostic tab for inspection and does not start Pi. If popup creation has an uncertain response, inspect Rex and the reported handoff path before retrying. No automatic rollback, retry, or worktree deletion occurs. The source extension reports only that the picker opened, not that setup or Pi startup completed.

Install with `pi install /absolute/path/to/toolkit/extensions/delegate/index.ts`, then `/reload`. This does not activate the extension automatically for existing configurations.

## Validation

`npm run test:delegate` checks launch argument handling, session references, picker selection, cancellation, and delegation to the existing lifecycle. The config repository's `config/rex/test_delegate.py` checks that hooks finish before Pi starts and hook failure prevents launch. A real PTY regression test also verifies foreground process-group ownership and literal argument forwarding. It does not assert the visual Rex emblem. Live worktree creation and agent startup require a manual smoke test because they run repository hooks and start an external agent.
