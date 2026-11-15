return {
  'saghen/blink.cmp',
  version = '1.*',
  dependencies = {
    { 'moyiz/blink-emoji.nvim' },
    {

      'L3MON4D3/LuaSnip',
      version = 'v2.*',
      build = 'make install_jsregexp',
      config = function() require 'custom.snippets' end,
    },
    {
      'xzbdmw/colorful-menu.nvim',
      opts = {},
    },
    { 'Kaiser-Yang/blink-cmp-git' },
  },

  ---@module 'blink.cmp'
  ---@type blink.cmp.Config
  opts = {
    keymap = {
      preset = 'default',
      ['<Up>'] = {},
      ['<Down>]'] = {},
    },
    completion = {
      menu = {
        draw = {
          -- we don't need label_description now because label and label_description
          -- combined together in label by colorful-menu.nvim
          columns = { { 'kind_icon' }, { 'label', gap = 1 } },
          components = {
            label = {
              text = function(ctx)
                local highlights_info = require('colorful-menu').blink_highlights(ctx)
                if highlights_info ~= nil then
                  return highlights_info.label
                else
                  return ctx.label
                end
                -- return require("colorful-menu").blink_components_text(ctx)
              end,
              highlight = function(ctx)
                local highlights = {}
                local highlights_info = require('colorful-menu').blink_highlights(ctx)
                if highlights_info ~= nil then highlights = highlights_info.highlights end
                for _, idx in ipairs(ctx.label_matched_indices) do
                  table.insert(highlights, { idx, idx + 1, group = 'BlinkCmpLabelMatch' })
                end
                return highlights
                -- return require("colorful-menu").blink_components_highlight(ctx)
              end,
            },
          },
        },
      },
      documentation = {
        treesitter_highlighting = true,
        auto_show = true,
        auto_show_delay_ms = 100,
      },
    },
    appearance = {
      use_nvim_cmp_as_default = true,
      nerd_font_variant = 'mono',
    },

    -- Luasnip
    snippets = {
      preset = 'luasnip',
    },

    -- Default list of enabled providers defined so that you can extend it
    -- elsewhere in your config, without redefining it, due to `opts_extend`
    sources = {
      default = { 'lazydev', 'snippets', 'lsp', 'path', 'buffer', 'emoji' },
      providers = {
        emoji = {
          module = 'blink-emoji',
          name = 'Emoji',
          opts = {
            insert = true,
          },
          should_show_items = function() return vim.tbl_contains({ 'markdown', 'octo', 'gitcommit' }, vim.bo.filetype) end,
        },
        -- git = {
        --   module = 'blink-cmp-git',
        --   name = 'Git',
        --   opts = {
        --     enabled = function() return vim.tbl_contains({ 'octo', 'gitcommit', 'markdown' }, vim.bo.filetype) end,
        --     commit = {
        --       enabled = function() return vim.tbl_contains({ 'octo', 'gitcommit', 'markdown' }, vim.bo.filetype) end,
        --     },
        --   },
        -- },
        buffer = {
          name = 'buffer',
          module = 'blink.cmp.sources.buffer',
          min_keyword_length = 5,
        },
        lazydev = {
          name = 'LazyDev',
          module = 'lazydev.integrations.blink',
          -- make lazydev completions top priority
          score_offset = 100,
        },
      },
    },
  },
  opts_extend = { 'sources.default' },
}
