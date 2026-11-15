-- Treesitter Highlighting Debug Helper
-- Usage: :lua require('custom.debug-treesitter').toggle_debug()
-- or :lua require('custom.debug-treesitter').inspect_at_cursor()

local M = {}

-- Toggle treesitter highlighting on/off
function M.toggle_highlighting()
  local config = require 'nvim-treesitter.configs'
  local current = vim.treesitter.highlighter.active[vim.api.nvim_get_current_buf()]

  if current then
    vim.cmd 'TSBufDisable highlight'
    print 'Treesitter highlighting disabled'
  else
    vim.cmd 'TSBufEnable highlight'
    print 'Treesitter highlighting enabled'
  end
end

-- Show detailed highlight info at cursor
function M.inspect_at_cursor()
  local line = vim.api.nvim_win_get_cursor(0)[1] - 1
  local col = vim.api.nvim_win_get_cursor(0)[2]

  -- Get treesitter info
  local parser = vim.treesitter.get_parser(0)
  if not parser then
    print 'No treesitter parser found for this buffer'
    return
  end

  local tree = parser:parse()[1]
  local node = tree:root():descendant_for_range(line, col, line, col)

  if node then
    print('Node type: ' .. node:type())
    print('Node text: "' .. vim.treesitter.get_node_text(node, 0) .. '"')

    -- Get highlight groups
    local hl_groups = vim.treesitter.get_captures_at_pos(0, line, col)
    if #hl_groups > 0 then
      print 'Highlight groups:'
      for _, capture in ipairs(hl_groups) do
        local hl_name = '@' .. capture.capture
        print('  ' .. hl_name)

        -- Show the actual highlight definition
        local hl_def = vim.api.nvim_get_hl(0, { name = hl_name })
        if next(hl_def) then
          print('    Definition: ' .. vim.inspect(hl_def))
        else
          print '    No highlight definition found'
        end
      end
    else
      print 'No treesitter captures at cursor'
    end
  else
    print 'No treesitter node at cursor'
  end
end

-- Compare before/after colorscheme change
function M.compare_highlights()
  local captures = {}

  -- Collect current highlights
  local function collect_highlights()
    local current = {}
    local parser = vim.treesitter.get_parser(0)
    if parser then
      local query = vim.treesitter.query.get(parser:lang(), 'highlights')
      if query then
        for id, _ in pairs(query.captures) do
          local capture_name = query.captures[id]
          local hl_name = '@' .. capture_name .. '.' .. parser:lang()
          current[hl_name] = vim.api.nvim_get_hl(0, { name = hl_name })
        end
      end
    end
    return current
  end

  captures.before = collect_highlights()

  print 'Captured current highlights. Change your colorscheme and run:'
  print ':lua require("custom.debug-treesitter").compare_highlights_after()'
  M._comparison_data = captures
end

function M.compare_highlights_after()
  if not M._comparison_data then
    print 'No comparison data found. Run compare_highlights() first.'
    return
  end

  local current = {}
  local parser = vim.treesitter.get_parser(0)
  if parser then
    local query = vim.treesitter.query.get(parser:lang(), 'highlights')
    if query then
      for id, _ in pairs(query.captures) do
        local capture_name = query.captures[id]
        local hl_name = '@' .. capture_name .. '.' .. parser:lang()
        current[hl_name] = vim.api.nvim_get_hl(0, { name = hl_name })
      end
    end
  end

  -- Compare
  local changes = {}
  for hl_name, before_def in pairs(M._comparison_data.before) do
    local after_def = current[hl_name] or {}
    if not vim.deep_equal(before_def, after_def) then
      changes[hl_name] = {
        before = before_def,
        after = after_def,
      }
    end
  end

  if next(changes) then
    print 'Highlight changes detected:'
    for hl_name, change in pairs(changes) do
      print('  ' .. hl_name .. ':')
      print('    Before: ' .. vim.inspect(change.before))
      print('    After:  ' .. vim.inspect(change.after))
    end
  else
    print 'No highlight changes detected'
  end
end

-- Show all treesitter highlight groups for current language
function M.show_all_highlights()
  local parser = vim.treesitter.get_parser(0)
  if not parser then
    print 'No treesitter parser found'
    return
  end

  local lang = parser:lang()
  local query = vim.treesitter.query.get(lang, 'highlights')

  if not query then
    print('No highlight query found for language: ' .. lang)
    return
  end

  print('Available highlight groups for ' .. lang .. ':')
  for id, capture_name in pairs(query.captures) do
    local hl_name = '@' .. capture_name
    local hl_def = vim.api.nvim_get_hl(0, { name = hl_name })

    if next(hl_def) then
      print('  ' .. hl_name .. ': ' .. vim.inspect(hl_def))
    else
      print('  ' .. hl_name .. ': (no definition)')
    end
  end
end

-- Reset treesitter parsers (useful after updates)
function M.reset_parsers()
  vim.cmd 'TSUpdateSync'
  -- Clear parser cache
  vim.treesitter.language.clear_cache()
  print 'Treesitter parsers reset and updated'
end

-- Quick debug setup with keymaps
function M.setup_debug_keymaps()
  local opts = { noremap = true, silent = true }

  vim.keymap.set(
    'n',
    '<leader>tst',
    M.toggle_highlighting,
    vim.tbl_extend('force', opts, { desc = 'Toggle treesitter highlighting' })
  )

  vim.keymap.set(
    'n',
    '<leader>tsi',
    M.inspect_at_cursor,
    vim.tbl_extend('force', opts, { desc = 'Inspect treesitter at cursor' })
  )

  vim.keymap.set(
    'n',
    '<leader>tsh',
    M.show_all_highlights,
    vim.tbl_extend('force', opts, { desc = 'Show all treesitter highlights' })
  )

  vim.keymap.set(
    'n',
    '<leader>tsr',
    M.reset_parsers,
    vim.tbl_extend('force', opts, { desc = 'Reset treesitter parsers' })
  )

  print 'Treesitter debug keymaps set up:'
  print '  <leader>tst - Toggle highlighting'
  print '  <leader>tsi - Inspect at cursor'
  print '  <leader>tsh - Show all highlights'
  print '  <leader>tsr - Reset parsers'
end

return M
