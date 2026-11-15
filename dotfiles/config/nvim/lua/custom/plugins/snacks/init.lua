return {
  {
    'folke/snacks.nvim',
    priority = 1000,
    lazy = false,
    ---@type snacks.Config
    opts = {
      -- your configuration comes here
      -- or leave it empty to use the default settings
      -- refer to the configuration section below
      bigfile = { enabled = true },
      -- gh = { enabled = true },
      rename = { enabled = true },
      gitbrowse = { enabled = true },
      animate = { enabled = true },
      scope = { enabled = true },
      input = { enabled = true },
      terminal = {
        win = {
          wo = {
            winhighlight = 'Normal:HallEverforestTerminal,NormalNC:HallEverforestTerminal,WinBar:SnacksWinBar,WinBarNC:SnacksWinBarNC',
          },
        },
        enabled = true,
      },
      explorer = {
        enabled = true,
        replace_netrw = true,
      },
      picker = {
        win = {
          input = {
            keys = {
              ['<c-u>'] = { 'preview_scroll_up', mode = { 'i', 'n' } },
              ['<c-f>'] = { 'list_scroll_down', mode = { 'i', 'n' } },
              ['<c-d>'] = { 'preview_scroll_down', mode = { 'i', 'n' } },
              ['<c-b>'] = { 'list_scroll_up', mode = { 'i', 'n' } },
            },
          },
        },
        layouts = {
          vertical = {
            layout = {
              backdrop = false,
              width = 0.9,
              min_width = 80,
              height = 0.95,
              min_height = 30,
              box = 'vertical',
              border = 'rounded',
              title = '{title} {live} {flags}',
              title_pos = 'center',
              { win = 'preview', title = '{preview}', height = 0.6, border = 'bottom' },
              { win = 'input', height = 1, border = 'bottom' },
              { win = 'list', border = 'none' },
            },
          },
          default = {
            layout = {
              box = 'horizontal',
              width = 0.95,
              min_width = 120,
              height = 0.85,
              {
                box = 'vertical',
                border = 'rounded',
                title = '{title} {live} {flags}',
                { win = 'input', height = 1, border = 'bottom' },
                { win = 'list', border = 'none' },
              },
              { win = 'preview', title = '{preview}', border = 'rounded', width = 0.6 },
            },
          },
        },
        sources = {
          gh_issue = {},
          gh_pr = {},
          git_branches = {
            win = {
              input = {
                keys = {
                  ['<m-a>'] = { 'git_branch_add', mode = { 'n', 'i' } },
                },
              },
            },
          },
          explorer = {
            auto_close = true,
            win = {
              list = {
                keys = {
                  ['<c-u>'] = { 'preview_scroll_up', mode = { 'i', 'n' } },
                  ['<c-f>'] = { 'list_scroll_down', mode = { 'i', 'n' } },
                  ['<c-d>'] = { 'preview_scroll_down', mode = { 'i', 'n' } },
                  ['<c-b>'] = { 'list_scroll_up', mode = { 'i', 'n' } },
                  ['U'] = { 'explorer_up', mode = { 'n' } },
                },
              },
            },
            layout = {
              preset = 'default',
              preview = 'picker',
            },
          },
        },
      },
    },
    keys = {
      {
        '<c-/>',
        function()
          Snacks.terminal.toggle(nil, {
            env = { NAME = 'default' },
            title = 'default',
          })
        end,
        remap = true,
        desc = 'Toggle Default Terminal',
      },
      {
        '<c-_>',
        function()
          Snacks.terminal.toggle(nil, {
            env = { NAME = 'default' },
            title = 'default',
          })
        end,
        remap = true,
        desc = 'Toggle Default Terminal',
      },
      {
        '<leader>os',
        function() Snacks.terminal.list() end,
        desc = '[S]earch [T]erminals',
      },
      {
        '<leader>ol',
        function()
          local cwd = vim.fs.root(0, {
            'package.json',
            'go.mod',
            '.git',
          })
          local name = vim.fs.basename(cwd)
          local id = vim.v.count1
          Snacks.terminal.toggle(nil, {
            cwd = cwd,
            title = name,
            win = {
              wo = {
                winbar = id .. ': ' .. name,
              },
            },
          })
        end,
        desc = '[O]pen [L]ocal Terminal',
      },
      {
        '<leader>of',
        function()
          Snacks.terminal.toggle(nil, {
            env = { TYPE = 'scratch' },
            win = {
              position = 'float',
            },
          })
        end,
      },
      {
        '<leader>ot',
        function()
          local term = vim.b[0].snacks_terminal
          if term ~= nil then
          end
          Snacks.terminal.toggle(nil, {})
        end,
        desc = '[O]pen [T]erminal',
      },
      {
        '<leader>goc',
        function()
          ---@diagnostic disable-next-line: missing-fields
          Snacks.gitbrowse.open {
            what = 'commit',
            branch = 'main',
          }
        end,
        desc = '[G]it [O]pen [C]ommit URL',
      },
      {
        '<leader>gyl',
        function()
          ---@diagnostic disable-next-line: missing-fields
          Snacks.gitbrowse.open {
            what = 'permalink',
            open = function(url) vim.fn.setreg('+', url) end,
          }
        end,
        desc = '[G]it [Y]ank [L]ink',
        mode = { 'v', 'n' },
      },
      {
        '<leader>;',
        function()
          Snacks.picker.buffers {
            current = false,
            sort_lastused = true,
            -- layout = 'ivy_split',
            formatters = {
              file = {
                truncate = 100,
              },
            },
          }
        end,
        desc = 'buffers',
      },
      {
        '<leader>/',
        function()
          Snacks.picker.grep_buffers {
            layout = 'ivy_split',
          }
        end,
        desc = 'grep buffers',
      },
      -- Files
      {
        '<leader>fd',
        function()
          Snacks.picker.files {
            layout = 'ivy',
            hidden = true,
            formatters = {
              file = {
                truncate = 100,
              },
            },
          }
        end,
        desc = 'Find files',
      },
      {
        '<leader>ff',
        function()
          Snacks.picker.files {
            cwd = vim.fn.expand '%:h',
            layout = 'ivy',
            formatters = {
              file = {
                truncate = 100,
              },
            },
          }
        end,
        desc = 'Find files current directory',
      },
      {
        '<leader>fb',
        function()
          Snacks.picker.explorer {
            cwd = vim.fn.expand '%:h',
          }
        end,
        desc = 'File browser',
      },
      {
        '<leader>fa',
        function()
          Snacks.picker.files {
            hidden = true,
            ignored = true,
            layout = 'ivy',
            formatters = {
              file = {
                truncate = 100,
              },
            },
          }
        end,
        desc = 'Find all files',
      },
      { '<leader>fh', function() Snacks.picker.files { dirs = { '.github' } } end, desc = 'Find .github files' },

      -- Git
      { '<leader>gb', function() Snacks.picker.git_branches() end, desc = 'Git Branches' },
      { '<leader>gl', function() Snacks.picker.git_log() end, desc = 'Git Log' },
      { '<leader>gL', function() Snacks.picker.git_log_line() end, desc = 'Git Log Line' },

      -- Search

      { '<leader>ss', function() Snacks.picker.lsp_symbols() end, desc = '[S]earch document [S]ymbols' },

      {
        '<leader>sg',
        function() require('custom.plugins.snacks.pickers.multi-grep').pick() end,
        desc = 'Live [G]rep',
      },
      {
        '<leader>sr',
        function() Snacks.picker.grep { hidden = true, title = 'Grep Raw' } end,
        desc = '[S]earch Grep [R]aw',
      },
      { '<leader>s"', function() Snacks.picker.registers() end, desc = 'Registers' },
      { '<leader>s/', function() Snacks.picker.search_history() end, desc = 'Search History' },
      { '<leader>sd', function() Snacks.picker.diagnostics() end, desc = 'Diagnostics' },
      { '<leader>sD', function() Snacks.picker.diagnostics_buffer() end, desc = 'Buffer Diagnostics' },
      { '<leader>sm', function() Snacks.picker.marks() end, desc = 'Marks' },
      { '<leader>sC', function() Snacks.picker.command_history() end, desc = 'Command History' },
      { '<leader>su', function() Snacks.picker.undo() end, desc = '[S]earch [Undo] History' },
      { '<leader>se', function() Snacks.picker.resume() end, desc = 'Resume' },
      { '<leader>sp', function() Snacks.picker.lazy() end, desc = 'Search for Plugin Spec' },
      { '<leader>sw', function() Snacks.picker.lsp_workspace_symbols() end, desc = '[S]earch [W]orkspace symbols' },
      { '<leader>sh', function() Snacks.picker.help() end, desc = '[S]earch [H]elp' },
      { '<leader><space>', function() Snacks.picker.smart() end, desc = 'Smart Find Files' },
      -- { '<leader>gi', function() Snacks.picker.gh_issue() end, desc = 'GitHub Issues (open)' },
      -- { '<leader>gI', function() Snacks.picker.gh_issue { state = 'all' } end, desc = 'GitHub Issues (all)' },
      -- { '<leader>gp', function() Snacks.picker.gh_pr() end, desc = 'GitHub Pull Requests (open)' },
      -- { '<leader>gP', function() Snacks.picker.gh_pr { state = 'all' } end, desc = 'GitHub Pull Requests (all)' },
    },
  },
}
