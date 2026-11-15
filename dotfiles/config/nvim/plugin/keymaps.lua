local wk = require 'which-key'
local Job = require 'plenary.job'

local function git(args, cwd)
  local output
  ---@diagnostic disable-next-line: missing-fields
  local p = Job:new {
    command = 'git',
    args = args,
    cwd = cwd or Snacks.git.get_root(),
  }
  p:after_success(function(j) output = j:result() end)
  p:sync()
  return output or {}
end

local function git_branch()
  local buf_name = vim.api.nvim_buf_get_name(0)
  local fugitiveUrl = vim.split(buf_name, 'fugitive://', { trimempty = true })
  local cwd = fugitiveUrl[1]
  print(cwd)
  local stdout = git({ 'rev-parse', '--abbrev-ref', 'HEAD' }, cwd)
  return stdout[1]
end

wk.add {
  { '<leader>bd', ':bdelete<cr>', desc = 'delete buffer' },
  { '<leader>gy', group = '[G]it [Y]ank' },
  { '<leader>go', group = '[G]it [O]pen' },
  { '<leader>gv', group = '[G]it Diff[v]iew' },
  {
    '<leader>gP',
    function()
      local branch = git_branch()
      print(branch)
      if branch == 'master' or branch == 'main' then
        vim.notify('Pushing on main branch!', vim.log.levels.ERROR)
        return
      end
      vim.api.nvim_cmd({
        cmd = 'Git',
        args = { 'push' },
      }, {})
    end,
    desc = 'Git push',
  },
  { '<leader>gd', ':Gvdiffsplit!<CR>', desc = 'Git diff' },
  { '<leader>ge', ':Gedit<CR>', desc = 'Git edit' },
  { '<leader>gr', group = '[G]it [R]eview / [R]estore' },
  {
    '<leader>grp',
    function()
      local num = vim.fn.input 'Commits back: '
      local args = string.format('HEAD~%s:%%', num)
      vim.api.nvim_cmd({
        cmd = 'Gread',
        args = { args },
      }, {})
    end,
    desc = 'Restore previous commit',
  },
  -- l = { ':silent! Glog<CR>:bot copen<CR>', 'Git log'},
  -- o = { ':Git checkout<Space>', 'Git checkout <branch>'},
  { '<leader>gs', ':G<CR>', desc = 'Git status' },
  { '<leader>gf', group = '[G]it [F]etch' },
  { '<leader>gfa', ':Git fetch --all<CR>', desc = 'Git fetch all' },
  { '<leader>l', group = '[L]sp' },
  { '<leader>lr', ':LspRestart<CR>', desc = 'Restart LSP' },
  { '<leader>li', ':LspInfo<CR>', desc = 'LSP Info' },
  { '<leader>ls', ':LspStart<CR>', desc = 'Start LSP' },
  { '<leader>lx', ':LspStop<CR>', desc = 'Stop LSP' },
  { '<leader>q', group = '[Q]uickfix' },
  { '<leader>qo', ':copen<CR>', desc = 'Open quickfix' },
  { '<leader>qq', ':cclose<CR>', desc = 'Close quickfix' },
  { '<leader>qn', ':cnext<CR>', desc = 'Next item in quickfix' },
  { '<leader>qp', ':cprev<CR>', desc = 'Previous item in quickfix' },
  { ';', desc = 'which_key_ignore' },
}

-- Terminal mappings
vim.keymap.set('t', '<esc><esc>', [[<C-\><C-n>]], { desc = 'Enter normal mode' })
vim.keymap.set('t', 'jj', [[<C-\><C-n>]], { desc = 'Enter normal mode' })
vim.keymap.set('t', '<C-h>', [[<Cmd>wincmd h<CR>]], { desc = 'Go to left window ' })
vim.keymap.set('t', '<C-j>', [[<Cmd>wincmd j<CR>]], { desc = 'Go to lower window' })
vim.keymap.set('t', '<C-k>', [[<Cmd>wincmd k<CR>]], { desc = 'Go to upper window' })
vim.keymap.set('t', '<C-l>', [[<Cmd>wincmd l<CR>]], { desc = 'Go to right window' })
vim.keymap.set('t', '<C-w>', [[<C-\><C-n><C-w>]], { desc = 'Terminal Window Mappings' })
vim.keymap.set('t', '<C-/>', '<cmd>close<cr>', { desc = 'Hide Terminal', remap = true })
vim.keymap.set('t', '<C-_>', '<cmd>close<cr>', { desc = 'Hide Terminal', remap = true })

-- always scroll all the way left horizontally when using ^
-- listchars (e.g. `>`) can impact ^
vim.keymap.set('n', '^', '^zH', { noremap = true, silent = true })

vim.keymap.set('i', 'jj', '<ESC>')
vim.keymap.set('', '<C-h>', '<C-w>h')
vim.keymap.set('', '<C-j>', '<C-w>j')
vim.keymap.set('', '<C-k>', '<C-w>k')
vim.keymap.set('', '<C-l>', '<C-w>l')

-- These mappings control the size of splits (height/width)
vim.keymap.set('n', '<M-,>', '<c-w>5<')
vim.keymap.set('n', '<M-.>', '<c-w>5>')
vim.keymap.set('n', '<M-t>', '<C-W>+')
vim.keymap.set('n', '<M-s>', '<C-W>-')

vim.keymap.set('n', '<leader><leader>x', '<cmd>source %<CR>', { desc = 'Execute the current file' })
vim.keymap.set('n', '<leader>fp', function()
  local path = vim.api.nvim_buf_get_name(0)
  if path == '' then
    vim.notify('Current buffer has no file path', vim.log.levels.WARN)
    return
  end

  vim.fn.setreg('+', vim.fn.fnamemodify(path, ':p'))
  vim.notify 'Copied absolute file path to clipboard'
end, { desc = 'Copy absolute file path' })

vim.keymap.set('n', '<C-d>', '<C-d>zz')
vim.keymap.set('n', '<C-u>', '<C-u>zz')
vim.keymap.set('n', 'n', 'nzzzv')
vim.keymap.set('n', 'N', 'Nzzzv')
vim.keymap.set('n', 'U', '<cmd>redo<cr>') -- redo
vim.keymap.set('n', '<Esc>', function()
  vim.api.nvim_command 'nohlsearch'
  require('notify').dismiss {
    pending = true,
    silent = true,
  }
end)

-- Diagnostic keymaps
vim.keymap.set('n', '[d', function()
  vim.diagnostic.jump {
    count = -1, -- backward
    float = true,
  }
end, { desc = 'Go to previous [D]iagnostic message' })
vim.keymap.set('n', ']d', function()
  vim.diagnostic.jump {
    count = 1, -- forward
    float = true,
  }
end, { desc = 'Go to next [D]iagnostic message' })
vim.keymap.set('n', '[e', function()
  vim.diagnostic.jump {
    severity = vim.diagnostic.severity.ERROR, -- only jump to errors
    count = -1, -- backward
    float = true,
  }
end, { desc = 'Go to previous [D]iagnostic message' })
vim.keymap.set('n', ']e', function()
  vim.diagnostic.jump {
    severity = vim.diagnostic.severity.ERROR, -- only jump to errors
    count = 1, -- forward
    float = true,
  }
end, { desc = 'Go to next [D]iagnostic message' })

vim.keymap.set('n', '<leader>e', vim.diagnostic.open_float, { desc = 'Show diagnostic [E]rror messages' })
vim.keymap.set('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'Open diagnostic [Q]uickfix list' })

-- http://vimcasts.org/episodes/fugitive-vim-resolving-merge-conflicts-with-vimdiff/
vim.keymap.set('n', '<leader>dgt', '<cmd>diffget //2<cr>', { desc = 'diffget //2 (target i.e. current branch)' })
vim.keymap.set('n', '<leader>dgy', '<cmd>diffget //3<cr>', { desc = 'diffget //3 (merge i.e. git merge <branch>)' })

vim.keymap.set({ 'n', 'i', 's' }, '<c-f>', function()
  if not require('noice.lsp').scroll(4) then return '<c-f>' end
end, { silent = true, expr = true })

vim.keymap.set({ 'n', 'i', 's' }, '<c-b>', function()
  if not require('noice.lsp').scroll(-4) then return '<c-b>' end
end, { silent = true, expr = true })

-- map :W to :w (helps which-key issue)
vim.cmd [[ command! W  execute ':w' ]]
