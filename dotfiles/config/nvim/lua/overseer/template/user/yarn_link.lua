---@type overseer.TemplateFileDefinition
return {
  name = 'yarn link',
  ---@return overseer.TaskDefinition
  builder = function(params)
    local root_dir = vim.fs.root(0, { '.git' })
    if root_dir == nil then error("Can't find root directory", vim.log.levels.ERROR) end
    local bin_dir = vim.fs.joinpath(root_dir, 'sdk', 'nodejs', 'bin')
    local cwd = vim.fn.expand '%:p:h'
    local file = io.open(vim.fs.joinpath(root_dir, 'sdk', 'nodejs', 'package.json'), 'r')
    if not file then error 'Could not open package.json' end
    local content = file:read '*all'
    file:close()
    local data = vim.json.decode(content)
    local pkg = data.name
    ---@type overseer.TaskDefinition
    return {
      strategy = {
        'orchestrator',
        tasks = {
          'make install_nodejs_sdk',
          {
            cmd = { 'yarn', 'unlink' },
            cwd = bin_dir,
          },
          {
            cmd = { 'yarn', 'link' },
            cwd = bin_dir,
          },
          {
            cmd = { 'yarn', 'install' },
            cwd = cwd,
          },
          {
            cmd = { 'yarn', 'link', pkg },
            cwd = cwd,
          },
        },
      },
      cmd = 'link',
    }
  end,
}
