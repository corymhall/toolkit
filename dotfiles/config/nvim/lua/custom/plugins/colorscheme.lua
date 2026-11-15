return {
  {
    'Aejkatappaja/cendre',
    lazy = false,
    priority = 1000,
    config = function()
      require('cendre').setup {
        background = 'hard', -- "hard" | "medium" | "soft"
        -- italic_virtual_text = false,
      }
    end,
  },
  {
    '0xstepit/flow.nvim',
    lazy = false,
    priority = 1000,
    opts = {
      -- fluo_color = 'orange',
    },
  },
  {
    'rktjmp/lush.nvim',
    cmd = 'LushImport',
  },
  {
    dir = '~/plugins/seasons-theme.nvim',
    lazy = false,
    priority = 1000,
    -- opts = {
    --   theme = 'christmas',
    -- },
  },
  --   -- setup = function()
  --   --   require('autumn').setup {
  --   --     variant = 'ridgefire',
  --   --   }
  --   --   -- local autumn = require 'autumn'
  --   --   -- vim.keymap.set('n', '<leader>th', autumn.inspect, { desc = 'Show TS + semantic tokens' })
  --   -- end,
  --   keys = {
  --     {
  --       '<leader>th',
  --       function() require('autumn').inspect() end,
  --       desc = 'Show TS + semantic tokens',
  --     },
  --   },
  --   -- init = function() end,
  --   -- opts = {
  --   --   variant = 'default',
  --   -- },
  -- },
  -- {
  --   'EdenEast/nightfox.nvim',
  --   lazy = false,
  --   priority = 1000,
  --   opts = {
  --     options = {
  --       styles = {
  --         comments = 'italic',
  --         conditionals = 'NONE',
  --         constants = 'NONE',
  --         functions = 'NONE',
  --         keywords = 'italic',
  --         numbers = 'NONE',
  --         operators = 'NONE',
  --         strings = 'NONE',
  --         types = 'NONE',
  --         variables = 'NONE',
  --       },
  --     },
  --   },
  --   init = function() end,
  -- },
}
