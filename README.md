# Toolkit

Shared Agent Skills for AI-assisted software engineering workflows. The same
skill sources work in Pi, Codex, and other Agent-Skills-compatible harnesses.

- `skills/` contains runtime-neutral skills.
- `codex-skills/` contains workflows that require Codex-specific features.
- `.agents/skills/` contains reviewed third-party skills managed by
  `npx skills` and `skills-lock.json`.
- Each first-party skill owns its references, scripts, assets, and agent
  metadata.

The repository does not use a Codex plugin marketplace. Long-running processes
and visible review sidecars are coordinated through Herdr when available rather
than hidden background-process or generic subagent abstractions.

## Local Installation

The supported local-development workflow uses direct skill links:

```bash
git clone https://github.com/corymhall/toolkit.git
cd toolkit
scripts/install-local-skills.sh
```

The installer maps:

```text
skills/*               -> ~/.agents/skills/*
.agents/skills/*        -> ~/.agents/skills/*
codex-skills/*         -> ${CODEX_HOME:-~/.codex}/skills/*
```

It also links the memory guard's `make` proxy to `~/.local/bin/make` and removes
legacy toolkit reviewer-role symlinks left by the former plugin installer. The
script is idempotent and refuses to replace non-symlink destinations. Restart
the agent or reload its resources after installation.

Pi discovers shared skills from `~/.agents/skills`; Codex loads those shared
skills plus the Codex-only skills from its own skill directory.

## Install for Pi

Install the shared skills as a Pi Git package:

```bash
pi install git:github.com/corymhall/toolkit
```

The Pi manifest exposes first-party `skills/*` plus managed third-party
`.agents/skills/*`. `codex-skills/spec-to-goal` is omitted because Pi does not
provide Codex's `/goal` workflow. The package contains no Pi extensions and does
not add background-process or subagent tools.

Package installation loads the `memory-guard` guidance but cannot create the
`~/.local/bin/make` proxy. Run `scripts/install-local-skills.sh` from a local
checkout when automatic make guarding is desired, or invoke `memrun` explicitly.

Update an unpinned Git installation with:

```bash
pi update --extensions
```

Do not also install local links for the same skills unless you intentionally
want both resource sources configured.

## Install with `npx skills`

For a skill-only installation, inspect and select skills with:

```bash
npx skills add corymhall/toolkit --list --full-depth
```

Install Codex-only skills into Codex's private skill directory rather than a
shared directory that Pi also scans. The local link script remains the canonical
workflow for developing this checkout.

## Managed Herdr Skill

The Herdr skill is installed project-locally under `.agents/skills/herdr` and
linked globally by `scripts/install-local-skills.sh`. This lets both Pi and
Codex discover it while the repository retains update provenance in
`skills-lock.json`.

Refresh it from the upstream repository with:

```bash
npx skills update herdr --project -y
```

Review changes to `.agents/skills/herdr/SKILL.md` and `skills-lock.json` before
committing the update.

## Skills

| Area | Skills |
|------|--------|
| Review | `request-review`, `review-pr`, `explain-pr`, `claude-review` |
| Engineering | `go-development`, `neovim-plugin-development`, `memory-guard` |
| AI workflows | `collaborative-framing`, `multi-model-evaluate`, `ai-contribution-readiness-audit`, `ai-harness-bootstrap`, `ai-harness-retrospective`, `git-spice-stack-prs` |
| Provider work | `triage-provider-issue`, `pulumi-rpc-lifecycle-investigation`, `bridge-parity-investigation`, `stage-pulumi-provider-repro`, `stage-terraform-provider-repro`, `workaround-investigation` |
| Pulumi audit | `pulumi-test-rationalization-audit` |
| Codex-only | `spec-to-goal` |

## Review Coordination

`request-review` selects the smallest useful set of review lenses. When running
inside Herdr, each sidecar gets its own non-focused, semantically named tab that
the user can inspect or steer. The main session owns tab lifecycle, synthesis,
and all implementation. Sidecar tabs remain through synthesis and are then
closed unless the user asks to retain them. Outside Herdr, the skill applies the
selected lenses in the main session and reports the reduced context isolation.

The toolkit intentionally does not provide a generic subagent extension.
Sidecars are for bounded research and independent review, not parallel ownership
of overlapping implementation work.

## Memory Guard

`memory-guard` is harness-independent. After local installation,
`~/.local/bin/make` points to its proxy, which runs the real `make` process tree
under `memrun`. No Codex hook or Pi extension is required. A Pi or `npx skills`
package installation by itself does not create this proxy.

The proxy only covers `make` resolved through `PATH`; an explicit path such as
`/usr/bin/make` bypasses it. Logs default to
`${XDG_STATE_HOME:-~/.local/state}/toolkit/memrun`.

## Global Agent Guidance

Pi supports global instructions at `~/.pi/agent/AGENTS.md` or
`$PI_CODING_AGENT_DIR/AGENTS.md`. See
[docs/global-agent-guidance.md](docs/global-agent-guidance.md) for the suggested
Herdr and sidecar policy. Merge it into existing global guidance manually; the
installer does not edit agent settings.

## Validation

```bash
for skill in skills/* codex-skills/* .agents/skills/*; do
  python3 /Users/chall/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$skill"
done
jq empty package.json skills-lock.json
bash -n scripts/*.sh
scripts/test-claude-review.sh
scripts/test-local-installer.sh
scripts/test-memory-guard.sh
scripts/test-pi-package.sh
```

## Migrating From The Plugin Layout

Remove old toolkit plugins while the former marketplace checkout is still
available, then remove the marketplace:

```bash
for plugin in \
  engineering-review \
  provider-issue-workbench \
  pulumi-audit \
  codex-workflows \
  codex-memguard \
  claude; do
  codex plugin remove "${plugin}@toolkit"
done
codex plugin marketplace remove toolkit
```

After updating the checkout, run `scripts/install-local-skills.sh` to install
the skill links and repoint the existing `~/.local/bin/make` symlink to the new
skill path.

## Acknowledgements

- [max-sixty/worktrunk](https://github.com/max-sixty/worktrunk) — worktree lifecycle and hook-based automation
- [obra/superpowers](https://github.com/obra/superpowers) — thinking and review patterns that still influence the repo
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — reference material that informed earlier experiments

## License

MIT
