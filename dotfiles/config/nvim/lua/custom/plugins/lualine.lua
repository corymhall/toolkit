return {
  {
    'hoob3rt/lualine.nvim',
    event = 'VeryLazy',
    dependencies = {
      { 'nvim-tree/nvim-web-devicons' },
    },
    opts = {
      options = {
        disabled_filetypes = {
          winbar = {
            'snacks_terminal',
          },
        },
        theme = 'auto',
        globalstatus = true,
      },
      winbar = {
        lualine_c = { 'filename' },
      },
      inactive_winbar = {
        lualine_c = { { 'filename', path = 2 } },
      },
      sections = {
        lualine_c = {
          {
            'filename',
            path = 2,
          },
        },
        lualine_x = { 'filetype', 'overseer' },
      },
      extensions = { 'fugitive' },
    },
  },
}
