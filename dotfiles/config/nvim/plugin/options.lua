-- preview substitutions live, as you type
vim.opt.inccommand = 'nosplit'
vim.opt.completeopt = 'menu,menuone,noselect'

vim.opt.foldmethod = 'manual'

-- don't like wrapping lines
vim.opt.wrap = false
-- vim.opt.linebreak = true

-- don't prompt for more in listings
vim.opt.more = false

-- no swapfile!
vim.opt.swapfile = false

vim.g.have_nerd_font = true

-- don't show the mode since it's already in the statusline
vim.opt.showmode = false

vim.opt.pumblend = 10 -- Popup menu transparency

-- save undo history
vim.opt.undofile = true

vim.opt.spell = true
vim.opt.spelllang = 'en'

vim.opt.laststatus = 3 -- global statusline

vim.opt.wildmode = 'longest:full,full' -- Command-line completion mode

-- Sets how neovim will display certain whitespace characters in the editor
vim.opt.list = true
-- limited
vim.opt.listchars = {
  eol = '↲',
  tab = '» ',
  trail = '·',
  extends = '<',
  precedes = '>',
  conceal = '┊',
  nbsp = '␣',
}

vim.opt.fillchars = {
  foldopen = '',
  foldclose = '',
  fold = ' ',
  foldsep = ' ',
  diff = '╱',
  eob = ' ',
  horiz = '━',
  horizup = '┻',
  horizdown = '┳',
  vert = '┃',
  vertleft = '┨',
  vertright = '┣',
  verthoriz = '╋',
}

-- Case-insensitive searching UNLESS /C or capital in search
vim.opt.ignorecase = true -- ignore case
vim.opt.smartcase = true -- Do not ignore case with capitals

-- keep signcolumn on
vim.opt.signcolumn = 'yes'

-- decrease mapped sequence wait time
vim.opt.timeoutlen = 300

-- how to split
vim.opt.splitbelow = true -- Put new windows below current
vim.opt.splitright = true -- Put new windows right of current

-- minimal number of screen lines to keep above and below the cursor
vim.opt.scrolloff = 10

-- line numbers
vim.opt.relativenumber = true -- Show line numbers
vim.opt.number = true -- But show the actual number for the line we're on

vim.opt.expandtab = true -- use spaces instead of tabs
vim.opt.hidden = true -- enable background buffers
vim.opt.joinspaces = false -- non double spaces with join

-- Round indent to multiple of 'shiftwidth'.  Applies to > and <
vim.opt.shiftround = true -- round indent
vim.opt.shiftwidth = 2 --size of indent
vim.opt.tabstop = 2 -- Number of spaces tabs count for

vim.opt.sidescrolloff = 8 -- columns of context
vim.opt.smartindent = true -- Insert indents automatically

vim.opt.termguicolors = true -- True color support
vim.opt.mouse = 'a'

vim.opt.clipboard = 'unnamedplus'

--Remap space as leader key
vim.api.nvim_set_keymap('', ' ', '<Nop>', { noremap = true, silent = true })

vim.g.loaded_python3_provider = 0
vim.g.loaded_perl_provider = 0
vim.g.loaded_ruby_provider = 0
vim.g.loaded_node_provider = 0
