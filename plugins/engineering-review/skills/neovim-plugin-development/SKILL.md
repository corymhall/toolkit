---
name: neovim-plugin-development
description: Implement, refactor, modernize, and debug Neovim plugins in Lua using official runtimepath/module-loading, startup/lazy-loading, keymap/autocmd, health, documentation, and release practices. For review-only work, prefer request-review and load the Neovim reviewer reference when needed.
---

# Neovim Plugin Development

Use this skill for writing and changing Neovim plugin code. Keep the main
session focused on the implementation outcome, and load only the Neovim rules
that match the plugin surface being touched.

For review-only work, prefer `request-review`. There is no dedicated Neovim
reviewer lane yet; use [references/reviewer-deep.md](references/reviewer-deep.md)
when a deep Neovim-specific review pass is actually needed.

## Implementer Profile

1. Inspect the plugin layout, supported Neovim version, local style, and test
   tooling.
2. Run the tooling gate when practical, or note why it is too expensive or
   blocked.
3. Read only the rule files that match changed risk areas.
4. Implement with minimal policy overhead.
5. Verify the behavior that changed, especially startup, setup, autocmd,
   keymap, health, or docs behavior when touched.

## Tooling Gate First

When project tooling is present:

```bash
stylua --check .
selene .
nvim --headless "+checkhealth <plugin-name>" +qa
```

Fallback (portable baseline):

```bash
stylua --check . || true
nvim --headless "+checkhealth" +qa || true
```

If tests exist, include them when they are relevant to the change (for example
`busted`, `plenary`, or project-specific test runners).

## Behavioral Smoke Tests

When `nvim --headless` is available and the change touches the relevant
behavior, run targeted runtime checks:

- setup idempotency: call `setup()` twice and verify no duplicate autocmds/commands
- unknown config keys: pass an unknown key and verify warning/error/health visibility
- docs alignment: compare documented keymaps/commands with actual registrations

If an important smoke test is skipped, report the skip reason and resulting
risk.

## Rule Categories

- `startup-*`: startup footprint, lazy entrypoints, deferred `require()`
- `layout-*`: `plugin/`, `lua/`, `ftplugin/`, `doc/` layout boundaries
- `api-*`: public Lua API surface and command design
- `config-*`: defaults, merge strategy, validation, unknown key handling
- `keymap-*`: avoid forced globals; favor `<Plug>`/functions/commands
- `autocmd-*`: augroup hygiene, idempotency, descriptions, buffer-local scope
- `health-*`: dependency and setup diagnostics via `:checkhealth`
- `async-*`: `vim.uv` callback safety and scheduled API calls
- `docs-*`: vimdoc + actionable install/config/minimal-repro docs
- `release-*`: SemVer, deprecations, migration notes, compatibility windows

## Rule Files

- `rules/layout-runtime-boundaries.md`
- `rules/startup-minimal-entrypoint.md`
- `rules/startup-defer-require.md`
- `rules/config-defaults-validation.md`
- `rules/api-exported-entrypoints.md`
- `rules/keymap-nonintrusive-desc.md`
- `rules/autocmd-augroup-idempotent.md`
- `rules/async-schedule-wrap.md`
- `rules/health-checks-actionable.md`
- `rules/docs-vimdoc-and-repro.md`
- `rules/release-semver-deprecations.md`
- `rules/verification-baseline-suite.md`

## What To Read Next

Use `references/lint-coverage-matrix.md` to decide depth:

- `automated`: trust tooling output first
- `mixed`: check tooling output plus rule intent
- `review-only`: always evaluate manually

For implementation, load targeted rules based on the work:

- runtimepath layout or startup files:
  `rules/layout-runtime-boundaries.md`,
  `rules/startup-minimal-entrypoint.md`
- lazy-loading or startup performance:
  `rules/startup-defer-require.md`
- configuration, defaults, setup, or validation:
  `rules/config-defaults-validation.md`
- public Lua API, commands, or user-facing actions:
  `rules/api-exported-entrypoints.md`
- keymaps or command descriptions:
  `rules/keymap-nonintrusive-desc.md`
- autocmds, augroups, or reload behavior:
  `rules/autocmd-augroup-idempotent.md`
- `vim.uv`, timers, jobs, or callbacks:
  `rules/async-schedule-wrap.md`
- health checks or diagnostics:
  `rules/health-checks-actionable.md`
- README, vimdoc, or bug-report instructions:
  `rules/docs-vimdoc-and-repro.md`
- release, compatibility, or deprecation behavior:
  `rules/release-semver-deprecations.md`

Use `references/neovim-plugin-checklist.md` for broader policy-level checks
when the change spans several plugin surfaces.

## References

- `references/neovim-plugin-checklist.md` - official-practice checklist + Folke patterns
- `references/lint-coverage-matrix.md` - rule-to-enforcement routing
- `references/reviewer-deep.md` - deep Neovim review contract

## Source Alignment

- Neovim plugin guide: `https://github.com/neovim/neovim/blob/master/runtime/doc/lua-plugin.txt`
- Neovim Lua guide: `https://github.com/neovim/neovim/blob/master/runtime/doc/lua-guide.txt`
- Neovim Lua reference: `https://github.com/neovim/neovim/blob/master/runtime/doc/lua.txt`
- Folke examples: `https://github.com/folke/sidekick.nvim`, `https://github.com/folke/snacks.nvim`
