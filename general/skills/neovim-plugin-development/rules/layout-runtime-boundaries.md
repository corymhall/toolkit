---
title: Keep runtimepath layout boundaries explicit
impact: HIGH
impactDescription: predictable loading behavior and fewer startup regressions
tags: layout, runtimepath, architecture
enforcement: review-only
---

## Keep runtimepath layout boundaries explicit

Use Neovim runtimepath conventions intentionally:

- `plugin/`: minimal startup entrypoints only (guarded with `vim.g.loaded_<plugin>`)
- `lua/<plugin>/`: implementation modules and public Lua API
- `ftplugin/`: filetype-specific logic
- `after/`: user/plugin overrides (lower priority than `plugin/`)
- `doc/`: vimdoc help files

Avoid mixing heavy implementation into startup files.

**Bad:**

```lua
-- plugin/myplugin.lua
local core = require("myplugin.core")
core.setup_everything()
```

**Good:**

```lua
-- plugin/myplugin.lua
if vim.g.loaded_myplugin then return end
vim.g.loaded_myplugin = true

vim.api.nvim_create_user_command("MyPluginOpen", function()
  require("myplugin.core").open()
end, { desc = "Open MyPlugin" })
```
