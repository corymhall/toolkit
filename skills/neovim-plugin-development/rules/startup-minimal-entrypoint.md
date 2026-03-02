---
title: Keep startup entrypoints minimal and focused
impact: HIGH
impactDescription: faster startup and safer plugin composition
tags: startup, performance, lazy-loading
enforcement: mixed
---

## Keep startup entrypoints minimal and focused

Anything in `plugin/*.lua` runs at startup. Keep these files tiny:

- guard with `vim.g.loaded_<plugin>` to prevent double-loading
- define commands, mappings, and lightweight autocmd wiring
- avoid heavy initialization
- avoid loading submodules until invocation time

```lua
-- plugin/myplugin.lua
if vim.g.loaded_myplugin then return end
vim.g.loaded_myplugin = true

vim.api.nvim_create_user_command("MyPluginRun", function()
  require("myplugin").run()
end, { desc = "Run MyPlugin" })
```

Prefer measuring startup impact with `--startuptime` when changes touch startup logic.
