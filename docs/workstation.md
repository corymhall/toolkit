# Workstation configuration

Toolkit owns public configuration and reusable tools. The optional `../config-private` checkout
contains sensitive additions. Toolkit works without it.

## Layout

- `mise.toml` declares tools, dotfile links, and bootstrap tasks.
- `go.mod` is the sole Go module; `main.go` starts the `toolkit` CLI.
- `cmd/*.go` owns CLI commands. Domain packages are added only as needed.
- `bin/` contains small command-line helpers.
- `dotfiles/` contains public application preferences and themes.
- `agent-config/` contains public instructions and shared MCP declarations.
- `packages/agent-config/` composes installed instructions and settings using Node.
- `packages/pi/` and `packages/rex/` contain the reusable components.
- `skills/` and `.agents/skills/` contain public and managed third-party skills.

Root mise configuration manages repository development and bootstrap. The payload at
`dotfiles/config/mise/` separately manages workstation-wide tools.

## Monorepo tasks

Each component owns `packages/<name>/mise.toml`. Root `monorepo.config_roots`
discovers these configurations. npm workspaces discover Node projects, and the
workspace graph explicitly registers Rex and the root shared configuration.
Pi depends on Rex. Every component depends on root shared inputs so affected
selection includes components when shared configuration changes.

```sh
mise run check
mise run test
mise run validate
mise run //packages/pi:test
mise tasks graph --explain
mise run --affected --affected-explain --dry-run check
```

Root aggregates use task dependencies rather than nested mise invocations.
New components should expose only meaningful tasks. `check` verifies source,
`test` runs behavioral tests, and `build` produces real artifacts. There is no
package-wide build wrapper. The root `build` task builds the Go CLI into `.build/toolkit`.

One root npm provider installs the workspace lockfile and tracks package manifests.
Pi owns its npm scripts. All projects share root tool versions and npm dependencies.

Only deterministic Pi format and lint checks use local content-based freshness.
Their sources include shared configs, manifests, and lockfiles. Tests, bootstrap,
configuration generation, updates, and installation always run. Add artifact caching
only when a component has a real build with explicit outputs inside its directory.
Private inputs and generated home configuration must never enter a public cache.

Go uses Evaler's Cobra command-factory structure and golangci-lint configuration,
including modernization checks. Run `mise run build` to lint, test, and build the
CLI. `mise run install:toolkit` explicitly installs it into `~/.local/bin`.
The managed `cobra-viper` skill is pinned to the same upstream revision as Evaler.
Repository tooling under `scripts/` runs as TypeScript through Node. Product CLIs
are Go; skill-owned Python remains exempt for now. Rex messaging, tracking,
resume, and snapshots are implemented in the root `rex/` Go package and exposed
through `toolkit rex`. `packages/rex` contains terminal configuration and the
small shell pickers, with no Python runtime or Python test harness.

## Bootstrap

From this checkout:

```sh
mise bootstrap --dry-run
mise bootstrap --yes
mise dotfiles status
```

Mise installs tools and applies the declared links. A final bootstrap hook invokes the
agent-config apply task. Native bootstrap currently does not discover qualified monorepo
task names, so this hook bridges that entry point into the task graph. npm workspace dependencies are installed through mise's npm dependency
provider. There is one npm lockfile and no separate package-manager setup for the generator.

For private additions, also preview and bootstrap the private checkout:

```sh
mise -C ../config-private bootstrap --dry-run
mise -C ../config-private bootstrap --yes
mise -C ../config-private dotfiles status
```

The private configuration declares its own skill and review-prompt links. Its bootstrap task
invokes the public bootstrap with `TOOLKIT_PRIVATE_ROOT` set, so generated files include private
inputs. A dry run prints that nested command rather than executing it; preview the public
checkout separately to see its complete link and tool plan.

Use mise's built-in status, diff, and apply commands for dotfile state. There is no separate
installer or check-install script. Bootstrap does not start terminal services or reload Pi.

## Composed configuration

Dotfiles are linked directly from their declaring checkout. Generated settings and instructions
are regular local files written by `packages/agent-config`; do not declare them as dotfile links.

Settings precedence is existing local settings, public defaults, then private overrides.
Unknown local fields, including Codex project history and app-managed plugins, stay local.
Objects merge recursively; arrays and scalars replace; null is literal. MCP entries merge by
name. Removing a declaration does not delete a previously installed entry.

Instructions concatenate public shared, public harness-specific, private shared, then private
harness-specific text. Private inputs are optional:

```text
config-private/
├── mise.toml
├── instructions/shared.md
├── instructions/<harness>.md
├── settings/mcp-servers.json
├── settings/<harness>/...
├── skills/
└── reviews/
```

The generator registers `packages/pi` without removing unrelated Pi packages. Credential values
belong in secret stores, not either checkout. Generated files use mode 0600 and atomic per-file
replacement. They are not stored in Git or managed by `mise dotfiles status`.

To exercise generation without changing live configuration:

```sh
mise run //packages/agent-config:generate -- --output /tmp/config-preview
```

Pass `--private /path/to/config-private` when needed. Outputs must stay outside the public
checkout and may contain private local app state. Verify local scripts through their real
commands and output, not separate mock or installation smoke-test suites.
