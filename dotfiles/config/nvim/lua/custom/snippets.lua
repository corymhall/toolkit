local ls = require 'luasnip'
vim.snippet.expand = ls.lsp_expand
vim.snippet.stop = ls.unlink_current

---@diagnostic disable-next-line: duplicate-set-field
vim.snippet.active = function(filter)
  filter = filter or {}
  filter.direction = filter.direction or 1

  if filter.direction == 1 then
    return ls.expand_or_jumpable()
  else
    return ls.jumpable(filter.direction)
  end
end

---@diagnostic disable-next-line: duplicate-set-field
vim.snippet.jump = function(direction)
  if direction == 1 then
    if ls.expandable() then
      return ls.expand_or_jump()
    else
      return ls.jumpable(1) and ls.jump(1)
    end
  else
    return ls.jumpable(-1) and ls.jump(-1)
  end
end

ls.config.set_config {
  history = true,
  updateevents = 'TextChanged,TextChangedI',
  override_builtin = true,
}

for _, ft_path in ipairs(vim.api.nvim_get_runtime_file('lua/custom/snippets/*.lua', true)) do
  loadfile(ft_path)()
end

-- <c-k> is the expansion key
-- this will expand the current item or jump to the next
-- item within the snippet.
-- FIXME: this is not working
vim.keymap.set(
  { 'i', 's' },
  '<c-k>',
  function() return vim.snippet.active { direction = 1 } and vim.snippet.jump(1) end,
  { silent = true }
)
vim.keymap.set({ 's' }, '<Tab>', function()
  if ls.jumpable(1) then ls.jump(1) end
end, { silent = true })

-- this always moves to the previous item within the snippet
vim.keymap.set(
  { 'i', 's' },
  '<c-j>',
  function() return vim.snippet.active { direction = -1 } and vim.snippet.jump(-1) end,
  { silent = true }
)

vim.keymap.set({ 'i', 's' }, '<c-l>', function()
  if ls.choice_active() then ls.change_choice(1) end
end, { silent = true })
