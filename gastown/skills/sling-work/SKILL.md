---
name: sling-work
description: Dispatch bounded work to another Gas Town worker and either monitor it to completion or record it for later follow-up. Use when you need to sling review, research, or implementation work and want a repeatable way to launch, monitor, retry, and report status.
---

# Sling Work

Dispatch work to another worker while keeping orchestration ownership in the
current session.

This skill is generic. It does not define the work itself. It helps you:

- sling a sidecar task and monitor it until the result is usable
- sling work now and intentionally come back to it later

Use this when the main session should stay in charge of launch, status, and
follow-up.

Use `workflow-cheatsheet` instead when the user asks for a named saved
workflow such as the PR sling workflow.

## Modes

### 1. Monitor To Completion

Use this when the slung worker's output is needed in the current session.

Typical examples:
- sidecar review producing report files
- sidecar research producing a draft artifact
- bounded worker task whose result will be integrated immediately

### 2. Dispatch And Return Later

Use this when the work should start now but does not block the current session.

Typical examples:
- implementation work assigned to a polecat
- long-running investigation you will check later
- asynchronous follow-up where ownership should move to the assignee

## Inputs To Establish Before Launch

1. What exactly is being slung?
- a bead
- a formula/molecule
- a worker task with concrete vars/args

2. Who should receive it?
- explicit worker target when you care which worker owns it
- rig target when any suitable worker is fine

3. What visibility does the worker need?
- shared committed state
- shared artifact files
- or just the hooked instruction payload

4. What counts as done?
- expected output files exist
- hooked bead closes
- worker reaches idle state with the expected notes/artifacts
- or the work is intentionally only launched and handed off

Do not launch until these are clear enough to monitor honestly.

## Non-Negotiable Rules

1. Keep orchestration ownership in the current session.
2. Do not assume fresh slung workers can see this session's dirty workspace.
3. If the worker must inspect exact current state, materialize that state first
   in committed form or shared artifacts.
4. Define the terminal condition before you launch.
5. If you monitor, use `gt peek` as the primary live-progress signal.
6. Do not nudge a worker to hurry or send the report until `gt peek` shows the
   worker is idle, stuck at the initial prompt, or otherwise no longer making
   progress on the assigned work.
7. If a worker says it sent mail or produced an artifact and you cannot find it
   yet, treat that as a coordination problem to investigate, not permission to
   move on.
8. If a worker stalls at the initial prompt, nudge once before calling it a
   failure.
9. When launching multiple sidecars, prefer distinct targets or sequential
   launch confirmation so hooks do not race on one idle worker.

## Workflow

1. Classify the launch.
- Choose `monitor-to-completion` or `dispatch-and-return-later`.
- See [references/setup.md](references/setup.md).

2. Prepare visible inputs when needed.
- Materialize shared files or checkpoint state if the worker must inspect them.
- See [references/setup.md](references/setup.md).

3. Launch with `gt sling`.
- Record the worker target, output location, or follow-up surface you expect.
- See [references/setup.md](references/setup.md).

4. Either monitor or hand off.
- For monitor mode, follow the polling and retry loop.
- For dispatch-later mode, record what was launched and what to check later.
- See [references/monitoring.md](references/monitoring.md).

5. Handle failure honestly.
- Retry only when the failure mode is clearly transient.
- Otherwise report the blocker with the failing command/signal.
- See [references/failure-handling.md](references/failure-handling.md).

## Output Contract

Always report:

1. Launch summary:
- what was slung
- target used
- mode selected

2. Visibility summary:
- whether shared artifacts or pushed state were required
- where the worker is expected to read/write

3. Status summary:
- for monitor mode: terminal result, retries, and produced artifacts
- for dispatch-later mode: what to check later and where

## Example Shapes

### Monitor A Review Worker

- materialize review inputs into a shared `.runtime` directory
- sling the review worker
- monitor with `gt peek`, `gt hook show`, and expected report-file checks
- synthesize only after the reports exist

### Sling A Work Bead And Return Later

- sling the bead to the target rig/worker
- confirm the hook landed
- record the assignee and next follow-up check
- continue with other work instead of waiting
