return {
  {
    name = 'commentry',
    dependencies = { 'dlyongemallo/diffview-plus.nvim' },
    opts = {
      -- only needed if you want to test send-to-codex:
      agent = { enabled = true },
    },
    dir = '~/plugins/commentry.nvim',
    dev = true,
    lazy = false,
  },
}
