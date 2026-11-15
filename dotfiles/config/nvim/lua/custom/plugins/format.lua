local function javascript_formatters(bufnr)
  local filename = vim.api.nvim_buf_get_name(bufnr)
  local start = vim.fs.dirname(filename)

  local function has_local_command(command)
    local package_json = vim.fs.find('package.json', {
      path = start,
      upward = true,
    })[1]

    if not package_json then return false end

    local project_dir = vim.fs.dirname(package_json)
    return vim.fn.executable(project_dir .. '/node_modules/.bin/' .. command) == 1
  end

  if has_local_command 'oxfmt' then return { 'oxfmt' } end
  if has_local_command 'prettier' then return { 'prettierd' } end

  return {}
end
return { -- Autoformat
  'stevearc/conform.nvim',
  event = { 'BufWritePre' },
  cmd = { 'ConformInfo' },
  keys = {
    {
      '<leader>bF',
      function()
        require('conform').format {
          formatters = { 'prettierd' },
          lsp_format = 'never',
        }
      end,
      desc = '[B]uffer [F]ormat with Prettier',
    },
    {
      '<leader>bf',
      function()
        local bufnr = vim.api.nvim_get_current_buf()
        if vim.bo[bufnr].filetype == 'go' then
          require('conform').format {
            formatters = { 'golines' },
          }
        end
        if vim.bo[bufnr].filetype == 'typescript' then
          require('vtsls').commands.remove_unused_imports()
          require('vtsls').commands.add_missing_imports()
        end
      end,
      desc = '[B]uffer [F]ormat',
    },
  },
  init = function()
    vim.api.nvim_create_user_command('FormatDisable', function(args)
      if args.bang then
        -- FormatDisable! will disable formatting just for this buffer
        vim.b.disable_autoformat = true
      else
        vim.g.disable_autoformat = true
      end
    end, {
      desc = 'Disable autoformat-on-save',
      bang = true,
    })
    vim.api.nvim_create_user_command('FormatEnable', function()
      vim.b.disable_autoformat = false
      vim.g.disable_autoformat = false
    end, {
      desc = 'Re-enable autoformat-on-save',
    })
  end,
  config = function()
    require('conform').setup {
      formatters = {
        prettierd = {
          env = {
            PRETTIERD_DEFAULT_CONFIG = vim.fn.stdpath 'config' .. '/formatter-config/prettier.json',
          },
        },
        golines = {
          inherit = false,
          command = 'golines',
          args = { '-m', '120', '-t', '1' },
        },
      },
      default_format_opts = {
        timeout_ms = 3000,
        lsp_format = 'fallback',
        async = false,
        quiet = false,
      },
      notify_on_error = true,
      format_on_save = function(bufnr)
        if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then return end
        return {
          timeout_ms = 3000,
          lsp_format = 'fallback',
          -- Conform only accepts this filter in per-call or filetype options.
          filter = function(client) return client.name ~= 'vtsls' end,
        }
      end,
      formatters_by_ft = {
        python = { 'black' },
        html = javascript_formatters,
        javascript = javascript_formatters,
        css = javascript_formatters,
        -- svelte
        svelte = javascript_formatters,
        swift = javascript_formatters,
        lua = { 'stylua' },
        -- go = { 'goimports', 'gci', async = true },
        -- go = { 'goimports', 'golangci-lint', lsp_format = 'first', async = true },
        go = { 'goimports' },
        typescript = javascript_formatters,
        markdown = javascript_formatters,
      },
    }
  end,
}
