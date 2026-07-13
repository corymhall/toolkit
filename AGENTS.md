# Agent Instructions

## Skill Management

This repository is organized around self-contained Agent Skills:

- `skills/` contains skills shared by Pi, Codex, and other
  Agent-Skills-compatible harnesses. Skills may be grouped in nested
  directories; each directory containing `SKILL.md` is an individual skill.
- `codex-skills/` contains skills that depend on Codex-only workflows. Skills
  may be grouped using the same convention.
- `.agents/skills/<skill-name>/` contains reviewed third-party skills managed by
  `npx skills` and `skills-lock.json`; do not edit vendored copies by hand.
- References, scripts, assets, and metadata owned by a skill belong inside that
  skill directory.

Do not recreate the old Codex plugin marketplace structure. Runtime-neutral
skills are the primary product; avoid harness hooks and extensions when a normal
CLI or externally managed process provides the same capability. Skill-owned CLI
helpers are appropriate when they provide repeatable context collection,
validation, or output handling beyond a direct invocation.

Local installs use:

```bash
scripts/install-local-skills.sh
```

The installer links first-party and managed third-party shared skills into
`~/.agents/skills`, Codex-only skills into `${CODEX_HOME:-~/.codex}/skills`, and
the memory guard's `make` proxy into `~/.local/bin`. It may remove only legacy
toolkit-owned reviewer symlinks from the former plugin layout. It must not edit
agent settings or package caches, and it must refuse to replace non-symlink
destinations.

Update the managed Herdr skill from this repository with:

```bash
npx skills update herdr --project -y
```

Review the resulting skill and lockfile diff before committing it.

The root `package.json` exposes the recursive `skills/` tree and
`.agents/skills/*` to Pi. Keep Codex-only skills out of that manifest. The local
installer discovers nested skill directories recursively but links each skill
flat into `~/.agents/skills` for cross-harness compatibility.

After editing skills, validate all shared and Codex-only skills:

```bash
while IFS= read -r -d '' skill_file; do
  python3 /Users/chall/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$(dirname "$skill_file")"
done < <(find skills codex-skills .agents/skills -name SKILL.md -type f -print0)
```

Also validate the Pi package and local installer:

```bash
jq empty package.json skills-lock.json
bash -n scripts/*.sh
scripts/test-claude-review.sh
scripts/test-local-installer.sh
scripts/test-memory-guard.sh
scripts/test-pi-package.sh
```

## Process And Agent Coordination

- When `HERDR_ENV=1`, load the Herdr skill before managing long-running or
  interactive processes and visible sidecar agents.
- Give each sidecar its own non-focused Herdr tab in the current workspace. Use
  a semantic label such as `agent-general-review` and add a short task suffix
  when duplicate roles may coexist.
- The main session owns sidecar tab creation and cleanup. A sidecar owns only its
  tab and must not spawn additional agents.
- Herdr tab and pane IDs are not durable. Re-list tabs and panes before waiting,
  reading, focusing, or closing. Never reuse a tab containing a working or
  blocked agent.
- Keep a sidecar tab through synthesis so its output remains inspectable. Close
  it after findings are captured and reported unless the user asks to retain it.
- Outside Herdr, use tmux for long-lived interactive processes.
- One main agent session owns implementation and integration. Use sidecars only
  for bounded research, independent review, or specialist checks; do not
  delegate overlapping implementation work to multiple agents.
- Preserve reusable context in a concise durable artifact. The main session
  must verify material sidecar findings before acting on them.

## Evaluation Lens

When adapting skills, formulas, or workflows from other agent systems, first
read:

- `docs/codex-evaluation-lens.md`
- `docs/skill-prompting-lens.md`

Do not assume a successful external workflow should be copied directly.
Prefer the smallest valuable adaptation, one main implementation owner, and
sidecars only when they materially improve research or review.
