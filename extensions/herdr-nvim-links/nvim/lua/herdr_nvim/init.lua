local M = {}
local configured = false

local function warn(message)
  vim.schedule(function()
    vim.notify(message, vim.log.levels.WARN, { title = "herdr-nvim" })
  end)
end

local function advertise(server)
  local herdr = vim.fn.exepath("herdr")
  if herdr == "" then
    warn("herdr is not available on PATH; file links cannot discover this Neovim instance")
    return
  end

  vim.system({
    herdr,
    "pane",
    "report-metadata",
    vim.env.HERDR_PANE_ID,
    "--source",
    "herdr-nvim",
    "--token",
    "nvim_server=" .. server,
  }, { text = true }, function(result)
    if result.code ~= 0 then
      local detail = (result.stderr or result.stdout or ""):gsub("%s+$", "")
      warn(detail ~= "" and detail or "failed to advertise the Neovim RPC server to Herdr")
    end
  end)
end

function M.setup()
  if configured or vim.env.HERDR_ENV ~= "1" or not vim.env.HERDR_PANE_ID then
    return
  end
  configured = true

  local server = vim.v.servername
  if server == "" then
    local ok, address = pcall(vim.fn.serverstart)
    if not ok then
      warn("failed to start a Neovim RPC server: " .. tostring(address))
      return
    end
    server = address
  end

  advertise(server)
end

return M
