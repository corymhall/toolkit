# Toolkit

Shared Agent Skills and focused Pi extensions for AI-assisted software
engineering workflows. The same skill sources work in Pi, Codex CLI, and other
Agent-Skills-compatible harnesses.

- `extensions/` contains first-party Pi extensions.
- `skills/` contains runtime-neutral skills, optionally grouped in nested
  directories.
- `codex-skills/` contains workflows that require Codex CLI-specific features.
- `.agents/skills/` contains reviewed third-party skills managed by APM or a
  focused repository updater.
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
mise run build
```

`mise run build` synchronizes generated skill invocation metadata, installs and
checks all local links, and runs the complete repository validation graph. The
local-install check is non-mutating and verifies every expected shared and
Codex-only skill link plus the memory guard's `make` proxy against this checkout.

List available tasks with `mise tasks`. Common entry points include
`mise run build`, `mise run validate`, `mise run test`, and
`mise run skills:update`. Mise's npm
dependency provider runs `npm ci` automatically before `mise run` or `mise x`
when the manifests change or `node_modules/` is missing.

`skill-invocation.yaml` is the source of truth for whether each skill may be
invoked implicitly by the model. `mise run skills:sync-invocation` renders Pi's
`disable-model-invocation` frontmatter and Codex's
`policy.allow_implicit_invocation`; `codex_model_invocable` records an optional
Codex-specific exception. An optional `openai` mapping supplies the complete
`agents/openai.yaml` when an explicit-only upstream skill omits one. Enabled
skills use each harness's default and are left unmodified. The normal validation
graph rejects missing policy entries and stale rendered metadata. `mise run
skills:update` reapplies this policy after APM and Herdr updates.

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
`extensions/codex-fast-mode`, `extensions/session-default-model`,
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

### Codex Fast Mode extension

`/codex-fast on|off|status` toggles OpenAI Codex's `priority` service tier for
models that advertise Fast mode. The extension leaves reasoning and verbosity
unchanged, defaults to off, and ignores unsupported models. See
[extensions/codex-fast-mode/README.md](extensions/codex-fast-mode/README.md) for
the current capability allowlist and validation behavior.

### Session Default Model extension

`/session-default save` keeps the current model and thinking level as the fixed
default for new sessions. Later model or thinking changes stay temporary to the
current session. Resumed, forked, and cloned sessions keep their recorded model
state. Use `/session-default show` to inspect the saved default and
`/session-default clear` to return to Pi's normal behavior. See
[extensions/session-default-model/README.md](extensions/session-default-model/README.md)
for storage and failure behavior.

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

`/delegate research <goal>` creates a solution-free problem report for
independent research. `/delegate conversation <request>` copies the new request
and the last assistant response so another session can continue the discussion.
If no mode is present, Pi asks the user to select one. After user confirmation,
the extension starts a normal Pi session in a checkout opened as a non-focused
native Herdr worktree. A new Worktrunk worktree is the default; the existing
destination checkout is used only when explicitly requested. The agent-facing
tool is registered only after `/delegate` is invoked and is disabled again after
use.
See [extensions/delegate/README.md](extensions/delegate/README.md)
for requirements and failure behavior.

### Herdr command extension

When Pi runs inside Herdr, `herdr_start_command` starts an ordinary long-running
command in one reusable, non-focused pane owned by the calling Pi terminal and
returns immediately so the agent can continue independent work. New Pi sessions
in that terminal adopt the same command pane. `herdr_command_status` later
reports completion, exit status, foreground processes, and recent pane output,
with an optional bounded wait. Explicit working directories prevent the
persistent pane shell from drifting between commands. See
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

## Managed Third-Party Skills

APM manages ordinary third-party skills through `apm.yml` and `apm.lock.yaml`.
It deploys them under `.agents/skills/`, where the local installer can link them
for both Pi and Codex CLI. Run `apm install --frozen` to reproduce the locked
versions.

The provider workflow skills come from the local
`../../work/provider-agent-skills/packages/bridged` APM package. That package
brings in `core` and `package-maintenance` transitively, so their source remains
in the provider-agent-skills and pulumi/agent-skills repositories rather than
this repository.

Herdr is managed from its upstream `skills/herdr` directory like the other APM
dependencies.

Refresh all APM dependencies with:

```bash
mise run skills:update
```

Review managed skill and `apm.lock.yaml` changes before committing the update.
The local link script remains the canonical workflow for developing this
checkout.

## Skills

| Area | Skills |
|------|--------|
| Review | `prepare-for-review`, `request-review`, `review-pr`, `explain-pr`, `claude-review` |
| AI harness | `ai-contribution-readiness-audit`, `ai-harness-bootstrap`, `skill-authoring`, `harness-evaluation` |
| Development | `go-development`, `neovim-plugin-development` |
| General workflows | `collaborate`, `capture-decision-context`, `multi-model-evaluate`, `git-spice-stack-prs` |
| GitHub | `create-pr`, `github-search-cli` |
| Documentation | `high-signal-docs`, `notion-docs` |
| Operations | `memory-guard` |
| Provider work | `triage-provider-issue`, `pulumi-rpc-lifecycle-investigation`, `bridge-parity-investigation`, `stage-pulumi-provider-repro`, `stage-terraform-provider-repro`, `investigate-converted-provider-docs` |
| Provider maintenance | `pulumi-upgrade-provider`, `upstream-patches` |
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

## Skill Authoring And Harness Evaluation

`skill-authoring` is a manually invoked workflow for new skills, revisions,
de-slop passes, and semantic reviews. It requires an evidence-backed change
contract, accounts for behavior added or removed, and keeps independent review
read-only so completeness bias cannot silently expand the prompt.

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
under `memrun`. No Codex CLI hook or Pi extension is required. A Pi or APM
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

Install the repository-managed tools and run the complete local validation
graph:

```bash
mise install
mise run validate
```

The graph validates every shared, managed, and Codex-only skill against the
Agent Skills specification, checks repository policy, invocation metadata, and
text hygiene, runs ShellCheck, tests all extensions, and exercises the helper
scripts, local installer, memory guard, and Pi package. Pi's
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
