return {
  'tpope/vim-sleuth', -- Detect tabstop and shiftwidth automatically
  'tpope/vim-repeat',
  {
    -- insert nerdicons
    '2kabhishek/nerdy.nvim',
    dependencies = {
      'stevearc/dressing.nvim',
      'nvim-telescope/telescope.nvim',
    },
    cmd = 'Nerdy',
  },
  -- languages,
  { 'hashivim/vim-terraform', ft = { 'tf' } },
  { 'nvim-tree/nvim-web-devicons', opts = {} },
  { 'bennypowers/nvim-regexplainer', opts = {} },
  {
    'yochem/jq-playground.nvim',
    opts = {},
  },
  {
    'akinsho/toggleterm.nvim',
    version = '*',
    cmd = { 'TermNew' },
    opts = {},
  },
}
