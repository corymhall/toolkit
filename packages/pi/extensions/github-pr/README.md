# GitHub PR status and CI watches

A PR widget above the input and background CI monitoring for the agent. The
current branch PR is watched automatically by default, independently of whether
its panel is open. New commits and CI reruns are followed without rearming.

Requires authenticated `gh`, Git, and a GitHub.com checkout. Explicit GitHub.com
PR and Actions run URLs also work outside a checkout. GitHub Enterprise is not
supported. No additional runtime dependency or service is needed. Nothing
intercepts shell commands, reruns jobs, edits PRs, pushes commits, or changes the
composer, footer, Herdr layout, or Rex configuration.

## Automatic watching

Automatic watching belongs to the Pi conversation. New conversations start with
it on. `/pr unwatch` turns it off until `/pr watch`, including across reloads,
session resumes, and tree navigation along that conversation's active branch.
The preference is saved even if no PR exists yet. `/pr` only toggles the panel.

With watching enabled, the tracker discovers the current branch PR, reports
newly failed check executions or required actions, and reports settled results.
It keeps monitoring after those messages. Unchanged failures stay quiet. New
reruns, checks, and commits can produce new results. Green results require two
unchanged observations at least fifteen seconds apart. Skips and cancellations
are not counted as passes, and empty check sets never mean success.

Delivery receipts are stored outside model context with the preference. Reloading
or resuming does not replay already recorded red or green results. Only the
latest execution of each named check needs a receipt; repeated reruns do not
build an unbounded event history. Changing branches detaches the previous
automatic target. Returning to it reuses its receipts when still available.
Historical receipts can be evicted when the eight-target tracking limit is full.

Messages arrive as visible follow-ups, starting a turn when idle or queuing
behind active work. Progress updates do not invoke the model. CI is observed,
not repaired or rerun by the extension. Additional workflows may register later,
and a green result is not merge authorization or proof of required-check policy.

If delivery cannot be confirmed, that automatic target is paused instead of
blindly retrying a potentially queued message. Inspect the panel and use
`/pr watch` to resume future monitoring. Previously recorded executions are not
replayed by re-enabling watching.

## Commands and inline UI

| Command                | Behavior                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `/pr` or `/pr details` | Toggle compact and expanded inline details                          |
| `/pr expand`           | Toggle expansion, showing a hidden panel                            |
| `/pr hide`             | Toggle visibility without stopping monitoring                       |
| `/pr watch`            | Enable persistent automatic current-PR watching                     |
| `/pr unwatch`          | Disable automatic watching and dismiss current-PR attention         |
| `/pr watch URL`        | Start an explicit wait for a PR or Actions run                      |
| `/pr unwatch URL`      | Cancel that target; the current PR also disables automatic watching |
| `/pr resume [URL]`     | Resume a saved paused explicit wait                                 |

The panel lives directly above the input, pushing the conversation up instead
of covering it. It never captures focus or changes the draft. Expansion uses
at most a third of the terminal height, capped at fourteen lines. It shows the
PR title, commit, observation age, counts, automatic/watch state, and prioritized
failed/blocked/pending checks. Other watched targets and review/merge metadata
appear when space allows. Unknown review information is not approval.

There is no popup or special arrow-key mode. PR and check labels link to GitHub
when the terminal supports OSC 8 hyperlinks. Full check lists and logs remain
available there or through the existing GitHub tools.

## Explicit waits and agent tool

`github_ci_watch` is available through codemode for status, cancellation, or
explicit targets outside the current branch's automatic subscription:

```typescript
await tools.github_ci_watch({
  action: "start",
  target: "https://github.com/owner/repo/actions/runs/123",
  timeoutMinutes: 60,
});
```

Actions are `start`, `resume`, `status`, and `cancel`. Start/resume without a
target selects the current branch PR. Status/cancel without a target selects
all tracked targets. Cancel without a target also disables automatic watching.
Status includes the saved automatic preference. Targets must be full URLs.

The automatic subscription owns the current PR while enabled. Starting a wait
for that PR reuses it and does not impose a deadline. With automatic watching
disabled, or for another PR/run, an explicit wait is commit-pinned and bounded,
with a default sixty-minute deadline, configurable from one to 240 minutes.
Multiple explicit targets are supported, up to eight tracked entries. Active
and paused explicit waits are not evicted to make room.

A bounded wait ends once on a failed check, observed completion, changed head,
closure/merge, deadline, or access error. Changed heads are reported as
`superseded` rather than silently followed. A workflow wait observes its latest
attempt and waits for the workflow itself to complete, not merely its visible
jobs. A workflow result does not establish that the whole PR passed.

Starting returns after the initial snapshot rather than blocking until CI ends.
The agent can continue other work or end its turn. Results arrive automatically;
no repeated tool calls, sleeps, or `gh run watch` are needed.

## Rex and terminal status

With Pi 1.4 or newer, watched CI also participates in Pi's native OSC 7501
program status. Rex uses this for tab and session indicators. Pi's terminal
implementation owns support detection, encoding, and delivery. Unsupported
terminals and older Pi versions keep the widget/watch behavior without this
reporting. RPC, print, and JSON modes never emit terminal status.

The extension shares a terminal status compositor with the command runner,
composing one root record through the public `Terminal.setProgramStatus` method.
While Pi rests, blocked CI wins over pending commands, and pending commands win
over green CI. It does not send competing child records,
write raw escapes, or change Rex configuration. Pi's active work and compaction
win over CI. Native dialogs, authentication prompts, errors, and clears retain
their original meaning.

While Pi rests, red CI reports `blocked`, pending CI reports `working`, and
confirmed green CI reports `done`. Across targets, blocked wins over working,
then done. An agent taking over a failure hands status back to Pi immediately,
without deleting the failure from the panel. CI status returns when the agent
fully settles. A rerun returns green CI to working without ending its automatic
subscription.

Only active automatic targets and explicit watches affect terminal attention.
Paused, cancelled, superseded, and old-commit targets do not. `/pr unwatch`
dismisses CI attention without deleting observations or diagnostics. Hiding the
panel does not disable reporting. Reload, session replacement, and shutdown
restore the original terminal setter and last native Pi status.

## Refresh, recovery, and lifetime

Local branch/head discovery runs about every fifteen seconds. GitHub PR discovery
is cached for a minute unless the local branch/head changes, and revalidates the
local identity after lookup. Active subscriptions/waits refresh about every
fifteen seconds; passive/off snapshots about once a minute. Reads for one target
never overlap. Automatic subscriptions have no overall deadline, but every
read cycle is bounded to sixty seconds. Each subprocess has a twenty-second
bound and an 8 MiB output limit. Pagination is followed, with an explicit error
instead of silently truncating beyond 5,000 contexts/jobs.

Transient read errors keep the last observation and back off up to two minutes.
Stale data is labeled instead of shown as fresh green. Automatic watching
reports a changed access error once and continues bounded, backed-off reads, so
it can recover after authentication is fixed. Bounded explicit waits end on
access errors. Reconnect with `gh auth login` as appropriate. The extension never
reads credential files or configures an alternative connection.

All polling stops on reload, session switch, tree navigation, or shutdown, and
late responses are ignored. Enabled automatic watching resumes from the active
branch's saved preference and receipts. Explicit unfinished waits restore paused;
`/pr resume URL` preserves their original commit and deadline. Live polling ends
with the Pi process; saved preferences, receipts, and explicit wait intent remain
in the session. Print and JSON modes cannot start monitoring; RPC supports it
without terminal widgets.

Failure logs are untrusted evidence. Terminal controls are stripped. Excerpts
cover up to three newly failed jobs, roughly 2,000 characters per job. Complete
accepted logs are private files under `pi-github-ci-*` in the system temporary
directory. Oversized/unavailable logs fall back to links. There is no automatic
log deletion or mutation retry.

## Local activation and checks

The toolkit package manifest includes this extension. If Pi settings list
individual extension paths, activate it with:

```bash
pi install ./extensions/github-pr/index.ts
```

Then run `/reload`. An already-installed local extension only needs reload.

```bash
mise x -- npm run test:github-pr
mise run validate
```

Tests cover automatic defaults, durable opt-out and deduplication, new commits
and reruns, branch changes, late cancellation, explicit wait deadlines,
pagination, stale data, narrow inline rendering, and native/CI status handoffs.
Live read-only GitHub checks and synthetic Rex protocol tests do not establish
real-service acceptance of automatic agent repair or interactive painted layout.
