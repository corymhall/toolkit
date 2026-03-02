# Neovim Plugin Lint Coverage Matrix

Map checks to enforcement style so implementers and reviewers know what must be inspected manually.

## Automated

- Lua formatting (`stylua --check .`)
- Lua lint/static checks (`selene .`, `luacheck .`, or repo equivalent)
- Type checking with `lua-language-server` and LuaCATS annotations (when configured)
- Unit/spec tests (project test command)
- Smoke health invocation (`nvim --headless "+checkhealth <plugin-name>" +qa`)
- Source rules:
  - `rules/verification-baseline-suite.md` (tooling portion)

## Mixed (Tooling + Manual)

- Startup/lazy-load boundaries
  - Tooling can catch some perf/smell signals; reviewer confirms defer strategy and entrypoint size.
  - Source rules: `rules/startup-minimal-entrypoint.md`, `rules/startup-defer-require.md`
- Config validation quality
  - Tooling catches syntax/type hints; reviewer verifies unknown-key and type-validation behavior.
  - Source rules: `rules/config-defaults-validation.md`
- Command and keymap ergonomics
  - Tooling catches syntax; reviewer verifies `desc`, mapping scope, and user conflict risk.
  - Source rules: `rules/keymap-nonintrusive-desc.md`, `rules/api-exported-entrypoints.md`
- Autocmd lifecycle hygiene
  - Tooling catches obvious mistakes; reviewer verifies augroup strategy and duplicate protection.
  - Source rules: `rules/autocmd-augroup-idempotent.md`, `rules/async-schedule-wrap.md`

## Review-Only

- Architectural separation (`plugin/` vs `lua/` vs `ftplugin/` responsibilities)
- Source rule: `rules/layout-runtime-boundaries.md`
- Public API clarity and long-term compatibility
- Source rule: `rules/api-exported-entrypoints.md`
- Health check usefulness (actionable diagnostics, not only presence)
- Source rule: `rules/health-checks-actionable.md`
- Documentation fidelity (README/vimdoc/examples match real behavior)
- Source rule: `rules/docs-vimdoc-and-repro.md`
- Release/deprecation policy quality and migration clarity
- Source rule: `rules/release-semver-deprecations.md`

## Verification Baseline

For implementers and reviewers, run:

```bash
stylua --check .
selene .
nvim --headless "+checkhealth <plugin-name>" +qa
# plus project test command
```

If one command is unavailable in the target repo, document that gap and run the strongest available substitute.
