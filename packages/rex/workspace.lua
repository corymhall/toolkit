-- Manual save/preview/restore. State and resume commands live in the Go CLI.
-- No watcher or snapshot is started while loading this file.
local launch = 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"; toolkit rex workspace "$@"; result=$?; printf "\nPress Enter to close. "; read -r answer; exit "$result"'

local function open(ctx, command)
  local view, err = rex.session.view{}
  if not view then error(err) end
  local origin = view.active_window_id
  for _, window in ipairs(view.windows or {}) do
    for _, layer in ipairs(window.layers or {}) do
      for _, block in ipairs(layer.blocks or {}) do
        if block.block_id == ctx.block_id then origin = window.window_id end
      end
    end
  end
  local window, create_err = rex.session.new_window{
    window_label = "Rex workspace control",
    layout = rex.layout.block{
      flavor = "com.superlogical.terminal.shell",
      options = {
        command = { "env", "REX_WORKSPACE_ORIGIN_SESSION=" .. ctx.session_id,
          "REX_WORKSPACE_ORIGIN_WINDOW=" .. (origin or ""),
          "/bin/sh", "-c", launch, "rex-workspace", command },
        shell = "none",
      },
    },
  }
  if not window then error(create_err) end
  local waited, wait_err = rex.exec({ "/bin/sleep", "0.2" })
  if not waited or not waited.ok then error(wait_err or "Focus delay failed") end
  rex.client.queue("session.select", { session_id = ctx.session_id, window_id = window.window_id })
end

rex.action{
  name = "workspace_save", title = "Save Agent Snapshot Backup",
  run = function(ctx) open(ctx, "save") end,
}
rex.action{
  name = "workspace_preview", title = "Preview Tracked Agent Resume",
  run = function(ctx) open(ctx, "preview") end,
}
rex.action{
  name = "workspace_restore", title = "Resume Tracked Agents",
  run = function(ctx) open(ctx, "restore") end,
}
