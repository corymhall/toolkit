# Toolkit

Public workstation configuration now lives in `dotfiles/`, with Rex helpers in
`packages/rex/` and shared instruction inputs in `agent-config/`.
See [workstation configuration](docs/workstation.md) for preview, installation,
private additions, and the single-writer ownership rules.

Shared Agent Skills and focused Pi extensions for AI-assisted software
engineering workflows. The same skill sources work in Pi, Codex CLI, and other
Agent-Skills-compatible harnesses.

- `packages/pi/extensions/` contains first-party Pi extensions.
- `skills/` contains runtime-neutral skills, optionally grouped in nested
  directories.
- `.agents/skills/` contains reviewed third-party skills managed by APM or a
  focused repository updater.
- Each first-party skill owns its references, scripts, assets, and agent
  metadata.

The repository does not use a Codex CLI plugin marketplace. Long-running
processes use Rex when available. Explicit Pi delegation uses inspectable
Rex panes rather than hidden background agents.

## Go CLI

The `toolkit` CLI uses one root `go.mod`, a minimal `main.go`, and Cobra commands
under `cmd/`. `toolkit rex` provides Pi messaging and agent tracking/resume. Repository maintenance tooling belongs in TypeScript, while
standalone CLI products belong in Go. Skill-owned Python is currently exempt.

```sh
mise run build
.build/toolkit --help
.build/toolkit rex --help
mise run install:toolkit  # Explicitly install into ~/.local/bin
```

Go linting, modernization checks, and tests participate in `mise run validate`.
The setup and pinned `cobra-viper` skill are adapted from Evaler.

## Local Installation

The supported local-development workflow uses mise for repository tools and
direct skill links:

```bash
git clone https://github.com/corymhall/toolkit.git
cd toolkit
mise install
mise run validate
```

`mise run validate` runs the complete repository validation graph without installing
into your home. Run `mise run skills:sync-invocation` explicitly after policy changes.
Use `mise bootstrap --dry-run` to preview setup, `mise bootstrap --yes` to apply it,
and `mise dotfiles status` to inspect the declared links.

List available tasks with `mise tasks`. Common entry points include
`mise run check`, `mise run validate`, `mise run test`, `mise run lint:typescript`,
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
skills:update` reapplies this policy after APM updates.

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

The root mise dotfile declarations map:

```text
skills/**/<skill>       -> ~/.agents/skills/<skill>
.agents/skills/*        -> ~/.agents/skills/*
```

They also link the memory guard's `make` proxy to `~/.local/bin/make`.
Reload the agent's resources after installing changed skills.

Pi and Codex CLI discover the same shared skills from `~/.agents/skills`.

## Install for Pi

Install the shared skills as a Pi Git package:

```bash
pi install git:github.com/corymhall/toolkit
```

The root manifest exposes public skills. Extensions are a separate package at
`packages/pi`, requiring Pi 1.5+. From a local checkout:

```bash
npm ci
pi install ./packages/pi
```

Workstation installation registers this package automatically. Its manifest
includes the web, UI, model, terminal, delegation, review, PR, and Rex-session
extensions. npm workspaces install their runtime dependencies.

### Web Access extension

`packages/pi/extensions/web-access` registers `web_search`, `github_search`, `github_issue`,
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
[packages/pi/extensions/web-access/README.md](packages/pi/extensions/web-access/README.md) for details.

### Codex Fast Mode extension

`/codex-fast on|off|status` toggles OpenAI Codex's `priority` service tier for
models that advertise Fast mode. The extension leaves reasoning and verbosity
unchanged, defaults to off, and ignores unsupported models. See
[packages/pi/extensions/codex-fast-mode/README.md](packages/pi/extensions/codex-fast-mode/README.md) for
the current capability allowlist and validation behavior.

### Model Modes extension

`/mode implement`, `/mode discuss`, and `/mode investigate` switch model and
reasoning effort only. `/mode` opens a picker and `/mode status` reports the
current preset. See [packages/pi/extensions/model-modes/README.md](packages/pi/extensions/model-modes/README.md).

### Pi UI extension

`packages/pi/extensions/pi-ui` provides one entry point for the toolkit's interactive UI:

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

See [packages/pi/extensions/pi-ui/README.md](packages/pi/extensions/pi-ui/README.md) for links to each
feature's behavior, requirements, and limitations.

### Model defaults

Use Pi's built-in `/model` and `/thinking` pickers. Selections apply to the
current session; press `Ctrl+S` in either picker to save its startup default.
Resumed sessions keep their recorded selection.

### System Prompt extension

`/system-prompt` opens the last effective Pi system-prompt string in a local
multiline viewer; `/system-prompt current` reads the currently assembled string
instead. The extension does not inject the prompt into model context or persist
another session copy. Provider payload rewrites and host-level instructions are
outside Pi's prompt API. See
[packages/pi/extensions/system-prompt/README.md](packages/pi/extensions/system-prompt/README.md) for the
exact boundary and sensitivity warning.

### Review pane extension

`/review` opens Neovim Diffview in a Rex split beside this chat and attaches
Commentry to this Pi agent. Use `/review <revision>` for a diff base, or ask the
agent to call `open_review` when its work is ready. No additional confirmation
is shown. Commentry attachment can deliver pending comments. See
[packages/pi/extensions/review-pane/README.md](packages/pi/extensions/review-pane/README.md).

### Rex Subagents extension

`rex_subagent` spawns named Pi children in minimized floating panes in the calling
Rex tab without a confirmation prompt. Optional `model` and `effort` spawn fields
override the parent's defaults. Results arrive as follow-ups.
`/subagents open <name>` opens a child for inspection. Rex can promote it to a
normal pane or tab without restarting it. Children retain working and blocked
status, but settled work becomes idle without Rex completion notifications.
The parent keeps its normal notifications.

Children have the full built-in tool set and share the working tree. Review-only
assignments must explicitly prohibit edits. They use normal Pi configuration and
project instructions, with MCP disabled. This is not a sandbox. See
[packages/pi/extensions/rex-subagents/README.md](packages/pi/extensions/rex-subagents/README.md) for
controls, recovery, and limits. Existing configurations that list individual
extension files need separate activation.

### GitHub PR status and CI watches

`packages/pi/extensions/github-pr` shows PR status above the input and automatically watches
the current branch PR across new commits and CI reruns. `/pr` toggles inline
details without taking focus. `/pr unwatch` disables automatic watching until
`/pr watch`, including across reloads and resumes. Saved delivery receipts keep
unchanged failures and green results from repeating. The codemode tool
`github_ci_watch` also supports bounded, commit-pinned waits for other PRs and
workflow runs. Results arrive as follow-ups without model-driven polling.
Nothing reruns jobs, edits PRs, or intercepts shell commands. Explicit unfinished
waits restore paused. On Pi 1.4+, watched CI also feeds Rex's OSC 7501 status.
Pending is working, green is done, and red is blocked while Pi rests. Active
agent work and native dialogs take precedence. See
[packages/pi/extensions/github-pr/README.md](packages/pi/extensions/github-pr/README.md).

### Copy Session extension

`/reference-session` opens a searchable session picker and inserts only the
selected session file path into your draft, without switching sessions or
submitting anything. Tab switches between the current directory and all
projects and worktrees. Ctrl+Alt+S opens the picker without clearing your draft,
so you can insert multiple references.

`/copy-session`, or Ctrl+S in the main prompt editor, copies a ready-to-paste
prompt asking another session to use
Evaler to inspect this saved session. Use `/copy-session <question>` to focus
the lookup. The prompt includes the exact session path, ID, and working
directory, without copying the transcript. See
[packages/pi/extensions/copy-session/README.md](packages/pi/extensions/copy-session/README.md).

### Command runner extension

When Pi runs inside Herdr or Rex, `start_command` starts an ordinary
long-running command in one reusable, non-focused pane and returns immediately.
In interactive and RPC sessions, completion arrives automatically as a follow-up
with the exit code and a short output tail. Continue other work or end the turn
until notified. `command_status` provides immediate process and output diagnostics,
with an optional explicit bounded wait. Notification receipts survive reloads.
The backend is selected from the terminal environment and reported by the tools.
Both tools share Pi UI cards.
New Pi sessions in the same terminal can adopt its existing command pane.
Rex command panes float in the caller's tab and start minimized. Orderly Pi quit
closes completed idle Rex panes while preserving running or uncertain work.

See [packages/pi/extensions/command-runner/README.md](packages/pi/extensions/command-runner/README.md)
for recovery, requirements, and backend differences.

Package installation loads the `memory-guard` guidance but cannot create the
`~/.local/bin/make` proxy. Run `mise bootstrap` from a local checkout when
automatic make guarding is desired, or invoke `memrun` explicitly.

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

Refresh all APM dependencies with:

```bash
mise run skills:update
```

Review managed skill and `apm.lock.yaml` changes before committing the update.
The local link script remains the canonical workflow for developing this
checkout.

## Skills

| Area                 | Skills                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review               | `prepare-for-review`, `explain-pr`                                                                                                                                                                   |
| AI harness           | `ai-contribution-readiness-audit`, `ai-harness-bootstrap`, `skill-authoring`, `harness-evaluation`                                                                                                   |
| Development          | `go-development`, `neovim-plugin-development`                                                                                                                                                        |
| General workflows    | `collaborate`, `multi-model-evaluate`, `worktrunk-stack-prs`                                                                                                                                         |
| GitHub               | `create-pr`                                                                                                                                                                                          |
| Documentation        | `notion-docs`                                                                                                                                                                                        |
| Operations           | `memory-guard`                                                                                                                                                                                       |
| Provider work        | `triage-provider-issue`, `pulumi-rpc-lifecycle-investigation`, `bridge-parity-investigation`, `stage-pulumi-provider-repro`, `stage-terraform-provider-repro`, `investigate-converted-provider-docs` |
| Provider maintenance | `pulumi-upgrade-provider`, `upstream-patches`                                                                                                                                                        |

Archived skills live under `archive/skills/`. They are preserved for reference,
excluded from the Pi package, and not linked by the local installer.

## Review Coordination

`prepare-for-review` is a manually invoked author pass in the current session.
It uses the conversation as the source of truth to simplify the implementation,
apply relevant development guidance, document non-obvious code, and run focused
verification before independent review.

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
terminal process policy. Public instructions are composed by the agent-config package.

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

After updating the checkout, run `mise bootstrap` to apply the declared skill
links and memory guard proxy.

## Acknowledgements

- [spf13/go-skills](https://github.com/spf13/go-skills) — concrete-first, anti-layering Go guidance adapted into `go-development`
- [Go modernize analyzer](https://pkg.go.dev/golang.org/x/tools/go/analysis/passes/modernize) — version-aware mechanical modernization used by `go-development`
- [max-sixty/worktrunk](https://github.com/max-sixty/worktrunk) — worktree lifecycle and hook-based automation
- [obra/superpowers](https://github.com/obra/superpowers) — thinking and review patterns that still influence the repo
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — reference material that informed earlier experiments

## License

MIT
