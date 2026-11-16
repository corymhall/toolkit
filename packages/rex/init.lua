-- Keep definitions in modules beside this entry point.
require("keys")
require("actions")
require("projects")
require("workspace")
dofile(os.getenv("HOME") .. "/plugins/commentry.nvim/integrations/rex/agents.lua").setup()
dofile(os.getenv("HOME") .. "/plugins/commentry.nvim/integrations/rex/commentry.lua")
