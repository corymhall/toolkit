# Neovim Plugin Checklist

Use this as a pass/fail checklist for implementation and review.
When reporting findings, cite the corresponding file in `../rules/`.

## 1) Runtime Layout and Loading

- Guard `plugin/<name>.lua` with `vim.g.loaded_<plugin>` to prevent double-loading.
- Keep startup entrypoints minimal in `plugin/<name>.lua` when present.
- Put implementation in `lua/<plugin>/...` modules.
- Use `ftplugin/<filetype>.lua` for filetype-specific behavior.
- Keep `doc/<plugin>.txt` help docs available.
- Avoid module side effects on `require()` that are not required for API exposure.

## 2) Startup and Lazy Behavior

- Do not eagerly `require()` heavy modules from startup-loaded files.
- Defer `require()` to command/keymap/autocmd callbacks when possible.
- Ensure plugin works without forcing users to micromanage lazy-loading in plugin managers.
- Measure startup impact when relevant (`--startuptime` or project profiler).

## 3) Configuration and Initialization

- Provide safe defaults that work out of the box.
- Merge overrides with `vim.tbl_deep_extend("force", defaults, opts or {})`.
- Prefer **separated** `setup()`: store config only, defer initialization to commands/autocmds/lazy-loading. This lets plugins work with defaults without requiring an explicit `setup()` call.
- Use **combined** `setup()` (config + initialization) only when initialization order matters — but note this forces users to call `setup()` even for defaults.
- Validate config types (`vim.validate`) and surface unknown keys.
- Make setup idempotent (guard repeated setup calls).

## 4) Public API, Commands, Keymaps

- Prefer exported Lua functions and/or user commands for actions.
- Avoid unbounded global default keymaps that can conflict with user mappings.
- If creating mappings, provide `desc`.
- Consider `<Plug>` mappings for stable, composable integration points.

## 5) Autocommands

- Place related autocommands in explicit augroups.
- Use `clear = true` when reloading should replace definitions.
- Keep callbacks idempotent and buffer-scoped where appropriate.
- Wrap callbacks — do not pass bare functions that ignore the autocmd args table.
- Add `desc` for plugin-defined autocommands.
- Set custom filetypes as late as possible so users can override buffer-local settings.

## 6) Async and API Safety

- In `vim.uv` callbacks, do not call non-fast `vim.api` directly.
- Use `vim.schedule_wrap`/`vim.defer_fn` when crossing event-loop boundaries.
- Handle optional integrations with `pcall(require, ...)`.

## 7) Health, Errors, and Diagnostics

- Ship `lua/<plugin>/health.lua` and validate:
  - Neovim minimum version
  - required dependencies/plugins/tools
  - setup state and major misconfigurations
- Report actionable errors/warnings (`vim.notify`, health messages).

## 8) Documentation and UX

- Keep README install/setup examples aligned with real code paths.
- Provide vimdoc with `:help` tags and command/keymap references.
- Include a minimal reproducible config path for bug reports.

## 9) Testing and CI

- Include tests for setup delegation, core command/API behavior, and regressions.
- Run formatting/lint/type checks in CI.
- Consider LuaCATS/EmmyLua annotations (`---@type`, `---@param`, `---@return`) with `lua-language-server` for CI type checking.
- Keep release/version automation explicit.

## 10) Releases and Compatibility

- Use SemVer tags/releases.
- Use deprecation messaging for breaking transitions (`vim.deprecate` when applicable).
- Declare Neovim version floor and compatibility expectations.
