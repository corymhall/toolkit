# GitHub PR status and CI working sets

An above-input PR panel and background CI monitoring for Pi. Requires authenticated
`gh`, Git, and GitHub.com. No additional service or runtime dependency is needed.
GitHub Enterprise is not supported. Explicit PR and Actions URLs also work outside
a checkout.

The extension observes CI. It never reruns jobs, merges or edits PRs, pushes commits,
or intercepts shell commands. Stack ordering is descriptive, not merge orchestration.

## Three ways to watch

- **Automatic current PR.** New conversations default to watching the current
  branch's PR across commits and reruns. Switching branches detaches the old
  automatic target. `/pr unwatch` disables this preference until `/pr watch`,
  including across reloads, session resumes, and navigation along the active
  conversation branch. The preference is saved even without a PR.
- **Persistent PR subscriptions.** Explicitly selected working-set PRs follow new
  heads and reruns independently of the checked-out branch. Failures and green
  results do not end monitoring. Subscriptions restore active after reload or
  resume, unless paused because notification delivery was uncertain. Subscribe
  again or use resume to unpause without replaying recorded results.
- **Bounded waits.** Explicit waits remain commit-pinned and end on failure,
  settled results, superseded heads, closure/merge, deadline, or access error.
  Default timeout is sixty minutes, configurable from one to 240. Unfinished
  waits restore paused. Resume preserves the original head and deadline.

Starting a wait for an already subscribed PR reuses its subscription and does not
impose a deadline. The automatic subscription similarly owns the current PR while
enabled. Actions runs support bounded waits only. Workflow waits follow the latest
attempt and wait for the workflow itself to complete, not merely its visible jobs.
A workflow result says nothing about the whole PR's CI.

Up to eight targets are tracked. Active and paused watches are never evicted.
Inactive historical observations and their receipts may be evicted to make room.
Merged and closed subscriptions end. Live monitoring ends with the Pi process.

## Agent controls

`github_ci_watch` is exposed through codemode. Use `subscribe` for coordinating a
stack or multiple PRs:

```typescript
await tools.github_ci_watch({
  action: "subscribe",
  targets: [
    { url: "https://github.com/owner/repo/pull/41", label: "Bridge", order: 1 },
    { url: "https://github.com/owner/repo/pull/42", label: "Provider", order: 2 },
    { url: "https://github.com/owner/repo/pull/43", label: "SDK", order: 3 },
  ],
});
```

Labels and ordering are optional. They describe the working set without inferring
stack dependencies. Re-subscribing updates metadata and reuses delivery receipts.

Actions are `subscribe`, `start`, `resume`, `status`, and `cancel`. A single legacy
`target` URL or a batch `targets` array is accepted, never both. URLs and duplicate
targets are validated before starting operations. Batches return individual
successes or errors. Successful operations are not rolled back if another fails.

- `subscribe` requires explicit PR targets and has no deadline.
- `start` and `resume` default to the current PR when targets are omitted.
- `status` without targets inspects every tracked entry, including inactive ones.
- `cancel` without targets stops all watches and disables automatic watching.
  Cancelling the current PR also disables the automatic preference. Other
  subscriptions remain independent.
- `timeoutMinutes` applies to bounded waits only.

Results include `status`, a human-readable `message`, `tracking`, and per-target
operation `results`. Check errors in `results`, even if the tool call completed.
`tracking` contains the automatic preference, current target, discovery error, and
structured targets with mode, watch status, CI state, observed and watched heads,
observation time/age, check counts, the five highest-priority checks, omitted-check
count, latest outcome, errors, label, and order. Status text fields and check excerpts are bounded. Check
keys are stable hashes. Full checks and logs remain available through GitHub tools.
Observations are not fresh reads on demand. Starting a watch performs an initial read.

```typescript
await tools.github_ci_watch({ action: "status" });
await tools.github_ci_watch({
  action: "start",
  target: "https://github.com/owner/repo/actions/runs/123",
  timeoutMinutes: 60,
});
```

Starts return after initial observations. Continue other work or end the turn.
Results arrive automatically. Do not repeatedly poll, sleep, or use `gh run watch`.

## Notifications and confirmation

New failed check executions, required actions, and settled results produce visible
follow-ups. Results discovered during one polling cycle are grouped into one
message identifying every PR and watched commit. These start a turn when Pi is
idle or queue behind active work. Progress updates never invoke the model.

Unchanged failures stay quiet. Green requires two unchanged observations at least
fifteen seconds apart. Empty checks, skips, and cancellations do not count as
passes. A new observed head or changed execution invalidates old confirmed green.

When multiple watched open PRs all have fresh, confirmed passing CI, their result
message also announces that the working set passed. Paused, stale, unobserved, or
unconfirmed PRs prevent that announcement. Additional workflows can register
later. Green is not merge authorization or proof of required-check policy.

Preferences and delivery receipts live outside model context in the Pi session.
Reloading does not replay recorded red or green results. Receipts retain only the
latest execution of each named check, rather than an unbounded event history.
If notification delivery cannot be confirmed, affected watches pause rather than
blindly retrying a potentially queued message. Resume explicitly. Previously
recorded executions are not replayed.

Failure logs are untrusted evidence. Terminal controls are stripped. Excerpts
cover up to three newly failed jobs per target, roughly 2,000 characters per job.
Complete accepted logs remain private under `pi-github-ci-*` in the system temp
directory. Oversized or unavailable logs fall back to links. There is no automatic
log deletion or mutation retry.

## Commands and inline display

| Command                | Behavior                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `/pr` or `/pr details` | Toggle compact and expanded inline details                  |
| `/pr expand`           | Toggle expansion, showing a hidden panel                    |
| `/pr hide`             | Toggle visibility without stopping monitoring               |
| `/pr focus URL`        | Expand check details for a tracked target                   |
| `/pr focus current`    | Return details selection to the current branch              |
| `/pr subscribe URL...` | Add persistent PR subscriptions                             |
| `/pr watch`            | Enable automatic current-PR watching                        |
| `/pr unwatch`          | Disable automatic watching and dismiss current-PR attention |
| `/pr watch URL`        | Start a bounded wait for another PR or Actions run          |
| `/pr unwatch URL...`   | Cancel the selected targets                                 |
| `/pr resume [URL]`     | Resume a paused subscription or bounded wait                |

With several targets, the compact panel shows aggregate state and the target
needing the most attention. Expansion shows ordered rows with optional labels,
current-branch and selected-detail markers, and selected-target checks. Rows stay
in explicit order, or insertion order when unordered, as CI changes. Failed,
blocked, running, stale, paused, off, and terminal states are distinct. Single-PR
details distinguish confirmation from visible passing checks.
Overflow is counted explicitly. Very short terminals retain the compact summary.
Use tool status for the complete set.

The widget lives above the input and never captures focus or changes the draft.
It uses at most a third of terminal height, capped at fourteen lines. Detail space
prioritizes failed and blocked checks. Labels link to GitHub when OSC 8 hyperlinks
are supported. Complete check lists and logs remain available on GitHub and
through the existing GitHub tools. Review state is not approval.

## Rex and terminal status

On Pi 1.4+, watched CI participates in native OSC 7501 program status. Rex uses
that for tab and session indicators. Pi owns support detection, encoding, and
delivery. Older Pi versions and unsupported terminals retain the widget and
monitoring. RPC, print, and JSON modes never emit terminal status.

The extension shares a compositor with the command runner, using the public
`Terminal.setProgramStatus` method. While Pi rests, blocked CI wins over pending
commands, which win over green CI. Across CI targets, blocked wins over working,
then done. Pi active work, compaction, dialogs, authentication prompts, and native
errors retain precedence. Taking over a failure hands status back to Pi until the
agent fully settles, without deleting panel evidence.

Paused, cancelled, superseded, and old-commit targets do not contribute terminal
attention. Hiding the panel does not disable reporting. Reload, session
replacement, and shutdown restore the original terminal setter and native status.

## Refresh and recovery

Local branch/head discovery runs about every fifteen seconds. GitHub PR discovery
is cached for a minute unless local identity changes, and revalidates that identity
after lookup. Active watches refresh about every fifteen seconds, passive snapshots
about once a minute. Reads of one target never overlap. Each read cycle is bounded
to sixty seconds, each subprocess to twenty seconds and 8 MiB of output. Pagination
is followed, with an explicit error rather than silent truncation beyond 5,000
contexts or jobs.

Transient errors retain observations and back off up to two minutes. Stale data
is labeled rather than shown as fresh green. Subscriptions report a changed access
error once and continue backed-off reads so they can recover after authentication
is fixed. Bounded waits end on access errors. Reauthenticate with `gh auth login`
as appropriate. The extension never reads credential files or configures another
connection.

Polling stops on reload, session switch, tree navigation, and shutdown. Late
responses are ignored. Print and JSON modes cannot start monitoring. RPC supports
monitoring without terminal widgets.

## Local activation and checks

The toolkit manifest includes this extension. Existing individual-path installs
only need `/reload`. Adding it to a Pi configuration that does not have it installed
requires explicit activation with `pi install ./extensions/github-pr/index.ts`
from `packages/pi`, followed by reload.

```bash
mise x -- npm run test:github-pr --workspace @corymhall/pi-toolkit
mise run validate
```

Tests cover subscription lifetime, reload receipts, grouped delivery and uncertain
delivery, restacks, aggregate confirmation, batch controls, focused bounded layout,
existing bounded waits, pagination, and native status handoffs. Synthetic checks do
not establish real-service acceptance of automatic repair or painted TUI layout.
