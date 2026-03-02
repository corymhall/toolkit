---
title: Keep keymaps non-intrusive and always described
impact: MEDIUM
impactDescription: fewer mapping conflicts and better discoverability
tags: keymap, ux, integration
enforcement: mixed
---

## Keep keymaps non-intrusive and always described

Keymap policy:

- avoid broad default global mappings that may conflict
- prefer `<Plug>` mappings, commands, or exported functions
- use buffer-local mappings when scope is buffer/filetype specific
- include `desc` on plugin-defined mappings

**Bad:**

```lua
vim.keymap.set("n", "<leader>r", function() require("myplugin").run() end)
```

**Good:**

```lua
vim.keymap.set("n", "<Plug>(MyPluginRun)", function()
  require("myplugin").run()
end, { desc = "Run MyPlugin" })
```
