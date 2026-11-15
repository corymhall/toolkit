local M = {}

---@param branch string the git branch name
---@return string path the location of the worktree
function M.parse_worktree_item(branch)
  local parts = vim.split(branch, '/', { plain = true, trimempty = true })
  local location = branch
  if #parts == 2 and parts[1] == 'corymhall' then
    location = parts[#parts]
  elseif #parts > 1 then
    location = ''
    for _, part in ipairs(parts) do
      location = location .. '-' .. part
    end
  end
  local cwd = vim.uv.cwd()
  if cwd == nil then
    Snacks.notifier.notify('cwd found', 'error')
    error 'cwd found'
  end
  local worktree_root = vim.fs.root(cwd, { 'HEAD' })
  if worktree_root == nil then
    Snacks.notifier.notify('No worktree root found', 'error')
    error 'No worktree root found'
  end
  return worktree_root .. '/' .. location
end

function M.notify_start(msg, id)
  Snacks.notifier.notify(msg, 'info', {
    id = id,
    timeout = false,
  })
end

function M.notify_end(id) Snacks.notifier.hide(id) end

---@param picker snacks.Picker
---@param item snacks.picker.Item
function M.delete_worktree(picker, item)
  local notif_id = 'deleting_worktree' .. item.path_display
  require('custom.plugins.snacks.utils').notify_start('Deleting worktree: ' .. item.branch, notif_id)

  require('git-worktree').delete_worktree(item.path, true, {
    on_success = function()
      vim.print(item)
      local branch = item.branch
      -- Strip brackets from branch name
      branch = branch:gsub('%[(.-)%]', '%1')
      Snacks.picker.util.cmd({ 'git', 'branch', '-D', branch }, function()
        vim.print('deleting branch: ' .. branch)
        vim.cmd.checktime()
        picker.list:set_selected()
        picker.list:set_target()
        picker:find()
        require('custom.plugins.snacks.utils').notify_end(notif_id)
      end, { cwd = picker:cwd() })
    end,
  })
end

return M
