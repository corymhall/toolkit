# Agent Instructions

## Workstation Configuration

Read `docs/workstation.md` before editing installation or configuration composition.
Public settings live under `dotfiles/`; instruction and MCP inputs live under `agent-config/`.
`packages/agent-config` is the sole writer for composed files. Never declare those outputs
as mise dotfile links. Private inputs are explicitly selected external paths and must never
be copied into this checkout. Keep validation and preview separate from home installation.
The terminal integration lives under `packages/rex`.
Pi extensions and their package manifest live under `packages/pi`.

## Monorepo Tasks

Each component owns its tasks in `packages/<name>/mise.toml`. The root aggregates
checks and tests through `//packages/...:<task>` dependencies. Do not add nested
`mise run` commands for task orchestration. Register non-Node components in the
root workspace graph, and declare runtime dependencies between components.
See `docs/workstation.md` for caching and dependency rules.

## Repository Scripts

Verify local configuration generators and installers by running their real preview/install
workflow and inspecting the output. Do not add mock-filesystem unit-test suites around this
glue. Reserve behavioral tests for reusable extensions and components.

## Skill Management

This repository is organized around self-contained Agent Skills:

- `skills/` contains skills shared by Pi, Codex CLI, and other
  Agent-Skills-compatible harnesses. Skills may be grouped in nested
  directories; each directory containing `SKILL.md` is an individual skill.
- `.agents/skills/<skill-name>/` contains reviewed third-party skills managed by
  APM or a focused repository updater; do not edit vendored copies by hand.
- References, scripts, assets, and metadata owned by a skill belong inside that
  skill directory.

Do not recreate the old Codex CLI plugin marketplace structure. Runtime-neutral
skills are the primary product; avoid harness hooks and extensions when a normal
CLI or externally managed process provides the same capability. Skill-owned CLI
helpers are appropriate when they provide repeatable context collection,
validation, or output handling beyond a direct invocation.

Installation uses `mise bootstrap`, and `mise dotfiles status` reports link state.
Declare public skill links in the root `mise.toml`; private skills belong in the private
checkout's `mise.toml`. Do not add parallel installers or check-install scripts.

Repository tool versions, npm dependency freshness, and common tasks are
managed by `mise.toml`. Run `mise install` before using them; `mise run` and
`mise x` automatically run `npm ci` when dependencies are stale. Keep
`mise.lock` committed and regenerate it with `mise lock` when tool or
lockfile-platform pins change.

Update all managed third-party skills with:

```bash
mise run skills:update
```

APM manages third-party skill directories through `apm.yml` and
`apm.lock.yaml`. `skill-invocation.yaml` owns model-invocation policy for
first-party and managed skills; run `mise run skills:sync-invocation` rather
than editing the rendered Pi or Codex policy fields by hand. Review managed
skill and lockfile diffs before committing them.

The root `package.json` exposes the recursive `skills/` tree and
`.agents/skills/*` to Pi. Root mise dotfiles declarations link individual skills
flat into `~/.agents/skills` for cross-harness compatibility.

After changing skills, extensions, installers, or package metadata, run the
complete local validation graph:

```bash
mise run validate
```

Use `mise tasks ls` to discover narrower lint and test tasks. Skill linting uses
the Agent Skills reference validator; the wrapper validates Pi's
`disable-model-invocation` extension and removes only that field from a temporary
copy before specification validation.

The pinned hk configuration runs the fast lint and policy tasks at pre-commit
and `mise run validate` at pre-push. Install Git 2.54+ global hooks once with
`mise run hooks:install`; mise tasks remain the validation source of truth.

## Pi Extension Management

- First-party Pi extensions live under `packages/pi/extensions/<name>/`, with `index.ts` as
  the entry point, a focused README, and tests under `test/` when behavior can
  be isolated.
- When upgrading Pi, align the repository's `@earendil-works/pi-*` development
  dependencies and `typebox` with the new runtime, run `mise run validate`, and
  review newly public extension APIs that can replace local workarounds.
  Pi UI uses renderer middleware for built-in tools and `codemode`; preserve
  their implementations and tool loadout when changing card rendering.
- Expose a new packaged extension in `packages/pi/package.json` under `pi.extensions`.
  Add focused behavioral tests only when warranted. Verify package loading with Pi itself
  and document user-facing commands or tools in the root README.
- A package-manifest change does not install an extension into an existing Pi
  configuration that lists individual extension files. Distinguish package
  development from local activation: inspect `~/.pi/agent/settings.json` or
  `pi list`, use `pi install <package-or-extension-path>` only when the user
  wants the configuration changed, and then reload or restart Pi.
- Do not hardcode a global Pi installation path. If an extension launches a new
  Pi process, support both standalone and Node-based installations by deriving
  the command from the current process and testing both forms.
- Prefer a command-only extension for workflows that must remain invisible to
  the model until manual invocation. If the workflow needs an agent-callable
  tool afterward, register or activate it only from the command and restore the
  prior active tool set when the workflow ends.
- Extensions run with full user permissions. Validate paths and structured
  subprocess arguments, quote any command text sent through a terminal, and
  require confirmation before creating worktrees, running repository hooks, or
  starting external sessions, except the explicitly authorized Rex subagent launcher.

## Process Management

- When `REX_SESSION` and `REX_BLOCK` are set, use Rex and load its
  skill. Scope operations to that session and block rather than the user's focus.
- Use `start_command` and `command_status` when available for ordinary
  long-running commands. They use the current terminal backend.
- Re-list terminal resources before acting on saved IDs. Preserve unrelated
  panes and running commands.

## Evaluation Lens

Before creating, editing, reviewing, importing, or retiring any skill, read
`docs/skill-prompting-lens.md`.

Before changing a skill to address observed friction, identify the layer that
owns the failure. If the behavior comes from a harness tool's description,
schema, validation, or runtime implementation, fix and test that harness
boundary instead of teaching a shared skill a harness-specific workaround.
Add harness-specific skill guidance only when the owning interface cannot be
fixed and the guidance remains necessary and durable.

When adapting an external agent workflow, or introducing orchestration involving
subagents, session handoffs, durable plans, or repeated review loops, also read
`docs/codex-model-workflow-lens.md`.

Do not assume a successful external workflow should be copied directly.
Prefer the smallest valuable adaptation and one main implementation owner.
