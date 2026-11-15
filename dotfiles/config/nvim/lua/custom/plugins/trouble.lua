return {
  "folke/trouble.nvim",
  opts = {},
  keys = {
    {
      "<leader>xw",
      "<cmd>Trouble diagnostics toggle<cr>",
      desc = "Workspace diagnostics (Trouble)",
    },
    {
      "<leader>xb",
      "<cmd>Trouble diagnostics toggle filter.buf=0<cr>",
      desc = "Buffer diagnostics (Trouble)",
    },
  },
  dependencies = { "nvim-tree/nvim-web-devicons" },
}
