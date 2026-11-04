# Herdr workbench

The toolkit-owned Herdr-app setup. A repository tree contains tracked work,
with one main tab per session and expandable auxiliary tabs in Full.
See [the design contract](design/SPEC.md) and [the layout preview](layouts/toolkit-workbench.svg).

## Build and check

Requires Herdr-app 0.1.9 or newer with the installed `herdr.d.ts` API, hc,
Git, Worktrunk, and authenticated GitHub CLI. Mise supplies Node, Python, and Go.
The collector has no third-party Go dependencies.

```bash
mise install
mise run herdr:test
mise run herdr:lint
mise run herdr:check
mise run herdr:build
```

Pure policy, installer, and Go tests plus lint/vet join `mise run validate`.
The native render check is explicit because CI need not have Herdr installed.
It runs against temporary app homes, including populated Activity, expanded
Full, Close, and native picker fixtures. Herdr's headless check currently panics
when materializing virtual lists outside a rendered view, so picker checks render
the same rows eagerly. Verify the real scrolling list after live activation.
Checks do not create live terminals, install assets, or switch the person's layout.
Picker lifecycle tests use real Git and, when installed, Worktrunk with isolated
configuration and a synthetic Herdr app. They never contact the running app.

## Install, then explicitly activate

```bash
mise run herdr:install
mise run herdr:check-install
```

Installation links these toolkit-owned paths beneath `HERDR_APP_HOME`,
defaulting to `~/.config/herdr-app`:

- `mods/toolkit-workbench`
- `layouts/toolkit-workbench.json`
- `layouts/toolkit-workbench.svg`
- `bin/toolkit-github-status`
- `bin/toolkit-picker`

Icons and the layout preview are copied into the owned `assets/toolkit-workbench`
directory because
Herdr's asset sandbox refuses symlinks outside the app home. A checksum manifest
protects those copies. Reinstall to update assets; locally edited or unowned
assets are refused rather than overwritten. Previously managed assets are left
in place rather than deleted automatically. If an asset update is interrupted,
review or restore the managed directory before retrying.

The entire destination set is checked before any links are created. Ordinary
files and unrelated symlinks are refused, including broken unrelated links.
Existing user settings, keys, programs, shipped mods, and layouts are untouched.

Start with a one-off collector refresh, then select the layout explicitly:

```bash
~/.config/herdr-app/bin/toolkit-github-status refresh
herdr-app do layout.switch '{"name":"toolkit-workbench"}'
herdr-app status
```

Use `herdr-app do layout.switch '{"name":"main"}'` to return to the shipped
layout. Switching layouts does not close terminals. The permanent app escape
hatch is Ctrl+Alt+Shift+Escape.

Source edits are linked into the app. If a linked mod does not reload after an
edit, switch to `main` and back to `toolkit-workbench`. This recreates the sidebar
without closing any terminals. Copied assets require another install.

The optional keybinding example in `config/keys.example.json` is not installed
or merged automatically. Review existing keys before using it. Repository
display aliases are personal values in the sidebar's layout props.

## Using it

- The **eye button** switches between tracked Activity and Full. Its highlighted
  background means Activity is enabled. Hover it to see the current mode.
  All tab navigation is in the sidebar, with no duplicate tab strip above terminals.
- **Work** opens the native open-work picker. **+** opens the native project,
  worktree, and scratch browser. Opening a checkout through the project browser
  reactivates its default main session. Work-picker navigation alone does not
  change tracking. Neither picker depends on Television, Rex, or old Herdr plugins.
- A new tab in the same folder is auxiliary by default. Parent-terminal ancestry
  also groups agent-created tabs with their coordinator.
- **Full** exposes auxiliary tabs. **Main** changes the main tab; **Graduate**
  makes an auxiliary tab an independent tracked session.
- The tray icon dismisses idle work without terminating anything. **Activate**
  restores it. Focus and agent completion do not change tracking.
- The X closes a session after confirmation. Review the tabs and terminal count.
  Graduated sessions, files, and saved agent history are excluded. Ownership is
  rechecked between commands; a scope change or failed command stops further
  effects and reports that some earlier actions may already have completed.
- Drag the grip to reorder repositories or work within a repository. Release
  over the target row to insert before it. Escape cancels the drag.
- Status icons carry agent, Git, PR, review, check, and stale-data labels.
  Native hover tooltips are currently blocked by Herdr's window-root wiring.
  Visible labels and action text do not depend on tooltips.

The mod does not scrape terminal output, apply tmux-ai attention heuristics,
or use Herdr's transient settled/done states as Activity membership.

## Native pickers

Open from **Work** and **+**, or use these commands while the workbench is shown:

```bash
herdr-app do toolkit-workbench.work
herdr-app do toolkit-workbench.projects
herdr-app do toolkit-workbench.previous
```

`config/keys.example.json` contains optional bindings. Installation does not edit
live keys. The sidebar must be shown for mod commands to reach its listener.

The work picker lists every live tab, including auxiliary and dismissed work,
with done/blocked/working/idle priority, fuzzy search, pane roster, Git status,
and the selected tab's current terminal screen. Invisible subagents never alter
a main tab's status. Arrow keys or Ctrl+N/P/J/K move selection. Enter opens the
selected tab. Click selects and previews; Enter or **Open** opens. **Previous
tab** toggles back to the tab left through a successful picker selection. Closed
targets report an error without changing history. Ordinary sidebar clicks do not
update picker history.

The project browser scans immediate children of the roots in `config/picker.toml`.
To customize without editing the checkout, copy it to
`HERDR_APP_HOME/config/toolkit-picker.toml`. Scratch roots are listed separately.
Repository discovery refreshes every ten seconds, worktree/scratch lists and
selected previews every second, with no overlapping probes.

- Enter opens the selected checkout or scratch directory, including a scratch root.
- Ctrl+W browses worktrees or scratch directories.
- Ctrl+G opens a branch-name or scratch-directory form. **Create and open**
  explicitly authorizes checkout/directory creation and configured setup hooks.
- Ctrl+D removes a worktree and lets Worktrunk delete an integrated branch.
- Ctrl+K removes a worktree but retains its branch. It navigates upward outside
  the worktree browser.
- Ctrl+X force-removes a worktree, dirty files, and its unmerged branch.
- Ctrl+R refreshes. Escape returns from a form/sublist, then closes the dialog.
- **Open folder…** retains the system folder-picker fallback.

Every removal requires typing `yes` after seeing the path, mode, affected tabs,
and terminal counts. The primary checkout, locked worktrees, the invoking tab,
and tabs with panes or descendants in another checkout/folder are protected.
Fresh scope and ownership checks happen before effects and between acknowledged
commands. Unpaneled descendants terminate deepest first; independently paneled
sessions are separate boundaries. New tabs/terminals or changed ownership stop
removal. A partial failure leaves the checkout for inspection and reports that
earlier tabs may already be closed. Worktree removal deletes files, unlike
sidebar Dismiss or Close.

Creation fetches origin's current default branch without moving the local default
branch. Worktrunk runs pre-switch, creates the checkout with automatic hooks
suppressed, and opens a native tab running pre-start before post-start/post-switch
and a login shell. Worktrunk remains responsible for hook definitions, approvals,
worktree paths, and branch deletion policy. There is no automatic approval bypass.
If pre-start fails, no post hooks run. The terminal retains diagnostics and offers
a recovery shell after acknowledgment, without retrying setup. Run setup manually
only after inspecting/fixing the failure:

```bash
python3 ~/.config/herdr-app/bin/toolkit-picker setup \
  '{"path":"/absolute/checkout","base":"origin/main"}'
```

Use the actual origin default branch. Creation/open failures preserve the checkout
or scratch directory. Multiple already-open same-repo spaces are not merged.
Local opening prefers the existing default main tab, and remembers its checkout
after later directory changes. The work picker can navigate remote tabs and read
their screens; discovery and filesystem mutations are local, matching the old
picker's roots.

Creation/removal/opening run as finite background jobs to outlive Herdr's 30-second
exec limit. Requests, status, and bounded-view logs live privately under
`HERDR_APP_HOME/data/toolkit-picker/jobs/<id>/`. Closing the dialog does not cancel
a job. Reopen either picker to inspect its retained outcome. A job is never retried
automatically, including after an interrupted worker. After inspecting a stopped
job, **Back to picker** explicitly returns to browsing. A successful job whose
dialog was closed may already have opened its tab; inspect Full before retrying.
`tabs.json` in that state directory retains stable folder ownership. Herdr shared
keys `toolkit.picker.*` hold activation requests, last navigation, and the current
job ID. None of this runtime state belongs in Git.

## Collector and service

The collector runs independently of rendering, deduplicates worktree probes,
and never writes agent status or tracking state. It inspects only local terminals
referenced by Herdr-app, excluding other clients and remote machines. `hc get`
provides each foreground process's current directory, with the launch directory
as fallback when no foreground directory is available. The compact `hc ls`
listing alone is insufficient because it reports launch directories.
It probes Git and authenticated `gh pr view` with bounded subprocess output,
eight-second command deadlines with a one-second pipe-drain bound, and a
three-minute refresh deadline. Polling is
sequential and never overlaps. The minimum interval is one minute.

Runtime output is atomic, private JSON at
`HERDR_APP_HOME/data/toolkit-github-status/status.json`. Entries retain last-good
values on failures, with separate Git and PR errors and success timestamps.
A branch change clears the old PR association. No-PR results and probe failures
are distinct. Unknown checks never count as passing. The check badge represents
all returned checks, not a required-check-only policy. UI data older than 150
seconds or failed probes is visibly stale.

Foreground commands:

```bash
~/.config/herdr-app/bin/toolkit-github-status refresh
~/.config/herdr-app/bin/toolkit-github-status status
~/.config/herdr-app/bin/toolkit-github-status serve
```

For macOS, service operations are separate, explicit steps:

```bash
mise run herdr:service-install
mise run herdr:service-start
mise run herdr:service-status
# Stop only this collector:
mise run herdr:service-stop
```

The generated launchd definition stays outside Git under
`~/Library/LaunchAgents/com.corymhall.toolkit.herdr-github-status.plist`.
Installation records the current PATH so launchd can find Git, gh, hc, and
herdr-app. Reinstalling a changed definition is refused until it is reviewed.
The service is not started by asset installation or validation. After rebuilding
an installed collector, explicitly stop and start this service to load the new
binary. A one-off refresh does not replace an already-running process.
On other systems, supervise `serve` with the platform's process manager.

A single-writer directory lock protects refresh/serve. A forced termination
may leave `collector.lock` behind. Inspect the service and running process
before removing that lock. Do not run refresh concurrently with the service.
Logs are in the collector's private state directory. Authorization failures
remain visible as stale metadata; reconnect GitHub through `gh auth login`
rather than inspecting credential files.

## Runtime boundaries and first-version limits

Session membership, main assignments, dismissal, and manual order are persisted
by Herdr in the namespaced shared key `toolkit.workbench.v1`. Runtime IDs, metadata,
logs, generated service files, and credentials do not belong in this repository.

Existing tabs are inferred on first use because Herdr has no main/auxiliary
concept. Review the initial Full view and use Main or Graduate where needed.
With a collector snapshot, Git identity groups linked worktrees under their
repository; without one, folder names are temporary fallback headings. Existing
explicit session membership is never merged merely because metadata arrives.
Offline or absent tabs are not rendered, but their saved identity is retained.

Remote tabs can be listed from Herdr's live data, but the local collector does
not probe remote GitHub metadata. Such rows show metadata as unavailable.
An installed native render check does not prove painted layout or live command
execution. After explicit activation, inspect the sidebar and `herdr-app status`.
Validate destructive behavior only with disposable, user-authorized sessions.
The original Rex prototype and private snapshots are not installed or needed.
