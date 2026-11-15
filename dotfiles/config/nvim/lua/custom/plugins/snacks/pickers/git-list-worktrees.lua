local format = require 'custom.plugins.snacks.format'
local utils = require 'custom.plugins.snacks.utils'
local git_worktree = require 'git-worktree'

---@module 'snacks'

local M = {}

---@param opts snacks.picker.Config
---@type snacks.picker.finder
local function git_worktrees(opts, ctx)
  local cwd = svim.fs.normalize(opts and opts.cwd or vim.uv.cwd() or '.') or nil
  cwd = Snacks.git.get_root(cwd)

  local parse_line = function(line)
    local fields = vim.split(string.gsub(line.text, '%s+', ' '), ' ')
    return {
      path = fields[1],
      sha = fields[2],
      branch = fields[3],
    }
  end

  return require('snacks.picker.source.proc').proc({
    cwd = cwd,
    cmd = 'git',
    args = { 'worktree', 'list' },
    ---@param item snacks.picker.finder.Item
    transform = function(item)
      local entry = parse_line(item)
      local basename = vim.fs.basename(entry.path)
      local cwdbase = vim.fs.basename(cwd)
      if entry.sha == '(bare)' then return end
      item.cwd = cwd
      item.current = basename == cwdbase
      item.branch = entry.branch
      item.commit = entry.sha
      item.path = entry.path
      item.path_display = basename
    end,
  }, ctx)
end

---@class snacks.picker.git_list_worktrees.Config: snacks.picker.Config
---@field actions table<string, snacks.picker.Action.spec> actions used by keymaps
---@type snacks.picker.git_list_worktrees.Config|{}
M.source = {
  finder = git_worktrees,
  supports_live = true,
  win = {
    input = {
      keys = {
        ['<c-d>'] = { 'worktree_delete', mode = { 'n', 'i' }, desc = 'delete worktree' },
        ['<m-d>'] = { 'worktree_delete_selected', mode = { 'n', 'i' }, desc = 'delete selected worktrees' },
      },
    },
  },
  actions = {
    ['worktree_delete_selected'] = function(picker)
      local sel = picker:selected()
      local items = #sel > 0 and sel
      if not items then
        Snacks.notify.warn('No worktree selected', { title = 'Snacks picker' })
        return
      end
      for _, item in ipairs(items) do
        if not (item and item.branch) then
          Snacks.notify.warn('No branch or commit found', { title = 'Snacks picker' })
          return
        end
        utils.delete_worktree(picker, item)
      end
    end,
    ['worktree_delete'] = function(picker, item)
      if not (item and item.branch) then
        Snacks.notify.warn('No branch or commit found', { title = 'Snacks picker' })
        return
      end
      Snacks.picker.select({ 'Yes', 'No' }, { prompt = ('Delete worktree %q?'):format(item.branch) }, function(_, idx)
        if idx == 1 then utils.delete_worktree(picker, item) end
      end)
    end,
  },
  format = format.worktrees,
  preview = 'git_log',
  confirm = function(picker, item)
    picker:close()
    git_worktree.switch_worktree(item.path)
  end,
}

---@param opts? snacks.picker.git_list_worktrees.Config
M.pick = function(opts) return Snacks.picker.pick(M.source) end
return M
