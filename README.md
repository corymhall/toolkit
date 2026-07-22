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

The supported local-development workflow uses mise for repository tools and
direct skill links:

```bash
git clone https://github.com/corymhall/toolkit.git
cd toolkit
mise install
scripts/install-local-skills.sh
mise run check:local-install
```

The local-install check is non-mutating and verifies every expected shared and
Codex-only skill link plus the memory guard's `make` proxy against this checkout.

List available tasks with `mise tasks`. Common entry points include
`mise run validate`, `mise run test`, and `mise run skills:update`. Mise's npm
dependency provider runs `npm ci` automatically before `mise run` or `mise x`
when the manifests change or `node_modules/` is missing.

### Git lifecycle

The repository pins [hk](https://hk.jdx.dev/) for non-mutating Git lifecycle
checks. With Git 2.54 or newer, install hk's global hooks once:

```bash
mise run hooks:install
```

The global hooks run through `mise x` and are a no-op in repositories without an
`hk.pkl`. This repository runs ShellCheck, skill validation, and repository
policy at pre-commit, then the complete `mise run validate` graph at pre-push.
Mise tasks remain the source of truth; hk only connects them to Git events.

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
`extensions/skill-autocomplete`, `extensions/system-prompt`,
`extensions/status-footer`, `extensions/delegate`, `extensions/herdr-command`,
and `extensions/herdr-nvim-links` extensions.
`codex-skills/spec-to-goal` is omitted because Pi does not provide Codex CLI's
`/goal` workflow. The package does not add hidden background-process or generic
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
- Successful remote results are saved to private temporary Markdown files. The
  model receives bounded content, while the TUI shows a compact title/source
  summary with a clickable full-output path.

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

### System Prompt extension

`/system-prompt` opens the last effective Pi system-prompt string in a local
multiline viewer; `/system-prompt current` reads the currently assembled string
instead. The extension does not inject the prompt into model context or persist
another session copy. Provider payload rewrites and host-level instructions are
outside Pi's prompt API. See
[extensions/system-prompt/README.md](extensions/system-prompt/README.md) for the
exact boundary and sensitivity warning.

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
in a checkout opened as a non-focused native Herdr worktree. A new Worktrunk
worktree is the default; the existing destination checkout is used only when
explicitly requested. The agent-facing tool is registered only after
`/delegate` is invoked and is
disabled again after use. See [extensions/delegate/README.md](extensions/delegate/README.md)
for requirements and failure behavior.

### Herdr command extension

When Pi runs inside Herdr, `herdr_start_command` starts an ordinary long-running
command in one reusable, non-focused pane and returns immediately so the agent
can continue independent work. `herdr_command_status` later reports completion,
exit status, foreground processes, and recent pane output, with an optional
bounded wait. Explicit working directories prevent the persistent pane shell
from drifting between commands. See
[extensions/herdr-command/README.md](extensions/herdr-command/README.md) for the
command protocol and requirements.

### Herdr Neovim Links extension

When Pi runs in a Herdr pane, built-in `read`, `edit`, and `write` file-title
links can open in a Neovim pane immediately to the right. The macOS helper uses
Ghostty's OSC 8 support, Herdr pane discovery, and Neovim RPC; it creates and
focuses a right-hand Neovim pane when needed and never injects editor
keystrokes. The packaged extension is inert until the native URL handler and
Neovim runtime are explicitly installed from a local checkout:

```bash
extensions/herdr-nvim-links/install.sh
```

See
[extensions/herdr-nvim-links/README.md](extensions/herdr-nvim-links/README.md)
for requirements, security boundaries, installation, and current renderer
limitations.

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

Refresh all managed third-party skills from their upstream repositories with:

```bash
mise run skills:update
```

The mise-managed `skills@1.5.17` pin avoids newer CLI versions copying Herdr's
entire root-level application repository into the managed skill directory.
Review managed skill and `skills-lock.json` changes before committing the
update.

## Skills

| Area | Skills |
|------|--------|
| Review | `prepare-for-review`, `request-review`, `review-pr`, `explain-pr`, `claude-review` |
| AI harness | `ai-contribution-readiness-audit`, `ai-harness-bootstrap`, `harness-evaluation` |
| Development | `go-development`, `neovim-plugin-development` |
| General workflows | `collaborative-framing`, `capture-decision-context`, `multi-model-evaluate`, `git-spice-stack-prs` |
| GitHub | `create-pr`, `github-search-cli` |
| Documentation | `notion-docs` |
| Operations | `memory-guard` |
| Provider work | `triage-provider-issue`, `pulumi-rpc-lifecycle-investigation`, `bridge-parity-investigation`, `stage-pulumi-provider-repro`, `stage-terraform-provider-repro`, `workaround-investigation` |
| Pulumi audit | `pulumi-test-rationalization-audit` |
| Codex CLI-only | `spec-to-goal` |

`capture-decision-context` is a manually invoked way to preserve the motivation,
evidence, rationale, tradeoffs, accepted limitations, and open questions from a
conversation. It produces either an implementation-light context note or a
compact GitHub issue draft with supporting evidence in an expandable section,
rather than an authoritative specification or autonomous implementation plan.

## Review Coordination

`prepare-for-review` is a manually invoked author pass in the current session.
It uses the conversation as the source of truth to simplify the implementation,
apply relevant development guidance, document non-obvious code, and run focused
verification before independent review.

`request-review` starts with one independent general reviewer. It adds a test,
Go, error-handling, contract-alignment, or focused domain lane only when that
lane answers a distinct unresolved question. Contract alignment is reserved for
an explicitly authoritative document or external contract, not an ordinary
implementation plan. Intent alignment, repository compliance, and author-side
documentation remain with the main session; context notes are not treated as
complete specifications. When running inside Herdr, each selected sidecar gets
its own non-focused, semantically named tab that the user can inspect or steer.
The main session owns tab lifecycle, synthesis, and all implementation. Sidecar
tabs remain through synthesis and are then closed unless the user asks to retain
them. Outside Herdr, the skill applies the selected lenses in the main session
and reports the reduced context isolation.

The toolkit intentionally does not provide a generic subagent extension.
Sidecars are for bounded research and independent review, not parallel ownership
of overlapping implementation work.

## Harness Evaluation

`harness-evaluation` is a manually invoked personal field-evaluation workflow.
It can review named Pi or Codex session JSONL files or scan a recent time window
with bundled rollout helpers. Evaluation criteria for personal and repo-local
skills are centralized in the evaluator rather than shipped with each evaluated
skill. A bundled SQLite state CLI preserves runtime scan cursors, deduplicated
session snapshots, unresolved findings, worktree reviews, and human decisions
across scheduled runs and missed review days. The workflow separates activation,
adherence, decision effect, human correction, cost, and owning layer; it reports
evidence before judgment-heavy edits, permits only narrow objective scheduled
fixes, and treats `No change` as a valid result.

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

Install the repository-managed tools and run the complete local validation
graph:

```bash
mise install
mise run validate
```

The graph validates every shared, managed, and Codex-only skill against the
Agent Skills specification, checks repository policy and text hygiene, runs
ShellCheck, tests all extensions, and exercises the helper scripts, local
installer, memory guard, and Pi package. Pi's
`disable-model-invocation` frontmatter extension is type-checked locally and
removed only from the temporary copy passed to the specification validator.
The Pi package smoke test uses the global `pi` executable on `PATH`; Pi is not
managed by this repository. Use `mise tasks ls` to discover narrower checks.

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

- [spf13/go-skills](https://github.com/spf13/go-skills) — concrete-first, anti-layering Go guidance adapted into `go-development`
- [max-sixty/worktrunk](https://github.com/max-sixty/worktrunk) — worktree lifecycle and hook-based automation
- [obra/superpowers](https://github.com/obra/superpowers) — thinking and review patterns that still influence the repo
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — reference material that informed earlier experiments

## License

MIT
