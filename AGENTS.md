# Agent Instructions

## Skill Management

This repository is organized around self-contained Agent Skills:

- `skills/` contains skills shared by Pi, Codex CLI, and other
  Agent-Skills-compatible harnesses. Skills may be grouped in nested
  directories; each directory containing `SKILL.md` is an individual skill.
- `codex-skills/` contains skills that depend on Codex CLI-only workflows. Skills
  may be grouped using the same convention.
- `.agents/skills/<skill-name>/` contains reviewed third-party skills managed by
  `npx skills` and `skills-lock.json`; do not edit vendored copies by hand.
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
```

The installer links first-party and managed third-party shared skills into
`~/.agents/skills`, Codex CLI-only skills into `${CODEX_HOME:-~/.codex}/skills`, and
the memory guard's `make` proxy into `~/.local/bin`. It may remove only legacy
toolkit-owned reviewer symlinks from the former plugin layout. It must not edit
agent settings or package caches, and it must refuse to replace non-symlink
destinations.

Repository tool versions and common tasks are managed by `mise.toml`. Run
`mise install` before using them.

Update all managed third-party skills with:

```bash
mise run skills:update
```

The task pins `skills@1.5.17` intentionally. Herdr's `SKILL.md` is at its
repository root, and `skills@1.5.18` copies that entire application repository
into the managed skill directory. Keep the pin until the CLI supports a
file-only root-skill update. Review managed skill and lockfile diffs before
committing them.

The root `package.json` exposes the recursive `skills/` tree and
`.agents/skills/*` to Pi. Keep Codex CLI-only skills out of that manifest. The local
installer discovers nested skill directories recursively but links each skill
flat into `~/.agents/skills` for cross-harness compatibility.

After editing skills, validate all shared and Codex CLI-only skills:

```bash
while IFS= read -r -d '' skill_file; do
  python3 /Users/chall/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$(dirname "$skill_file")"
done < <(find skills codex-skills .agents/skills -name SKILL.md -type f -print0)
```

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

Also validate the Pi package and local installer:

```bash
jq empty package.json skills-lock.json
npm test
bash -n scripts/*.sh
scripts/test-claude-review.sh
scripts/test-local-installer.sh
scripts/test-memory-guard.sh
scripts/test-pi-package.sh
```

## Process Management

- When `HERDR_ENV=1`, load the Herdr skill before managing long-running or
  interactive processes.
- Herdr tab and pane IDs are not durable. Re-list tabs and panes before waiting,
  reading, focusing, or closing.
- Outside Herdr, use tmux for long-lived interactive processes.

## Evaluation Lens

Before creating, editing, reviewing, importing, or retiring any skill, read
`docs/skill-prompting-lens.md`.

When adapting an external agent workflow, or introducing orchestration involving
subagents, session handoffs, durable plans, or repeated review loops, also read
`docs/codex-model-workflow-lens.md`.

Do not assume a successful external workflow should be copied directly.
Prefer the smallest valuable adaptation and one main implementation owner.
