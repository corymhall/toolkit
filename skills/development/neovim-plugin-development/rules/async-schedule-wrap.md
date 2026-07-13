---
title: Use schedule wrapping for vim.uv callback API safety
impact: HIGH
impactDescription: avoids invalid API calls from libuv callbacks
tags: async, vim.uv, scheduling
enforcement: mixed
---

## Use schedule wrapping for vim.uv callback API safety

In `vim.uv` callbacks, do not directly call non-fast `vim.api` functions.
Use `vim.schedule_wrap` (or `vim.defer_fn` for one-shot timers) before invoking editor API calls.

**Bad:**

```lua
local timer = vim.uv.new_timer()
timer:start(1000, 0, function()
  vim.api.nvim_command('echomsg "tick"')
end)
```

**Good:**

```lua
local timer = vim.uv.new_timer()
timer:start(1000, 0, vim.schedule_wrap(function()
  vim.api.nvim_command('echomsg "tick"')
end))
```
