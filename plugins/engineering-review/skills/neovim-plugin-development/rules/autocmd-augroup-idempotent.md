---
title: Define autocmds in augroups with idempotent behavior
impact: HIGH
impactDescription: prevents duplicate side effects on reload
tags: autocmd, augroup, reload
enforcement: mixed
---

## Define autocmds in augroups with idempotent behavior

Autocmd policy:

- group related autocmds with `nvim_create_augroup`
- use `clear = true` when reload should replace definitions
- scope by `buffer` when appropriate
- include `desc`
- wrap callbacks — do not pass functions that ignore extra arguments

Prefer callbacks that tolerate repeat execution without duplicate state mutations.

**Bad** — `vim.hl.on_yank` does not expect the autocmd args table:

```lua
vim.api.nvim_create_autocmd("TextYankPost", { callback = vim.hl.on_yank })
```

**Good:**

```lua
vim.api.nvim_create_autocmd("TextYankPost", {
  group = vim.api.nvim_create_augroup("myplugin_yank", { clear = true }),
  desc = "Highlight on yank",
  callback = function() vim.hl.on_yank() end,
})
```
