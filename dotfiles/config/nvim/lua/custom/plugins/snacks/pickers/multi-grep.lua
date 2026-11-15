local strings = require 'plenary.strings'
local uv = vim.uv

---@module 'snacks'

local M = {}

---@param opts snacks.picker.grep.Config
---@param filter snacks.picker.Filter
local function get_cmd(opts, filter)
  local cmd = 'rg'
  local args = {
    '--color=never',
    '--no-heading',
    '--with-filename',
    '--line-number',
    '--column',
    '--hidden',
    '--smart-case',
    '--max-columns=500',
    '--max-columns-preview',
  }

  local shortcuts = {
    ['t'] = { '*.ts', '!*.test.ts', '!*.d.ts' },
    ['ta'] = { '**/*.ts' },
    ['g'] = { '**/*.go', '!*_test.go', '!go.mod', '!go.sum' },
    ['ga'] = { '*.go' },
    ['a'] = { '**/.github/**/*.yml' },
  }

  local formatPattern = '%s'

  args = vim.deepcopy(args)

  local args_generator = function(prompt)
    if not prompt or prompt == '' then return nil end
    local pargs = {}

    local prompt_split = vim.split(prompt, '  ')

    if prompt_split[1] then
      table.insert(pargs, '-e')
      table.insert(pargs, prompt_split[1])
    end

    local pattern
    if prompt_split[2] then
      if shortcuts[prompt_split[2]] then
        local shortcut_prompt = shortcuts[prompt_split[2]]
        if vim.islist(shortcut_prompt) then
          for _, v in ipairs(shortcut_prompt) do
            table.insert(pargs, '-g')
            table.insert(pargs, string.format(formatPattern, v))
          end
        else -- string
          pattern = shortcuts[prompt_split[2]]
        end
      else
        pattern = prompt_split[2]
      end
      if pattern then
        table.insert(pargs, '-g')
        table.insert(pargs, string.format(formatPattern, pattern))
      end
    end
    return pargs
  end
  local pargs = args_generator(filter.search)
  vim.list_extend(args, pargs or {})

  return cmd, args
end

---@param opts snacks.picker.grep.Config
---@type snacks.picker.finder
local function multi_grep(opts, ctx)
  if opts.need_search ~= false and ctx.filter.search == '' then
    return function() end
  end
  local cwd = svim.fs.normalize(opts and opts.cwd or uv.cwd() or '.') or nil
  local cmd, args = get_cmd(opts, ctx.filter)
  -- Snacks.notify.info('grep: ' .. cmd .. ' ' .. table.concat(args, ' '))
  return require('snacks.picker.source.proc').proc(
    ctx:opts {
      notify = false,
      cwd = cwd,
      cmd = cmd,
      args = args,
      transform = function(item)
        item.cwd = cwd
        local file, line, col, text = item.text:match '^(.+):(%d+):(%d+):(.*)$'
        if not file then
          if not item.text:match 'WARNING' then Snacks.notify.error('invalid grep output:\n' .. item.text) end
          return false
        else
          item.line = text
          item.file = file
          item.pos = { tonumber(line), tonumber(col) - 1 }
        end
      end,
    },
    ctx
  )
end

---@class snacks.picker.multi_grep.Config: snacks.picker.Config

---@param opts? snacks.picker.multi_grep.Config
M.pick = function(opts)
  return Snacks.picker.pick('grep', {
    finder = multi_grep,
    supports_live = true,
    title = 'Multi Grep',
  })
end

return M
