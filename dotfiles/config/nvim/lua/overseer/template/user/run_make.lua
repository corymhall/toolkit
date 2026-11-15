---@type overseer.TemplateFileDefinition
return {
  name = 'run make',

  builder = function()
    return {
      cmd = { 'make' },
      components = {
        'display_duration',
        'on_complete_notify',
        { 'on_output_quickfix', open_on_exit = 'failure' },
        'default',
      },
    }
  end,
}
