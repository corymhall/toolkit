---@diagnostic disable: missing-fields
return {
  {
    'folke/which-key.nvim',
    opts = {
      spec = {
        {
          { '<leader>t', group = '[T]est' },
        },
      },
    },
  },
  {
    'andythigpen/nvim-coverage',
    version = '*',
    config = function()
      require('coverage').setup {
        auto_reload = true,
      }
    end,
  },
  {
    'nvim-neotest/neotest',
    -- commit = '52fca6717ef972113ddd6ca223e30ad0abb2800c',
    ft = { 'typescript', 'javascript', 'go', 'python' },
    dependencies = {
      {
        'fredrikaverpil/neotest-golang',
        dependencies = {
          'leoluz/nvim-dap-go',
        },
      },
      'nvim-lua/plenary.nvim',
      'nvim-neotest/nvim-nio',
      -- 'nvim-treesitter/nvim-treesitter',
      { 'nvim-neotest/neotest-python' },
      { 'nvim-neotest/neotest-jest' },
      'antoinemadec/FixCursorHold.nvim',
    },
    keys = {
      {
        '<leader>ta',
        function() require('neotest').run.run(vim.fn.expand '%') end,
        desc = 'Neotest run current file',
      },
      {
        '<leader>tt',
        function() require('neotest').run.run() end,
        desc = 'Neotest run current test',
      },
      {
        '<leader>to',
        function() require('neotest').output.open() end,
        desc = 'Neotest open output',
      },
      {
        '<leader>tl',
        function() require('neotest').run.run_last() end,
        desc = 'Neotest run last test',
      },
      {
        '<leader>ts',
        function() require('neotest').summary.toggle() end,
        desc = 'Neotest toggle summary',
      },
      {
        '<leader>tn',
        function() require('neotest').jump.next { status = 'failed' } end,
        desc = 'Neotest jump to next failed test',
      },
      {
        '<leader>tp',
        function() require('neotest').output_panel.toggle() end,
        desc = 'Neo[T]est toggle output [P]annel',
      },
      {
        '<leader>dt',
        function() require('neotest').run.run { suite = false, strategy = 'dap' } end,
        desc = 'Neotest run current test with dap',
      },
    },
    config = function()
      vim.fn.sign_define('DapBreakpoint', { text = '🧘', texthl = '', linehl = '', numhl = '' })
      vim.fn.sign_define('DapStopped', { text = '🏃', texthl = '', linehl = '', numhl = '' })
      -- get neotest namespace (api call creates or returns namespace)
      local neotest_ns = vim.api.nvim_create_namespace 'neotest'
      vim.diagnostic.config({
        virtual_text = {
          format = function(diagnostic)
            local message = diagnostic.message:gsub('\n', ' '):gsub('\t', ' '):gsub('%s+', ' '):gsub('^%s+', '')
            return message
          end,
        },
      }, neotest_ns)

      require('neotest').setup {
        log_level = 1,
        discovery = {
          -- Drastically improve performance in ginormous projects by
          -- only AST-parsing the currently opened buffer.
          enabled = false,
        },
        adapters = {
          require 'neotest-golang' {
            runner = 'gotestsum',
            -- go_test_args = {
            --   '-tags=all',
            -- },
          },
          require 'neotest-python' {},
          require 'neotest-jest' {
            jestCommand = 'npx jest',
            jestConfigFile = 'jest.config.json',
            -- jest_test_discovery = true,
            -- discovery = {
            --   enabled = false,
            -- },
            env = { CI = true },
            cwd = function(path) return vim.fn.getcwd() end,
          },
        },
      }
    end,
  },
}
