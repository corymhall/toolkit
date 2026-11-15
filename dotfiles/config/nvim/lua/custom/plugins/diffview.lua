local function sync_commentry_review_context(view, rev)
  local ok, commentry = pcall(require, 'commentry.diffview')
  if not ok then return end

  if rev then
    commentry.resolve_review_context({ rev }, view)
    return
  end

  local context = commentry.review_context_for_view(view)
  if context then
    context.mode = 'working_tree'
    context.revisions = nil
    context.revision_anchors = nil
    commentry.set_review_context_for_view(view, context)
  else
    commentry.resolve_review_context(nil, view)
  end
end

local function open_or_update(rev)
  local view = require('diffview.lib').get_current_view()

  if view and type(view.set_revs) == 'function' then
    require('diffview.api').set_revs(rev, {
      view = view,
      imply_local = true,
    })
    sync_commentry_review_context(view, rev)
  else
    require('diffview').open(rev and { rev } or {})
  end
end

local function review_cwd()
  local view = require('diffview.lib').get_current_view()
  if view and view.adapter then return view.adapter.ctx.toplevel end
  local name = vim.api.nvim_buf_get_name(0)
  if vim.bo.buftype == '' and name ~= '' then return vim.fn.fnamemodify(name, ':h') end
  return vim.fn.getcwd()
end

return {
  'dlyongemallo/diffview-plus.nvim',
  -- lazy-load plugin when these commands are called
  cmd = {
    'DiffviewOpen',
    'DiffviewToggle',
    'DiffviewFileHistory',
    'DiffviewClose',
  },
  dependencies = {
    { 'rickhowe/diffchar.vim' },
    { 'folke/snacks.nvim' },
  },
  keys = {
    {
      '<leader>dh',
      ':DiffviewFileHistory %<CR>',
      desc = 'Diffview history (current file)',
    },
    {
      '<leader>dH',
      '<cmd>DiffviewFileHistory<CR>',
      desc = 'Diffview history (repo)',
    },
    {
      '<leader>dv',
      '<cmd>DiffviewToggle<CR>',
      desc = 'Toggle Diffview',
    },
    {
      '<leader>do',
      function() open_or_update(nil) end,
      desc = 'Diffview working tree',
    },
    {
      '<leader>dh',
      "<Esc><cmd>'<,'>DiffviewFileHistory --follow <CR>",
      desc = 'Diffview range history',
      mode = { 'v' },
    },
    {
      '<leader>dl',
      '<cmd>.DiffviewFileHistory --follow <CR>',
      desc = 'Diffview line history',
      mode = { 'n' },
    },
    {
      '<leader>dP',
      function()
        Snacks.picker.git_log {
          title = 'Pick Diffview base (commit → working tree)',
          cwd = review_cwd(),
          confirm = function(picker, item)
            picker:close()
            if item and item.commit then open_or_update(item.commit) end
          end,
        }
      end,
      desc = 'Pick Diffview base commit',
    },
    {
      '<leader>d3',
      function() open_or_update 'HEAD~3' end,
      desc = 'Diffview last 3 commits',
    },
    {
      '<leader>dm',
      function()
        local function warn(message)
          vim.notify(message, vim.log.levels.WARN, { title = 'Diffview' })
        end

        if vim.fn.executable 'git-spice' ~= 1 then
          warn 'git-spice is required to find the stack parent.'
          return
        end

        local cwd = review_cwd()
        local result = vim.fn.systemlist {
          'git-spice', '-C', cwd, 'log', 'short', '--json', '--no-prompt',
          '--no-cr-status', '--no-cr-comments',
        }
        if vim.v.shell_error ~= 0 then
          warn('Cannot find the stack parent: ' .. table.concat(result, '\n'))
          return
        end

        for _, line in ipairs(result) do
          local ok, branch = pcall(vim.json.decode, line)
          if not ok or type(branch) ~= 'table' then
            warn 'Cannot read git-spice branch data.'
            return
          end
          if branch.current then
            if type(branch.down) == 'table' and type(branch.down.name) == 'string' then
              open_or_update('refs/heads/' .. branch.down.name .. '...HEAD')
            else
              warn 'This branch has no recorded stack parent.'
            end
            return
          end
        end
        warn 'This branch has no recorded stack parent. Track it with git-spice branch track --base <parent>.'
      end,
      desc = 'Diffview changes against stack parent',
    },
    {
      '<leader>dM',
      function()
        local result = vim.fn.systemlist {
          'git',
          'rev-parse',
          '--verify',
          'refs/remotes/origin/main',
        }
        local branch = vim.v.shell_error == 0 and result[1] ~= nil and result[1] ~= '' and 'main' or 'master'
        open_or_update('origin/' .. branch .. '...HEAD')
      end,
      desc = 'Diffview changes against origin main branch',
    },
    {
      '<leader>dc',
      ':DiffviewClose<CR>',
      desc = 'Close diffview',
    },
  },
  config = function()
    local actions = require 'diffview.actions'
    require('diffview').setup {
      enhanced_diff_hl = true,
      diffopt = { algorithm = 'histogram' },
      default_args = {
        DiffviewOpen = { '--imply-local' },
      },
      file_history_panel = {
        stat_style = 'both',
        date_format = 'relative',
        commit_format = { 'hash', 'subject', 'author', 'date', 'ref', 'reflog', 'status', 'files', 'stats' },
      },
      view = {
        file_history = {
          layout = 'diff2_vertical',
        },
        merge_tool = {
          layout = 'diff4_mixed',
          disable_diagnostics = true,
          winbar_info = true,
        },
        cycle_layouts = {
          merge_tool = { 'diff4_mixed', 'diff3_mixed', 'diff3_horizontal', 'diff1_plain' },
        },
      },
      keymaps = {
        view = {
          ['<c-n>'] = actions.select_next_entry,
          ['<c-p>'] = actions.select_prev_entry,
        },
        file_panel = {
          ['<c-n>'] = actions.select_next_entry,
          ['<c-p>'] = actions.select_prev_entry,
        },
        file_history_panel = {
          ['<c-n>'] = actions.select_next_entry,
          ['<c-p>'] = actions.select_prev_entry,
        },
      },
    }
  end,
}
