# Toolkit

Shared Agent Skills and focused Pi extensions for AI-assisted software
engineering workflows. The same skill sources work in Pi, Codex CLI, and other
Agent-Skills-compatible harnesses.

- `extensions/` contains first-party Pi extensions.
- `skills/` contains runtime-neutral skills, optionally grouped in nested
  directories.
- `codex-skills/` contains workflows that require Codex CLI-specific features.
- `.agents/skills/` contains reviewed third-party skills managed by
  `npx skills` and `skills-lock.json`.
- Each first-party skill owns its references, scripts, assets, and agent
  metadata.

The repository does not use a Codex CLI plugin marketplace. Long-running
processes and visible review sidecars are coordinated through Herdr when available rather
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
skills/**/<skill>       -> ~/.agents/skills/<skill>
.agents/skills/*        -> ~/.agents/skills/*
codex-skills/**/<skill> -> ${CODEX_HOME:-~/.codex}/skills/<skill>
```

It also links the memory guard's `make` proxy to `~/.local/bin/make` and removes
legacy toolkit reviewer-role symlinks left by the former plugin installer. The
script is idempotent and refuses to replace non-symlink destinations. Restart
the agent or reload its resources after installation.

Pi discovers shared skills from `~/.agents/skills`; Codex CLI loads those shared
skills plus the Codex CLI-only skills from its own skill directory.

## Install for Pi

Install the shared skills as a Pi Git package:

```bash
pi install git:github.com/corymhall/toolkit
```

The Pi manifest exposes the recursive first-party `skills/` tree, managed
third-party `.agents/skills/*`, and the focused `extensions/web-access`,
`extensions/codex-commentary`, `extensions/codex-fast-mode`,
`extensions/skill-autocomplete`, `extensions/status-footer`, and
`extensions/delegate` extensions.
`codex-skills/spec-to-goal` is omitted because Pi does not provide Codex CLI's
`/goal` workflow. The package does not add background-process or generic
subagent tools.
Git package installation installs the web-access extension's local parsing
dependencies automatically.

### Web Access extension

`extensions/web-access` registers `web_search`, `github_search`, and
`fetch_content`:

- `web_search` uses Pi's OpenAI Codex subscription login exclusively.
- `github_search` performs authenticated GitHub issue, pull-request, and code
  searches with structured scope and filter fields. Private repository results
  work when the authenticated `gh` account can access them.
- GitHub repository, tree, and blob URLs use constrained read-only `gh api`
  calls and never clone or execute repository content. Private repositories
  work when the authenticated `gh` account can access them.
- Other HTTP(S) pages are fetched directly and HTML is converted locally with
  Readability. Extraction failures are returned without external-service
  fallbacks.

The extension does not bundle an extension-owned skill or use Jina, Gemini,
Parallel, Brave, Exa, Tavily, or Perplexity. See
[extensions/web-access/README.md](extensions/web-access/README.md) for details.

### Codex Commentary extension

`extensions/codex-commentary` adds Codex CLI-style progress instructions only
for `openai-codex` Responses models. Commentary is shown before and between tool
calls as ordinary assistant text; final answers remain self-contained. See
[extensions/codex-commentary/README.md](extensions/codex-commentary/README.md)
for the Pi-specific prompt adaptations.

### Codex Fast Mode extension

`/codex-fast on|off|status` toggles OpenAI Codex's `priority` service tier for
models that advertise Fast mode. The extension leaves reasoning and verbosity
unchanged, defaults to off, and ignores unsupported models. See
[extensions/codex-fast-mode/README.md](extensions/codex-fast-mode/README.md) for
the current capability allowlist and validation behavior.

### Skill Autocomplete extension

Type `$` at a token boundary to fuzzy-pick an available Pi skill anywhere in a
prompt. Model-invocable skills remain ordinary exact-name mentions. Skills with
`disable-model-invocation: true` are labeled as explicit and moved to Pi's
required leading `/skill:name` form when submitted. See
[extensions/skill-autocomplete/README.md](extensions/skill-autocomplete/README.md)
for behavior and limitations.

### Status Footer extension

`extensions/status-footer` replaces Pi's default footer with a compact line that
prioritizes remaining Codex weekly quota and remaining Pi context. It adds model,
thinking level, active Codex Fast mode, and Git branch when space permits. Weekly
quota comes from Pi's OpenAI response headers, with the locally authenticated Codex CLI providing the
startup fallback; use `/status-refresh` to reinstall the custom footer and
refresh that fallback manually. See
[extensions/status-footer/README.md](extensions/status-footer/README.md) for
requirements and account-matching caveats.

### Delegate extension

`/delegate [goal]` asks the current agent to prepare a destination and
self-contained handoff, then—after user confirmation—starts a normal Pi session
in a non-focused Herdr workspace. A new Worktrunk worktree is the default; the
existing destination checkout is used only when explicitly requested. The
agent-facing tool is registered only after `/delegate` is invoked and is
disabled again after use. See [extensions/delegate/README.md](extensions/delegate/README.md)
for requirements and failure behavior.

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

Install Codex CLI-only skills into Codex CLI's private skill directory rather
than a shared directory that Pi also scans. The local link script remains the canonical
workflow for developing this checkout.

## Managed Herdr Skill

The Herdr skill is installed project-locally under `.agents/skills/herdr` and
linked globally by `scripts/install-local-skills.sh`. This lets both Pi and
Codex CLI discover it while the repository retains update provenance in
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
| AI harness | `ai-contribution-readiness-audit`, `ai-harness-bootstrap`, `ai-harness-retrospective` |
| Development | `go-development`, `neovim-plugin-development` |
| General workflows | `collaborative-framing`, `multi-model-evaluate`, `git-spice-stack-prs` |
| Operations | `memory-guard` |
| Provider work | `triage-provider-issue`, `pulumi-rpc-lifecycle-investigation`, `bridge-parity-investigation`, `stage-pulumi-provider-repro`, `stage-terraform-provider-repro`, `workaround-investigation` |
| Pulumi audit | `pulumi-test-rationalization-audit` |
| Codex CLI-only | `spec-to-goal` |

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
under `memrun`. No Codex CLI hook or Pi extension is required. A Pi or
`npx skills` package installation by itself does not create this proxy.

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
while IFS= read -r -d '' skill_file; do
  python3 /Users/chall/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$(dirname "$skill_file")"
done < <(find skills codex-skills .agents/skills -name SKILL.md -type f -print0)
jq empty package.json package-lock.json skills-lock.json
npm test
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
