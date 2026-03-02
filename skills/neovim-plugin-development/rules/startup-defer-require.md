---
title: Defer require calls until execution paths
impact: HIGH
impactDescription: reduced eager work and better lazy behavior
tags: startup, require, lazy-loading
enforcement: mixed
---

## Defer require calls until execution paths

Do not eagerly `require()` heavy modules in startup-loaded files.
Move `require()` into command/keymap/autocmd callbacks.

**Bad:**

```lua
-- plugin/myplugin.lua
local mod = require("myplugin.mod")
vim.api.nvim_create_user_command("MyPluginRun", function()
  mod.run()
end, {})
```

**Good:**

```lua
-- plugin/myplugin.lua
vim.api.nvim_create_user_command("MyPluginRun", function()
  require("myplugin.mod").run()
end, { desc = "Run MyPlugin" })
```
