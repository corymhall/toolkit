return {
  {
    'Wansmer/treesj',
    opts = {
      use_default_keymaps = false,
    },
    keys = {
      {
        '<leader>cj',
        function() require('treesj').toggle() end,
        desc = '[C]ode [J]oin/Split lines',
      },
      {
        '<leader>cJ',
        function() require('treesj').toggle { split = { recursive = true } } end,
        desc = '[C]ode [J]oin/Split lines recursive',
      },
    },
  },
  {
    'windwp/nvim-ts-autotag',
    event = 'BufReadPre',
    opts = {},
  },
  {
    'windwp/nvim-autopairs',
    event = 'InsertEnter',
    opts = {
      check_ts = true,
      enable_check_bracket_line = true,
      -- fast_wrap = {},
    },
  },
  {
    'kylechui/nvim-surround',
    opts = {},
    event = 'VeryLazy',
    version = '^3.0.0',
  },
  {
    'folke/ts-comments.nvim',
    opts = {},
    event = 'VeryLazy',
    enabled = vim.fn.has 'nvim-0.10.0' == 1,
  },
  {
    'saifulapm/commasemi.nvim',
    lazy = false,
    keys = {
      { '<localleader>,', '<cmd>CommaToggle<cr>', desc = 'Toggle comma' },
    },
    opts = {
      keymaps = false,
      commands = true,
    },
  },
}
