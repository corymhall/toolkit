local M = {}

M.signs = { Error = '󰅚 ', Warn = '󰀪 ', Hint = '󰌶', Info = ' ' }

function M.setup()
  -- Automatically update diagnostics
  vim.diagnostic.config {
    severity_sort = true,
    float = { boarder = 'rounded', source = true },
    underline = { severity = vim.diagnostic.severity.ERROR },
    virtual_text = {
      spacing = 2,
      prefix = '●',
      -- source = 'if_many',
    },
    signs = {
      text = {
        [vim.diagnostic.severity.ERROR] = M.signs.Error,
        [vim.diagnostic.severity.WARN] = M.signs.Warn,
        [vim.diagnostic.severity.HINT] = M.signs.Hint,
        [vim.diagnostic.severity.INFO] = M.signs.Info,
      },
    },
  }

  -- vim.lsp.handlers['workspace/diagnostic/refresh'] = function(_, _, ctx)
  --   local ns = vim.lsp.diagnostic.get_namespace(ctx.client_id)
  --   pcall(vim.diagnostic.reset, ns)
  --   return true
  -- end

  for type, icon in pairs(M.signs) do
    local hl = 'DiagnosticSign' .. type
    vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = '' })
  end
end

return M
