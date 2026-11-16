-- Ctrl+A sequences coexist with Rex's native shortcuts.
local function bind(key, action, args)
  rex.bind("ctrl+a>" .. key, action, args)
end

bind("ctrl+a", "pane.send_key", { key = "ctrl+a" })
bind("shift+/", "client.palette.toggle") -- ?
bind("s", "client.settings")
bind("shift+r", "client.config.reload")
bind("ctrl+s", "workspace_save")
bind("ctrl+r", "workspace_restore")
bind("w", "session.switch")
bind("u", "session_fzf")
bind("g", "agent_message")
bind("shift+u", "session_picker")
bind("ctrl+u", "session_fzf")
bind("shift+o", "repository_picker")
bind("shift+n", "session.new")
bind("shift+w", "session.rename")
bind("shift+d", "session.close")

bind("c", "client.tab.new")
bind("shift+t", "client.tab.rename")
bind("p", "client.tab.previous")
bind("n", "client.tab.next")
bind("shift+x", "client.tab.close")
bind("shift+,", "client.tab.move.backward") -- <
bind("shift+.", "client.tab.move.forward") -- >
for index = 1, 9 do
  bind(tostring(index), "tab_in_session", { index = index })
end

for key, direction in pairs({ h = "left", j = "down", k = "up", l = "right" }) do
  bind(key, "pane.focus", { direction = direction })
  if key ~= "l" then
    bind("shift+" .. key, "pane.resize", { direction = direction, amount = 5 })
  end
end
-- Keep Shift+L for tmux-style last-tab navigation across picker destinations.
bind("shift+l", "last_tab")
bind("shift+s", "last_tab")
bind("ctrl+l", "pane.resize", { direction = "right", amount = 5 })
bind("tab", "pane.focus_next")
bind("shift+tab", "pane.focus_previous")
bind("v", "pane.split.right")
bind("shift+\\", "pane.split.right") -- |
bind("-", "pane.split.down")
bind("x", "pane.close")
bind("z", "pane.zoom")
bind("b", "client.sidebar.toggle")
bind("shift+e", "pane.balance")
bind("/", "scratch_terminal")
bind("m", "pane.minimize_floating")
bind("a", "commentry_capture")
bind("shift+a", "commentry_new")
bind("i", "commentry_inbox")

rex.mode("resize", { exclusive = true })
bind("r", "client.mode.enter", { name = "resize" })
for key, direction in pairs({
  h = "left", j = "down", k = "up", l = "right",
  left = "left", down = "down", up = "up", right = "right",
}) do
  rex.bind("resize/" .. key, "pane.resize", { direction = direction })
  rex.bind("resize/shift+" .. key, "pane.resize", { direction = direction, amount = 15 })
end
rex.bind("resize/=", "pane.balance")
rex.bind("resize/enter", "client.mode.exit")
rex.bind("resize/escape", "client.mode.exit")

-- Reserved for future ports: Shift+G direct worktree creation,
-- ; last pane, Shift+P pane rename,
-- e scrollback editor, o notification target, q detach.
