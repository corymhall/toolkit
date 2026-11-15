local lsps = {
  'jdtls',
  'bashls', -- https://github.com/bash-lsp/bash-language-server
  'dockerls', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#dockerls
  -- 'golangci_lint_ls', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#golangci_lint_ls
  'marksman', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#marksman
  'pyright', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#pyright
  'svelte', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#svelte
  'terraform-ls', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#terraformls
  'eslint', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#eslint
  'vtsls',
  'oxlint',
  'gopls',
  'lua_ls',
  -- 'csharp_ls',
}
return {
  {
    'icholy/lsplinks.nvim',
    opts = {},
    keys = {
      { 'gx', function() require('lsplinks').gx() end, desc = 'Open link under cursor' },
    },
  },
  {
    'neovim/nvim-lspconfig',
    dependencies = {
      { 'nvim-java/nvim-java' },
      {
        -- Automatically install LSPs and related tools to stdpath for neovim
        'WhoIsSethDaniel/mason-tool-installer.nvim',
        dependencies = {
          {
            -- need mason-lspconfig to install servers based on the lsp name not the tool name
            { 'williamboman/mason-lspconfig.nvim' },
            { 'williamboman/mason.nvim', opts = {} },
          },
        },
        opts = {
          ensure_installed = vim.list_extend({
            'stylua', -- used to format lua code
            'shellcheck',
            'shfmt', -- https://github.com/patrickvane/shfmt
            'prettierd',
            'golangci_lint_ls',
            -- TODO: can't handle latest version
            -- { 'golangci-lint', version = 'v1.64.8' },
            'black',
            'goimports',
            'gh-actions-language-server', -- https://github.com/neovim/nvim-lspconfig/blob/master/doc/configs.md#gh_actions_ls
          }, lsps),
        },
      },
      {
        'folke/lazydev.nvim',
        ft = 'lua',
        opts = {
          library = {
            { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
            { path = 'snacks.nvim', words = { 'Snacks' } },
          },
        },
      },
    },
    config = function()
      require('custom.plugins.lsp.diagnostics').setup()
      -- vim.lsp.set_log_level 'debug'

      local ignoredProjects = { '/Users/chall/work/pulumi-aws' }
      local cwd = vim.uv.cwd()
      for _, project in ipairs(ignoredProjects) do
        if not cwd:find(project, 1, true) then vim.lsp.enable 'golangci_lint_ls' end
      end

      -- require('java').setup()
      vim.lsp.enable(vim.list_extend({ 'gh_actions_ls' }, lsps))

      vim.api.nvim_create_autocmd('LspAttach', {
        group = vim.api.nvim_create_augroup('kickstart-lsp-attach', { clear = true }),
        callback = function(event)
          local map = function(keys, func, desc)
            vim.keymap.set('n', keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
          end

          local client = assert(vim.lsp.get_client_by_id(event.data.client_id), 'must have a valid client')
          if client and client:supports_method(vim.lsp.protocol.Methods.textDocument_documentHighlight, event.buf) then
            -- The following autocommands are used to highlight references of the word under
            -- your cursor when your cursor rests there for a little while.
            -- When you move your cursor, the highlights will be cleared
            local highlight_augroup = vim.api.nvim_create_augroup('kickstart-lsp-highlight', { clear = false })
            vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
              buffer = event.buf,
              group = highlight_augroup,
              callback = vim.lsp.buf.document_highlight,
            })
            vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
              buffer = event.buf,
              group = highlight_augroup,
              callback = vim.lsp.buf.clear_references,
            })
            vim.api.nvim_create_autocmd('LspDetach', {
              group = vim.api.nvim_create_augroup('kickstart-lsp-detach', { clear = true }),
              callback = function(event2)
                vim.lsp.buf.clear_references()
                vim.api.nvim_clear_autocmds { group = 'kickstart-lsp-highlight', buffer = event2.buf }
              end,
            })
          end

          -- semantic tokens makes colorschemes different
          client.server_capabilities.semanticTokensProvider = nil

          -- -- workaround for https://github.com/golang/go/issues/54531#issuecomment-1464982242
          -- if client.name == 'gopls' and not client.server_capabilities.semanticTokensProvider then
          --   local semantic = client.config.capabilities.textDocument.semanticTokens
          --   client.server_capabilities.semanticTokensProvider = {
          --     full = true,
          --     legend = { tokenModifiers = semantic.tokenModifiers, tokenTypes = semantic.tokenTypes },
          --     range = true,
          --   }
          -- end

          map(
            'gd',
            function()
              Snacks.picker.lsp_definitions {
                layout = 'vertical',
              }
            end,
            '[G]oto [D]efinition'
          )
          map('gr', function() Snacks.picker.lsp_references { layout = 'vertical' } end, '[G]oto [R]eferences')
          map(
            'gi',
            function() Snacks.picker.lsp_implementations { layout = 'vertical' } end,
            '[G]oto [I]mplementations'
          )
          map(
            'gt',
            function() Snacks.picker.lsp_type_definitions { layout = 'vertical' } end,
            '[G]oto [T]ype Definitions'
          )
          map('<leader>e', vim.diagnostic.open_float, '[D]iagnostics [L]ine')
          map('<leader>ca', vim.lsp.buf.code_action, '[C]ode [A]ction')
          map('<leader>rn', vim.lsp.buf.rename, '[R]e[n]ame')
          map('K', vim.lsp.buf.hover, 'Hover')
        end,
      })
    end,
  },
}
