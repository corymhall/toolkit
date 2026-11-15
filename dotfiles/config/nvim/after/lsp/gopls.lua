return {
  settings = {
    gopls = {
      semanticTokens = false,
      -- semanticTokens = true,
      -- takes too much memory on large projects
      analyses = {
        nilness = true,
        unusedparams = true,
        unusedwrite = true,
        useany = true,
      },
      staticcheck = false, -- too much memory
      directoryFilters = { '-.git', '-.vscode', '-node_modules' },
      -- hints = {
      --   constantValues = true,
      --   rangeVariableTypes = true,
      -- },
      codelenses = { test = true },
    },
  },
  flags = {
    debounce_text_changes = 200,
  },
}
