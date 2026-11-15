local M = {}

---@param item snacks.picker.Item
function M.worktrees(item, picker)
  local a = Snacks.picker.util.align
  local ret = {} ---@type snacks.picker.Highlight[]
  if item.current then
    ret[#ret + 1] = { a('', 2), 'SnacksPickerGitBranchCurrent' }
  else
    ret[#ret + 1] = { a('', 2) }
  end
  ret[#ret + 1] = { a(item.branch, 30, { truncate = true }), 'SnacksPickerGitBranch' }
  ret[#ret + 1] = { ' ' }
  ret[#ret + 1] = { a(item.path_display, 30, { truncate = true }), 'SnacksPickerGitPath' }
  return ret
end

return M
