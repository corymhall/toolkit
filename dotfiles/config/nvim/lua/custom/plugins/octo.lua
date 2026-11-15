local getRepo = function()
  local folder = vim.api.nvim_cmd({
    cmd = 'Git',
    args = { 'ls-remote --get-url origin' },
  }, { output = true })
  print('folder', folder)
  local withoutExt = vim.split(folder, '.git', { plain = true })
  -- P({'withoutExt', withoutExt})
  local withoutHost = vim.split(withoutExt[1], '//', { plain = true })
  -- P({'withoutHost', withoutHost})
  local orgRepo = vim.split(withoutHost[2], '/', { plain = true })
  -- P({'orgrepo', orgRepo})
  local org = orgRepo[2]
  local repo = orgRepo[3]
  return {
    repo = repo,
    org = org,
  }
end
local pulumi_repos = {
  'repo:pulumi/pulumi-aws',
  'repo:pulumi/pulumi-awsx',
  'repo:pulumi/pulumi-eks',
  'repo:pulumi/pulumi-cdk',
}
return {
  'pwntester/octo.nvim',
  init = function() vim.treesitter.language.register('markdown', 'octo') end,
  opts = {
    timeout = 10000,
    use_local_fs = true, -- use local files on right side of reviews
    enable_builtin = true,
    -- default_to_projects_v2 = true,
    picker = 'snacks',
    mappings = {
      submit_win = {
        approve_review = { lhs = '<M-a>', 'approve review' },
        comment_review = { lhs = '<M-m>', 'comment review' },
        request_changes = { lhs = '<M-r>', 'request changes' },
      },
    },
  },
  keys = {
    { '<localleader>a', '', desc = '+assignee (Octo)', ft = 'octo' },
    { '<localleader>c', '', desc = '+comment/code (Octo)', ft = 'octo' },
    { '<localleader>l', '', desc = '+label (Octo)', ft = 'octo' },
    { '<localleader>i', '', desc = '+issue (Octo)', ft = 'octo' },
    { '<localleader>r', '', desc = '+react (Octo)', ft = 'octo' },
    { '<localleader>p', '', desc = '+pr (Octo)', ft = 'octo' },
    { '<localleader>pr', '', desc = '+rebase (Octo)', ft = 'octo' },
    { '<localleader>ps', '', desc = '+squash (Octo)', ft = 'octo' },
    { '<localleader>v', '', desc = '+review (Octo)', ft = 'octo' },
    { '<localleader>g', '', desc = '+goto_issue (Octo)', ft = 'octo' },
    { '@', '@<C-x><C-o>', mode = 'i', ft = 'octo', silent = true },
    { '#', '#<C-x><C-o>', mode = 'i', ft = 'octo', silent = true },

    {
      '<leader>grs',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'review', 'start' },
        }, {})
      end,
      desc = 'Start PR review',
    },
    {
      '<leader>grr',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'review', 'resume' },
        }, {})
      end,
      desc = 'Resume PR review',
    },
    {
      '<leader>grt',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'review', 'comments' },
        }, {})
      end,
      desc = 'Review PR comments',
    },

    {
      '<leader>gru',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'review', 'submit' },
        }, {})
      end,
      desc = 'Submit PR review',
    },
    {
      '<leader>grx',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'review', 'discard' },
        }, {})
      end,
      desc = 'Discard PR review',
    },
    -- End Reviews

    -- PRs
    {
      '<leader>gpc',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'pr', 'create' },
        }, {})
      end,
      desc = 'Create PR',
    },
    {
      '<leader>gpb',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'pr', 'browser' },
        }, {})
      end,
      desc = 'Open PR in Browser',
    },
    {
      '<leader>gps',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'pr', 'search' },
        }, {})
      end,
      desc = 'Search PRs',
    },
    -- End PRs

    -- List
    {
      '<leader>gplm',
      function()
        local prompt = 'is:pr sort:updated-desc status:success is:open type:pr user-review-requested:@me'
        -- local prompt = string.format(
        --   "is:pr sort:updated-desc status:success is:open type:pr user-review-requested:@me %s",
        --   table.concat(pulumi_repos, " ")
        -- )
        -- print(prompt)
        require('octo.pickers.telescope.provider').search { prompt = prompt }
      end,
      desc = 'Open Pulumi PRs for review',
    },
    {
      '<leader>gpln',
      function()
        local prompt = 'is:pr sort:updated-desc status:success is:open user-review-requested:corymhall'
        require('octo.pickers.telescope.provider').search { prompt = prompt }
      end,
      desc = 'Open PRs requested review',
    },
    {
      '<leader>gplc',
      function()
        local repo = getRepo()
        local prompt = string.format('is:pr sort:updated-desc is:open repo:%s/%s', repo.org, repo.repo)
        print(prompt)
        require('octo.pickers.telescope.provider').search { prompt = prompt }
      end,
      desc = 'Current repo PRs',
    },
    -- End List

    -- Issues
    {
      '<leader>gis',
      function()
        vim.api.nvim_cmd({
          cmd = 'Octo',
          args = { 'issue', 'search', 'is:open' },
        }, {})
      end,
      desc = 'Search issues',
    },
  },
}
