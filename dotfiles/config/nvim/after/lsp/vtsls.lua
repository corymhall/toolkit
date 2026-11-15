---@type vim.lsp.Config
return {
  init_options = {
    -- logVerbosity = 'verbose',
    maxTsServerMemory = 8192,
    -- keep the rest of your settings…
  },
  settings = {
    complete_function_calls = false,
    vtsls = {
      -- TODO: this might be interesting, but needs client support
      -- enableMoveToFileCodeAction = true,
      -- use workspace version of typescript lib on startup instead of bundled version
      autoUseWorkspaceTsdk = true,
      experimental = {
        completion = {
          -- execute fuzzy match of completion items on server side. Can help filter out useless completion items from tsserver
          enableServerSideFuzzyMatch = true,
        },
      },
    },
    typescript = {
      tsserver = {
        maxTsServerMemory = 8192,
      },
      reportStyleChecksAsWarnings = false,
      implementationsCodeLens = {
        showOnInterfaceMethods = true,
        enabled = true,
      },
      format = { enable = false },
      updateImportsOnFileMove = { enabled = 'always' },
      inlayHints = {
        functionLikeReturnTypes = { enabled = true },
      },
      suggest = {
        completeFunctionCalls = true,
      },
    },
  },
  server_capabilities = {
    documentFormattingProvider = false,
    documentRangeFormattingProvider = false,
  },
}
