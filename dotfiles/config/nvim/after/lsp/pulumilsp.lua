return {
  single_file_support = true,
  filetypes = { 'typescript' },
  root_dir = vim.fs.root(0, 'Pulumi.yaml'),
  cmd = { 'pulumilsp' },
}
