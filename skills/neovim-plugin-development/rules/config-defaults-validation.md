---
title: Provide safe defaults and validate user config
impact: HIGH
impactDescription: fewer support issues and clearer user failure modes
tags: config, validation, setup
enforcement: mixed
---

## Provide safe defaults and validate user config

Configuration policy:

- defaults should work without extra setup
- merge overrides with `vim.tbl_deep_extend("force", defaults, opts or {})`
- validate types with `vim.validate` or equivalent checks
- surface unknown keys clearly (error, warning, or health output)
- setup should be idempotent

```lua
local defaults = { timeout = 1000, silent = false }

function M.setup(opts)
  M.config = vim.tbl_deep_extend("force", defaults, opts or {})
  vim.validate("timeout", M.config.timeout, "number")
  vim.validate("silent", M.config.silent, "boolean")
  -- surface unknown keys
  for k, _ in pairs(M.config) do
    if defaults[k] == nil then
      vim.notify(("[myplugin] unknown config key: %s"):format(k), vim.log.levels.WARN)
    end
  end
end
```

Avoid setup paths that silently ignore invalid options.
