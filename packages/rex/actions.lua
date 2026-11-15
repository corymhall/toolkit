rex.action{
  name = "tab_in_session",
  title = "Go to Tab in Current Session",
  args = { index = "integer" },
  run = function(ctx, args)
    local view, err = rex.session.view{}
    if not view then error(err) end
    local window = view.windows[args.index]
    if not window then return end
    rex.client.queue("session.select", {
      session_id = ctx.session_id,
      window_id = window.window_id,
    })
  end,
}

local picker_root = os.getenv("HOME") .. "/.config/rex"
-- Extend the terminal's PATH, which includes Rex's injected CLI directory.
local picker_launch = 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"; exec python3 "$@"'

local function source_window(ctx, view)
  -- Action context follows the app's pane, even if server focus differs.
  for _, window in ipairs(view.windows or {}) do
    for _, layer in ipairs(window.layers or {}) do
      for _, block in ipairs(layer.blocks or {}) do
        if ctx.block_id and block.block_id == ctx.block_id then
          return window.window_id
        end
      end
    end
  end
  return view.active_window_id
end

local function native_picker_command(ctx, view)
  return {
    os.getenv("HOME") .. "/personal/picker-ui/target/debug/Rex Picker.app/Contents/MacOS/rex-picker",
    "--client", ctx.client_id,
    "--origin", ctx.session_id,
    "--origin-window", source_window(ctx, view) or "",
    "--origin-pane", ctx.block_id or "",
  }
end

local native_picker_env = {
  REX_PICKER_REX = os.getenv("HOME") .. "/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex",
}

-- Rex keeps handling keys while exec waits. Do not overlap last-tab mutations.
local last_tab_busy = false
rex.action{
  name = "last_tab",
  title = "Switch to Last Picker Tab",
  run = function(ctx)
    local view, view_err = rex.session.view{}
    if not view then error(view_err) end
    -- Check after the view request, which can yield to another key action.
    if last_tab_busy then return end
    local command = native_picker_command(ctx, view)
    command[#command + 1] = "--previous"
    last_tab_busy = true
    local result, err = rex.exec(command, { env = native_picker_env, timeout = 120 })
    last_tab_busy = false
    if not result then error(err) end
    if result.timed_out then
      error("Last-tab navigation timed out. Its outcome is unknown; it was not retried.")
    end
    if not result.ok or result.stderr ~= "" then
      error(result.stderr ~= "" and result.stderr or "Last-tab navigation failed")
    end
  end,
}

local function remember_picker_focus(ctx)
  -- The app's focused pane can differ from the server's remembered pane.
  -- Seed the tiled layer's focus before opening a popup so native layer cleanup
  -- returns to the pane that actually invoked the action, including on Escape.
  if ctx.block_id then
    local focused, err = rex.session.focus_block{ block_id = ctx.block_id }
    if not focused then error(err) end
  end
end

local function open_picker(ctx, channel)
  remember_picker_focus(ctx)
  local view, view_err = rex.session.view{}
  if not view then error(view_err) end
  -- Native floating backgrounds work as of the October 28 Rex update.
  -- Earlier builds needed explicit TUI background painting:
  -- https://discord.com/channels/1546797889009881158/1559282779529936977
  local command = {
    "env", "REX_PICKER_ORIGIN=" .. ctx.session_id,
    "REX_PICKER_ORIGIN_WINDOW=" .. (source_window(ctx, view) or ""),
    "REX_CLIENT=" .. ctx.client_id,
    "/bin/sh", "-c", picker_launch, "rex-picker",
    picker_root .. (channel and "/picker.py" or "/agent-message.py"),
  }
  if channel then
    command[#command + 1] = "picker"
    command[#command + 1] = channel
  end
  local layer, err = rex.session.new_layer{
    window_id = source_window(ctx, view),
    bounds = { 0.1, 0.1, 0.8, 0.8 },
    focus = true,
    layout = rex.layout.block{
      flavor = "com.superlogical.terminal.shell",
      options = {
        command = command,
        shell = "none",
      },
    },
  }
  if not layer then error(err) end
end

rex.action{
  name = "repository_picker",
  title = "Browse Repositories and Worktrees",
  run = function(ctx) open_picker(ctx, "rex-repos") end,
}

rex.action{
  name = "session_picker",
  title = "Switch Session",
  run = function(ctx)
    local view, view_err = rex.session.view{}
    if not view then error(view_err) end
    local process, err = rex.exec.start(native_picker_command(ctx, view), {
      detach = true,
      env = native_picker_env,
    })
    if not process then error(err) end
  end,
}

rex.action{
  name = "agent_message",
  title = "Queue Message to Pi Agent",
  run = function(ctx) open_picker(ctx) end,
}

rex.action{
  name = "scratch_terminal",
  title = "Open Floating Scratch Terminal",
  run = function(ctx)
    local view, view_err = rex.session.view{}
    if not view then error(view_err) end
    local window_id = source_window(ctx, view)
    -- Discover by label in this tab so config reloads keep the running shell.
    local terminal_label = "__rex_scratch_terminal"
    for _, window in ipairs(view.windows or {}) do
      if window.window_id == window_id then
        for _, layer in ipairs(window.layers or {}) do
          if layer.kind == "floating" then
            for _, block in ipairs(layer.blocks or {}) do
              if block.label == terminal_label then
                local restored, err = rex.session.set_layer_state{
                  layer_id = layer.layer_id,
                  state = layer.state == "minimized" and "normal" or "minimized",
                  focus = layer.state == "minimized",
                }
                if not restored then error(err) end
                return
              end
            end
          end
        end
      end
    end
    local options = {}
    if ctx.block_id then
      local process = rex.block.call("com.superlogical.terminal", "process", { block_id = ctx.block_id })
      if process then
        local foreground = process.foreground or {}
        local child = process.child or {}
        options.cwd = foreground.cwd or child.cwd
        if not options.cwd then
          for _, ancestor in ipairs(process.ancestors or {}) do
            if ancestor.cwd then options.cwd = ancestor.cwd; break end
          end
        end
      end
    end
    local layer, err = rex.session.new_layer{
      window_id = window_id,
      bounds = { 0.1, 0.1, 0.8, 0.8 },
      focus = true,
      layout = { block = {
        flavor = "com.superlogical.terminal.shell",
        label = terminal_label,
        options = options,
      } },
    }
    if not layer then error(err) end
  end,
}
