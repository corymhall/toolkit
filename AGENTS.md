# Agent Instructions

## Skill Management

This repository is organized around self-contained Agent Skills:

- `skills/` contains skills shared by Pi, Codex CLI, and other
  Agent-Skills-compatible harnesses. Skills may be grouped in nested
  directories; each directory containing `SKILL.md` is an individual skill.
- `codex-skills/` contains skills that depend on Codex CLI-only workflows. Skills
  may be grouped using the same convention.
- `.agents/skills/<skill-name>/` contains reviewed third-party skills managed by
  APM or a focused repository updater; do not edit vendored copies by hand.
- References, scripts, assets, and metadata owned by a skill belong inside that
  skill directory.

Do not recreate the old Codex CLI plugin marketplace structure. Runtime-neutral
skills are the primary product; avoid harness hooks and extensions when a normal
CLI or externally managed process provides the same capability. Skill-owned CLI
helpers are appropriate when they provide repeatable context collection,
validation, or output handling beyond a direct invocation.

Local installs use:

```bash
scripts/install-local-skills.sh
mise run check:local-install
```

The check is non-mutating and verifies the live links against the current
checkout. The installer links first-party and managed third-party shared skills
into `~/.agents/skills`, Codex CLI-only skills into
`${CODEX_HOME:-~/.codex}/skills`, and
the memory guard's `make` proxy into `~/.local/bin`. It may remove only legacy
toolkit-owned reviewer symlinks from the former plugin layout. It must not edit
agent settings or package caches, and it must refuse to replace non-symlink
destinations.

Repository tool versions, npm dependency freshness, and common tasks are
managed by `mise.toml`. Run `mise install` before using them; `mise run` and
`mise x` automatically run `npm ci` when dependencies are stale. Keep
`mise.lock` committed and regenerate it with `mise lock` when tool or
lockfile-platform pins change.

Update all managed third-party skills with:

```bash
mise run skills:update
```

APM manages ordinary third-party skill directories through `apm.yml` and
`apm.lock.yaml`. Herdr's `SKILL.md` is at its repository root, so
`scripts/update-herdr-skill.sh` downloads that file without copying the entire
application repository. `skill-invocation.yaml` owns model-invocation policy
for first-party and managed skills; run `mise run skills:sync-invocation` rather
than editing the rendered Pi or Codex policy fields by hand. Review managed
skill and lockfile diffs before committing them.

The root `package.json` exposes the recursive `skills/` tree and
`.agents/skills/*` to Pi. Keep Codex CLI-only skills out of that manifest. The local
installer discovers nested skill directories recursively but links each skill
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

- First-party Pi extensions live under `extensions/<name>/`, with `index.ts` as
  the entry point, a focused README, and tests under `test/` when behavior can
  be isolated.
- Expose a new packaged extension in `package.json` under `pi.extensions`, add
  its test script when applicable, and update the expected extension list in
  `scripts/test-pi-package.sh`. Document user-facing commands or tools in the
  root README.
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
  starting external sessions.

## Process Management

- When `HERDR_ENV=1`, load the Herdr skill before managing long-running or
  interactive processes.
- Herdr tab and pane IDs are not durable. Re-list tabs and panes before waiting,
  reading, focusing, or closing.
- Outside Herdr, use tmux for long-lived interactive processes.

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
