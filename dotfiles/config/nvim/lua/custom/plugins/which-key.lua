return {
  'folke/which-key.nvim',
  event = 'VeryLazy',
  preset = 'helix',
  keys = {
    {
      '<leader>?',
      function() require('which-key').show { global = false } end,
    },
    {
      '<c-w><space>',
      function() require('which-key').show { keys = '<c-w>', loop = true } end,
      desc = 'Window Hydra Mode (which-key)',
    },
  },
  opts = {
    spec = {
      {
        mode = { 'n', 'v' },
        { '<leader>c', group = '[C]ode' },
        { '<leader>r', group = '[R]un (Overseer)' },
        { '<leader>s', group = '[S]earch' },
        { '<leader>o', group = '[O]verseer' },
        { '<leader>d', group = '[D]ebug' },
        { '<leader>f', group = '[F]ile/[F]ind' },
        { '<leader>u', group = 'ui', icon = { icon = '󰙵 ', color = 'cyan' } },
        { '<leader>x', group = 'diagnostics/quickfix', icon = { icon = '󱖫 ', color = 'green' } },
        { '<leader><tab>', group = 'tabs' },
        { '[', group = 'prev' },
        { ']', group = 'next' },
        { 'g', group = 'goto' },
        { 'gs', group = 'surround' },
        { 'z', group = 'fold' },
        {
          '<leader>b',
          group = '[B]uffer',
          expand = function() return require('which-key.extras').expand.buf() end,
        },
        {
          '<leader>w',
          group = '[W]indows',
          proxy = '<c-w>',
          expand = function() return require('which-key.extras').expand.win() end,
        },
      },
    },
    spelling = {
      enabled = true,
    },
  },
}
