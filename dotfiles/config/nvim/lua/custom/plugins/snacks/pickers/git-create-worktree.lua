local utils = require 'custom.plugins.snacks.utils'
local git_worktree = require 'git-worktree'

---@module 'snacks'

local M = {}

---@class snacks.picker.git_create_worktree.Config: snacks.picker.Config
---@field actions table<string, snacks.picker.Action.spec> actions used by keymaps

---@type snacks.picker.git_create_worktree.Config|{}
M.source = {
  finder = 'git_branches',
  supports_live = true,
  format = 'git_branch',
  win = {
    input = {
      keys = {
        ['<m-a>'] = { 'worktree_add', mode = { 'n', 'i' } },
      },
    },
  },
  actions = {
    ['worktree_add'] = function(picker)
      Snacks.input.input({
        prompt = 'New worktree name',
        default = picker.input:get(),
      }, function(name)
        if (name or ''):match '^%s*$' then return end
        local success, location = pcall(function() return utils.parse_worktree_item(name) end)
        if success then
          picker:close()
          local notif_id = 'creating_worktree'
          utils.notify_start('Creating worktree: ' .. name, notif_id)
          git_worktree.create_worktree(location, name, 'origin/' .. name)
          utils.notify_end(notif_id)
        end
      end)
    end,
  },
  confirm = function(picker, item)
    vim.print(item)
    picker:close()
    local branch
    if item ~= nil then
      branch = item.branch
    else
      branch = picker:filter().pattern
    end
    vim.print('branch: ', branch)
    local notif_id = 'creating_worktree'
    Snacks.input.input({
      default = branch,
      prompt = 'Location: ',
    }, function(value)
      local success, location = pcall(function() return utils.parse_worktree_item(value) end)
      if success then
        utils.notify_start('Creating worktree: ' .. branch, notif_id)
        git_worktree.create_worktree(location, branch, 'origin/' .. branch)
        utils.notify_end(notif_id)
      end
    end)
  end,
}

---@param opts? snacks.picker.git_create_worktree.Config
M.pick = function(opts) return Snacks.picker.pick(M.source) end
return M
