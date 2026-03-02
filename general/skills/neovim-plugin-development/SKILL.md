---
name: neovim-plugin-development
description: Implement, refactor, and review Neovim plugins in Lua using official runtimepath/module-loading, startup/lazy-loading, keymap/autocmd, health, documentation, and release practices. Use when building plugin features, reviewing plugin PRs, modernizing plugin architecture, or debugging plugin startup/performance issues.
---

# Neovim Plugin Development

Use this skill in one of two execution profiles.

## Profiles

### Implementer-Fast (default)

1. Run tooling gate first.
2. If tooling passes, read only rules that match changed risk areas.
3. Implement with minimal policy overhead.

### Reviewer-Deep

1. Run tooling gate.
2. Review all rule files and all checklist sections (exhaustive by default).
3. Run required behavioral smoke tests when `nvim --headless` is available.
4. Report both passes and gaps with severity and evidence.

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

If tests exist, include them in both profiles (for example `busted`, `plenary`, or project-specific test runners).

## Behavioral Smoke Tests (Reviewer-Deep)

When `nvim --headless` is available, run these runtime checks:

- setup idempotency: call `setup()` twice and verify no duplicate autocmds/commands
- unknown config keys: pass an unknown key and verify warning/error/health visibility
- docs alignment: compare documented keymaps/commands with actual registrations

If a smoke test is skipped, report: skip reason and resulting risk.

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

Use `references/neovim-plugin-checklist.md` for policy-level pass/fail checks.

## Reviewer Output Contract

Reviewer output must include all of the following:

1. Coverage table for every rule file and every checklist section:
   - status: `pass`, `fail`, or `not-applicable`
   - enforcement type: `automated`, `mixed`, or `review-only`
   - evidence (command output, file/line, or direct inspection note)
   - linked smoke test evidence when runtime behavior is relevant
2. Findings list (fails only), ordered by severity.
3. Commands run, including failures/skips and reasons.
4. Explicit testing statement:
   - tests run + results, or
   - why tests were not run and resulting risk.
5. Behavioral smoke test statement:
   - each required smoke test with command + observed result, or
   - skipped with reason + risk.

For each finding, include:

- severity
- `automated` / `mixed` / `review-only`
- source checklist section
- required action
- verification evidence

## References

- `references/neovim-plugin-checklist.md` - official-practice checklist + Folke patterns
- `references/lint-coverage-matrix.md` - rule-to-enforcement routing

## Source Alignment

- Neovim plugin guide: `https://github.com/neovim/neovim/blob/master/runtime/doc/lua-plugin.txt`
- Neovim Lua guide: `https://github.com/neovim/neovim/blob/master/runtime/doc/lua-guide.txt`
- Neovim Lua reference: `https://github.com/neovim/neovim/blob/master/runtime/doc/lua.txt`
- Folke examples: `https://github.com/folke/sidekick.nvim`, `https://github.com/folke/snacks.nvim`
