return {
  {
    'folke/which-key.nvim',
    opts = {
      spec = {
        { '<leader>g', group = '[G]it' },
        { '<leader>gh', group = '[G]it [H]unks' },
        { '<leader>gy', group = '[G]it [Y]ank' },
        { '<leader>go', group = '[G]it [O]pen' },
        { '<leader>gv', group = '[G]it Diff[v]iew' },
        { '<leader>gw', group = '[G]it [W]orktrees' },
      },
    },
  },
  -- git commands in nvim,
  'tpope/vim-fugitive',
  -- Fugitive-companion to interact with github,
  'tpope/vim-rhubarb',
  {
    'lewis6991/gitsigns.nvim',
    event = 'BufReadPre',
    config = function()
      local function on_attach(bufnr)
        local gs = package.loaded.gitsigns

        local function map(mode, l, r, opts)
          opts = opts or {}
          opts.buffer = bufnr
          vim.keymap.set(mode, l, r, opts)
        end

        -- Navigation
        map('n', ']h', function()
          if vim.wo.diff then return ']c' end
          vim.schedule(function() gs.next_hunk() end)
          return '<Ignore>'
        end, { expr = true, desc = 'Next Hunk' })

        map('n', '[h', function()
          if vim.wo.diff then return '[c' end
          vim.schedule(function() gs.prev_hunk() end)
          return '<Ignore>'
        end, { expr = true, desc = 'Previous Hunk' })

        -- Actions
        map('n', ']H', function() gs.nav_hunk 'last' end, { desc = 'Last Hunk' })
        map('n', '[H', function() gs.nav_hunk 'first' end, { desc = 'First Hunk' })
        map({ 'n', 'v' }, '<leader>ghs', ':Gitsigns stage_hunk<CR>', { desc = 'Gitsigns Stage Hunk' })
        map({ 'n', 'v' }, '<leader>ghr', ':Gitsigns reset_hunk<CR>', { desc = 'Gitsigns Reset Hunk' })
        map('n', '<leader>ghS', gs.stage_buffer, { desc = 'Gitsigns Stage Buffer' })
        map('n', '<leader>ghu', gs.undo_stage_hunk, { desc = 'Gitsigns Undo Stage Hunk' })
        map('n', '<leader>ghR', gs.reset_buffer, { desc = 'Gitsigns Reset Buffer' })
        map('n', '<leader>ghp', gs.preview_hunk, { desc = 'Gitsigns Preview Hunk' })
        map('n', '<leader>ghb', function() gs.blame_line { full = true } end, { desc = 'Gitsigns Blame Line' })
        map('n', '<leader>ghd', gs.diffthis, { desc = 'Gitsigns Diff this' })
        map('n', '<leader>ghD', function() gs.diffthis '~' end, { desc = 'Gitsigns Diff this current file' })

        -- Text object
        map({ 'o', 'x' }, 'ih', ':<C-U>Gitsigns select_hunk<CR>')
      end
      require('gitsigns').setup {
        on_attach = on_attach,
        signs = {
          add = { text = '+' },
          change = { text = '~' },
          delete = { text = '_' },
          topdelete = { text = '‾' },
          changedelete = { text = '~' },
        },
      }
    end,
  },
  {
    'dlvhdr/gh-addressed.nvim',
    dependencies = {
      'nvim-lua/plenary.nvim',
      'MunifTanjim/nui.nvim',
      'folke/trouble.nvim',
    },
    cmd = 'GhReviewComments',
    keys = {
      { '<leader>grc', '<cmd>GhReviewComments<cr>', desc = 'GitHub Review Comments' },
    },
  },
}
