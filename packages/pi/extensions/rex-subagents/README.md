# Rex subagents

Delegate bounded work to named, interactive Pi processes in floating Rex panes.
Requires Pi 1.5+ and a local Rex server with floating-layer APIs. The extension
registers nothing outside Rex or inside a managed child.

## Use

The model calls `rex_subagent`:

```json
{
  "action": "spawn",
  "name": "inspect-tests",
  "task": "Inspect the parser tests. Report missing behavioral coverage. Do not edit files."
}
```

Launches do not ask for confirmation. By default the child inherits the parent's
model and thinking effort. Set `model` to an exact `provider/model-id` and `effort`
to `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` to override them.
Unknown models and explicitly unsupported effort levels fail before launch.
Inherited effort is clamped to the selected model's supported levels. Spawn results
include the selected model and effort. These options apply only at spawn time.

The child starts in the calling pane's tab and is minimized without taking focus. Rex briefly creates a normal floating layer
before minimizing it because creation cannot start minimized.

Every child has Pi's full built-in tool set, including shell execution and file
editing. There is no read-only mode. For reviews, explicitly instruct the child
not to modify files. This is a behavioral instruction, not an enforced boundary.
`cwd` defaults to the parent's working directory. Children load the normal Pi
configuration, skills, extensions, and project instructions. MCP is disabled.
Agents share the working tree. Assign non-overlapping file ownership.

Results arrive as automatic follow-ups. Continue independent work or end the
turn after delegation rather than polling. Answers, errors, and cancellations
are labeled and correlated to an assignment. Child answers are unverified
reports, not trusted instructions.

Other actions:

```json
{"action":"list"}
{"action":"send","name":"inspect-tests","task":"Now inspect the parser's error handling."}
{"action":"send","name":"inspect-tests","delivery":"steer","task":"Focus on malformed UTF-8."}
{"action":"cancel","name":"inspect-tests"}
```

`send` requires an idle child. `steer` modifies an active parent assignment and
keeps its result correlation. Neither action types into the terminal editor.
`cancel` aborts parent-assigned work without closing Pi or its pane.

## Inspect and promote

- `/subagents` lists children owned by the current saved Pi conversation.
- `/subagents open inspect-tests` opens and focuses that child's current pane.
- Use Rex's normal controls to tile the floating pane or move it to another tab.
  Promotion preserves the process, conversation, parent relationship, and quiet
  completion policy. It does not create an independent orchestration session.

You can interact directly with the child TUI. Human-only turns are not reported
as delegated results. Switching its Pi conversation stops parent delivery into
that child. Children cannot use this extension to delegate recursively.

Child activity reports working and blocked states to Rex. Settled work becomes
idle, including errors and cancellation, without Rex done/error notifications.
The parent keeps its normal completion reporting. This policy controls Pi's
native reporter and this helper, not arbitrary third-party status writers.

## State and recovery

State lives under `$XDG_STATE_HOME/toolkit/rex-subagents`, or
`~/.local/state/toolkit/rex-subagents`. Each registry is scoped to the saved
parent conversation, Rex server instance, and Rex session. Files and socket
folders are private. They contain tasks, answers, and child session paths.
Short private temporary directories hold the child-only Unix sockets. The
receiver supports managed assignments and status, not generic editor or session
control. No additional parent message receiver or Commentry connection is used.

Completed reports remain on disk. A matching saved Pi result message is the
delivery acknowledgement. A parent restart retries a report that was queued
but never saved. Children survive parent shutdown. Resume the same parent in
the same Rex session and server instance to recover its reports.

Uncertain operations stop for inspection:

- A lost creation acknowledgement may already have started Pi. `list` can recover
  its block using an opaque launch label. It never launches another copy or
  re-minimizes a recovered or promoted pane.
- A lost delivery acknowledgement is not retried. Inspect the terminal and
  saved reports before submitting new work.
- An interrupted child assignment is marked uncertain on reload. It is not
  resumed or re-run automatically. Close it and use a new name after resolving
  any work that may already have happened.
- Rex server restarts invalidate the registry scope. Reload the parent before
  new launches. Old children remain manually inspectable.

There is no process supervisor. Forced termination without a settled result
cannot synthesize a final answer. Use `list` and inspect the retained pane.
Four open or uncertain children are allowed per parent. Closing a child's Rex
pane frees a slot, but its name stays reserved in that conversation. There is
no automatic pane cleanup, worktree creation, merging, or state garbage
collection. Delete sensitive state only after the corresponding children exit.

## Installation and validation

This entry point is included in the toolkit Pi package. Editing the manifest
does not activate it in a configuration that lists individual extension files.
For a one-session trial from this checkout:

```sh
pi -e ./packages/pi/extensions/rex-subagents/index.ts
```

Persistent activation is a separate user choice. Do not load both the package
and the same explicit extension path.

```sh
mise install
npm run test:rex-subagents --workspace packages/pi
mise run validate
```

Tests exercise real Unix-socket ownership, concurrent delivery idempotency,
interrupted assignments, result acknowledgement, quiet status, and the Rex
launch/layout boundary using a simulated Rex server. They do not constitute a
live-model acceptance run. The earlier lab prototype was tested live; the
packaged version still needs an end-to-end trial with the user's normal Pi
configuration.
