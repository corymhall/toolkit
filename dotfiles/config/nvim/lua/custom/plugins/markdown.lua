return {
  {
    'OXY2DEV/markview.nvim',
    enabled = false,
    lazy = false, -- Recommended
    opts = {
      markdown = {},
      preview = {
        icon_provider = 'devicons', -- "mini" or "devicons"
      },
    },
    init = function() vim.cmd 'Markview disable' end,
    -- ft = "markdown" -- If you decide to lazy-load anyway

    dependencies = {
      -- 'nvim-treesitter/nvim-treesitter',
      'nvim-tree/nvim-web-devicons',
    },
  },
  {
    'yousefakbar/toc.nvim',
    ft = 'markdown',
    opts = {},
    keys = { -- Optional if you want to define a keymap to launch :Toc
      { '<leader>sc', '<CMD>Toc<CR>', desc = '[S]earch Table of [C]ontents' },
    },
  },

  -- "preservim/vim-markdown",
  {
    'daenikon/marknav.nvim',
    opts = {},
    ft = { 'markdown', 'vimwiki' },
  },
  {
    'hedyhli/markdown-toc.nvim',
    ft = 'markdown', -- Lazy load on markdown filetype
    -- cmd = { 'Mtoc' }, -- Or, lazy load on "Mtoc" command
    opts = {
      headings = {
        pattern = '^(###)%s+(.+)$',
      },
      -- Your configuration here (optional)
    },
  },
  {
    'MeanderingProgrammer/render-markdown.nvim',
    -- dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-mini/mini.nvim' }, -- if you use the mini.nvim suite
    -- dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-mini/mini.icons' },        -- if you use standalone mini plugins
    dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-tree/nvim-web-devicons' }, -- if you prefer nvim-web-devicons
    ---@module 'render-markdown'
    ---@type render.md.UserConfig
    opts = {},
  },
  {
    'iamcco/markdown-preview.nvim',
    enabled = false,
    cmd = { 'MarkdownPreviewToggle', 'MarkdownPreview', 'MarkdownPreviewStop' },
    build = 'cd app && yarn install',
    init = function() vim.g.mkdp_filetypes = { 'markdown' } end,
    ft = { 'markdown' },
  },
}
