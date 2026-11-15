return {
  {
    'nvim-treesitter/nvim-treesitter-context',
    opts = {
      enable = true,
      throttle = true,
      patterns = {
        default = {
          'function',
          'method',
          'for',
          'while',
          'if',
          'switch',
          'case',
        },
        typescript = {
          'class_declaration',
          'abstract_class_declaration',
          'else_clause',
        },
      },
    },
  },
  {
    'nvim-treesitter/nvim-treesitter',
    -- tag = 'v0.10.0',
    branch = 'main',
    lazy = false,
    build = ':TSUpdate',
    dependencies = {
      { 'Hdoc1509/gh-actions.nvim' },
      { 'nvim-treesitter/nvim-treesitter-textobjects', branch = 'main' },
    },
    init = function(plugin)
      vim.treesitter.language.register('typescript', 'ts')
      require('lazy.core.loader').add_to_rtp(plugin)
      require('vim.treesitter.query').add_predicate('is-mise?', function(_, _, bufnr, _)
        local filepath = vim.api.nvim_buf_get_name(tonumber(bufnr) or 0)
        local filename = vim.fn.fnamemodify(filepath, ':t')
        return string.match(filename, '.*mise.*%.toml$') ~= nil
      end, { force = true, all = false })
    end,
    config = function()
      require('nvim-treesitter').setup {}
      -- vim.api.nvim_create_autocmd('User', {
      --   pattern = 'TSUpdate',
      --   callback = function()
      --     -- something broke in the most recent version with neotest-go
      --     -- pinning to v0.23.4
      --     require('nvim-treesitter.parsers').go.install_info.revision = '3c3775faa968158a8b4ac190a7fda867fd5fb748'
      --   end,
      -- })
      require('gh-actions.tree-sitter').setup()
      require('nvim-treesitter').install {
        'go',
        'html',
        'tsx',
        'markdown',
        'markdown_inline',
        'python',
        'toml',
        'yaml',
        'bash',
        'lua',
        'comment',
        'graphql',
        'hcl',
        'terraform',
        'http',
        'json',
        'regex',
        'vue',
        'query',
        'diff',
        'css',
        'gitignore',
        'java',
        'jsdoc',
        'gh_actions_expressions',
        'gitignore',
      }
      vim.treesitter.query.set('diff', 'injections', '')
    end,
  },
}
