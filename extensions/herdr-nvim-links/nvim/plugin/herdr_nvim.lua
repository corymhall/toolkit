if vim.g.loaded_herdr_nvim then
  return
end
vim.g.loaded_herdr_nvim = true

if vim.env.HERDR_ENV ~= "1" or not vim.env.HERDR_PANE_ID then
  return
end

vim.schedule(function()
  require("herdr_nvim").setup()
end)
