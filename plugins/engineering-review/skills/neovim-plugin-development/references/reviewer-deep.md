# Neovim Plugin Reviewer Deep Contract

Use this reference for deep Neovim-specific review passes. For implementation
work, use the main `neovim-plugin-development` skill instead.

There is no dedicated Neovim reviewer lane yet. Use this reference from
`request-review` only when a generic review would likely miss Neovim runtime,
startup, or plugin UX issues.

## Review Goals

- Apply Neovim plugin judgment rather than a generic Lua review pass.
- Use the tooling gate when practical and treat its output as evidence.
- Inspect all relevant rule files and checklist sections for the changed plugin
  surfaces.
- Focus on runtimepath layout, startup/lazy-loading, setup/config behavior,
  keymap/autocmd hygiene, `vim.uv` callback safety, health checks, vimdoc, and
  release/deprecation behavior.

## Workflow

1. Start with the `neovim-plugin-development` tooling gate when practical:
   - prefer project-configured `stylua`, `selene` or `luacheck`, health checks,
     and test runners
   - otherwise use the portable fallback gate from the main skill
2. Check the supported Neovim version before applying API or deprecation
   findings.
3. Use `references/lint-coverage-matrix.md` to decide where manual review is
   still required.
4. Use `references/neovim-plugin-checklist.md` for policy-level pass/fail
   checks when the change spans several plugin surfaces.
5. Run targeted behavioral smoke tests when `nvim --headless` is available and
   the changed behavior depends on runtime state.

## Behavioral Smoke Tests

Use these when relevant to the diff:

- setup idempotency: call `setup()` twice and verify no duplicate autocmds,
  commands, or global state mutations
- unknown config keys: pass an unknown key and verify warning, error, or health
  visibility
- docs alignment: compare documented keymaps, commands, setup options, and
  health checks with actual registrations

If a smoke test is skipped, report the skip reason and resulting risk.

## Output Contract

For each finding, include:

- severity
- `automated`, `mixed`, or `review-only`
- source rule file or checklist section
- required action
- verification evidence

Also include:

- commands run, including failures or skips
- explicit testing statement
- behavioral smoke test statement when runtime behavior was relevant

When there are no meaningful Neovim-specific findings, say that explicitly and
add any residual runtime, documentation, or verification risk instead of
describing your process.
