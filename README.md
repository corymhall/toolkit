# Toolkit

Shared Agent Skills and focused Pi extensions for AI-assisted software
engineering workflows. The same skill sources work in Pi, Codex CLI, and other
Agent-Skills-compatible harnesses.

- `extensions/` contains first-party Pi extensions.
- `skills/` contains runtime-neutral skills, optionally grouped in nested
  directories.
- `.agents/skills/` contains reviewed third-party skills managed by APM or a
  focused repository updater.
- Each first-party skill owns its references, scripts, assets, and agent
  metadata.

The repository does not use a Codex CLI plugin marketplace. Long-running
processes use Herdr or Rex when available, while review sidecars use Herdr rather
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
local-install check is non-mutating and verifies every expected shared skill
link plus the memory guard's `make` proxy against this checkout.

List available tasks with `mise tasks`. Common entry points include
`mise run build`, `mise run validate`, `mise run test`, `mise run lint:typescript`,
`mise run format:check`, and `mise run skills:update`. The TypeScript lint task
uses Oxlint and its TypeScript 7 type checker. Mise's npm
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
```

It also links the memory guard's `make` proxy to `~/.local/bin/make` and removes
legacy toolkit reviewer-role symlinks left by the former plugin installer. The
script is idempotent and refuses to replace non-symlink destinations. Restart
the agent or reload its resources after installation.

Pi and Codex CLI discover the same shared skills from `~/.agents/skills`.

## Install for Pi

Install the shared skills as a Pi Git package:

```bash
pi install git:github.com/corymhall/toolkit
```

The Pi manifest exposes the recursive first-party `skills/` tree, managed
third-party `.agents/skills/*`, and the focused `extensions/web-access`,
`extensions/codex-fast-mode`, `extensions/pi-ui`,
`extensions/session-default-model`, `extensions/system-prompt`,
`extensions/command-runner`, `extensions/copy-session`, and `extensions/review-pane` extensions.
The package does not add hidden background-process or generic subagent tools.
Git package installation installs the web-access extension's local parsing
dependencies automatically.

### Web Access extension

`extensions/web-access` registers `web_search`, `github_search`, `github_issue`,
`github_pull_request`, `github_actions`, and `fetch_content`:

- `web_search` uses Pi's ChatGPT subscription login and the selected OpenAI Responses model; legacy OpenAI Codex logins remain supported.
- `github_search` performs authenticated GitHub issue, pull-request, and code
  searches with structured scope and filter fields. Private repository results
  work when the authenticated `gh` account can access them.
- `github_issue` reads normalized issue metadata, bodies, and bounded comment
  pages through authenticated, read-only `gh api` calls.
- `github_pull_request` reads normalized pull-request summaries, files, diffs,
  commits, conversation comments, reviews, checks, and commit statuses.
- `github_actions` reads workflow runs, jobs, individual job logs, and failed-job
  logs with private complete output and bounded model-visible tails.
- GitHub repository, issue, pull-request, Actions-run, tree, and blob URLs use
  constrained read-only `gh api` calls and never clone or execute repository
  content. Private repositories work when the authenticated `gh` account can
  access them.
- Other HTTP(S) pages are fetched directly and HTML is converted locally with
  Readability. Extraction failures are returned without external-service
  fallbacks.
- Successful remote results are saved to private temporary Markdown files. The
  model receives bounded content, while the TUI uses compact cards for calls
  and an expanded title/source summary with a clickable full-output path.

The extension does not bundle an extension-owned skill or use Jina, Gemini,
Parallel, Brave, Exa, Tavily, or Perplexity. See
[extensions/web-access/README.md](extensions/web-access/README.md) for details.

### Codex Fast Mode extension

`/codex-fast on|off|status` toggles OpenAI Codex's `priority` service tier for
models that advertise Fast mode. The extension leaves reasoning and verbosity
unchanged, defaults to off, and ignores unsupported models. See
[extensions/codex-fast-mode/README.md](extensions/codex-fast-mode/README.md) for
the current capability allowlist and validation behavior.

### Pi UI extension

`extensions/pi-ui` provides one entry point for the toolkit's interactive UI:

- Tool Cards uses Pi 1.0.1+ renderer registration for bordered cards with Bash
  output previews, compact informational calls, and execution metadata.
  Codemode cards show readable action rows, running progress, and visible child
  failures. Expansion reveals the script and complete native result.
- Skill Autocomplete adds inline `$skill-name` completion and converts explicit
  user-only skill mentions to Pi's required leading command.
- Status Footer prioritizes remaining Codex weekly quota and Pi context, then
  adds model, thinking level, Fast mode, and Git branch when space permits.

`Ctrl+O` uses Pi's global tool expansion state and native expanded result
renderers. Local file links use their normal `file://` targets.

See [extensions/pi-ui/README.md](extensions/pi-ui/README.md) for links to each
feature's behavior, requirements, and limitations.

### Session Default Model extension

`/session-default save` keeps the current model and thinking level as the fixed
default for new sessions. Later model or thinking changes stay temporary to the
current session. Resumed, forked, and cloned sessions keep their recorded model
state. Use `/session-default show` to inspect the saved default and
`/session-default clear` to return to Pi's normal behavior. See
[extensions/session-default-model/README.md](extensions/session-default-model/README.md)
for storage and failure behavior.

### System Prompt extension

`/system-prompt` opens the last effective Pi system-prompt string in a local
multiline viewer; `/system-prompt current` reads the currently assembled string
instead. The extension does not inject the prompt into model context or persist
another session copy. Provider payload rewrites and host-level instructions are
outside Pi's prompt API. See
[extensions/system-prompt/README.md](extensions/system-prompt/README.md) for the
exact boundary and sensitivity warning.

### Review pane extension

`/review` opens Neovim Diffview in a Rex split beside this chat and attaches
Commentry to this Pi agent. Use `/review <revision>` for a diff base, or ask the
agent to call `open_review` when its work is ready. Confirmation is required
because attachment can deliver pending comments. See
[extensions/review-pane/README.md](extensions/review-pane/README.md).

### Copy Session extension

`/copy-session`, or Ctrl+S in the main prompt editor, copies a ready-to-paste
prompt asking another session to use
Evaler to inspect this saved session. Use `/copy-session <question>` to focus
the lookup. The prompt includes the exact session path, ID, and working
directory, without copying the transcript. See
[extensions/copy-session/README.md](extensions/copy-session/README.md).

### Command runner extension

When Pi runs inside Herdr or Rex, `start_command` starts an ordinary
long-running command in one reusable, non-focused pane and returns immediately.
`command_status` reports completion, exit status, foreground processes, and
recent output, with an optional bounded wait. The backend is selected from the
terminal environment and reported by the tools. Both tools share Pi UI cards.
New Pi sessions in the same terminal can adopt its existing command pane.
Outside Herdr and Rex, use tmux manually for long-lived processes.

See [extensions/command-runner/README.md](extensions/command-runner/README.md)
for recovery, requirements, and backend differences.

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
| General workflows | `collaborate`, `capture-decision-context`, `multi-model-evaluate`, `worktrunk-stack-prs` |
| GitHub | `create-pr`, `github-search-cli` |
| Documentation | `high-signal-docs`, `notion-docs` |
| Operations | `memory-guard` |
| Provider work | `triage-provider-issue`, `pulumi-rpc-lifecycle-investigation`, `bridge-parity-investigation`, `stage-pulumi-provider-repro`, `stage-terraform-provider-repro`, `investigate-converted-provider-docs` |
| Provider maintenance | `pulumi-upgrade-provider`, `upstream-patches` |
| Pulumi audit | `pulumi-test-rationalization-audit` |

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

The graph validates every shared and managed skill against the
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
- [Go modernize analyzer](https://pkg.go.dev/golang.org/x/tools/go/analysis/passes/modernize) — version-aware mechanical modernization used by `go-development`
- [max-sixty/worktrunk](https://github.com/max-sixty/worktrunk) — worktree lifecycle and hook-based automation
- [obra/superpowers](https://github.com/obra/superpowers) — thinking and review patterns that still influence the repo
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — reference material that informed earlier experiments

## License

MIT
