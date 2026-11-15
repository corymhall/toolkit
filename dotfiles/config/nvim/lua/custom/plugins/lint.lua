return {
  'mfussenegger/nvim-lint',
  event = { 'BufReadPre', 'BufNewFile' },
  config = function()
    local lint = require 'lint'

    lint.linters_by_ft = {
      swift = { 'swiftlint' },
      -- go = { "golangcilint" },
    }

    local lint_augroup = vim.api.nvim_create_augroup('lint', { clear = true })

    vim.api.nvim_create_autocmd({ 'BufWritePost', 'BufReadPost' }, {
      group = lint_augroup,
      callback = function() require('lint').try_lint() end,
    })
  end,
}
