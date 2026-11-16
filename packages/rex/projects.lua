-- Session labels are project identities. No registry or checkout/tab tracking.
local opening = false

local function git(path, ...)
  if path:sub(1, 1) ~= "/" or path:find("%c") then error("Expected an absolute checkout path") end
  local command = { "git", "-C", path }
  for _, arg in ipairs({ ... }) do command[#command + 1] = arg end
  local result, err = rex.exec(command)
  if not result or not result.ok then error(err or (result and result.stderr) or "Git failed") end
  local value = result.stdout:gsub("\n$", "")
  if value:find("%c") then error("Git returned control characters") end
  return value
end

local function project_session(path, checkout, tab_label)
  local home = os.getenv("HOME")
  local legacy_label = path
  if home and path:sub(1, #home + 1) == home .. "/" then legacy_label = "~" .. path:sub(#home + 1) end
  local label = path:match("([^/]+)$")
  if not label or #label > 128 then error("Project name exceeds Rex's 128-byte session label limit") end
  local live, err = rex.call("session.list")
  if not live then error(err) end
  local target
  local rename = false
  for _, session in ipairs(live.sessions or {}) do
    if session.label == label or session.label == legacy_label or session.label == path then
      if target then error("Multiple sessions match " .. label .. ". Rename the duplicate first.") end
      target = session.session_id
      rename = session.label ~= label
    end
  end
  if target then
    -- The picker may run in another project. Session mutations require this
    -- connection to attach to the destination, not just name its session ID.
    local attached
    attached, err = rex.call("session.attach", { session_id = target })
    if not attached then error(err) end
  end
  if rename then
    local updated
    updated, err = rex.call("session.set_label", { session_id = target, label = label })
    if not updated then error(err) end
  end
  if not target then
    local created
    created, err = rex.call("session.create", {
      label = label,
      initial_windows = { { window_label = tab_label, layout = {
        block = { flavor = "com.superlogical.terminal.shell", options = { cwd = checkout } },
      } } },
    })
    if not created then error(err) end
    return created.session_id, created.initial_windows[1].window_id
  end
  return target
end

local function open_project(ctx, args)
  if not ctx.client_id then error("A Rex client is required") end
  local path = git(args.project or args.path, "rev-parse", "--show-toplevel")
  local checkout, tab_label = path, "Terminal"
  if args.project then
    checkout = git(args.path, "rev-parse", "--show-toplevel")
    if git(path, "rev-parse", "--path-format=absolute", "--git-common-dir") ~=
        git(checkout, "rev-parse", "--path-format=absolute", "--git-common-dir") then
      error("Checkout does not belong to the selected project")
    end
    tab_label = git(checkout, "rev-parse", "--abbrev-ref", "HEAD")
    if #tab_label > 128 then error("Branch name exceeds Rex's 128-byte tab label limit") end
  end
  local target, window = project_session(path, checkout, tab_label)
  if args.project and not window then
    local created, err = rex.call("session.new_window", {
      session_id = target, window_label = tab_label, focus = false,
      layout = { block = { flavor = "com.superlogical.terminal.shell", options = { cwd = checkout } } },
    })
    if not created then error(err) end
    window = created.window_id
  end
  rex.client.queue("session.select", { session_id = target, window_id = window })
  return { session_id = target, window_id = window, path = checkout }
end

local function open(ctx, args)
  if opening then error("Another project is opening. Inspect Rex before retrying.") end
  opening = true
  local ok, result = pcall(open_project, ctx, args)
  opening = false
  if not ok then error(result, 0) end
  return result
end

rex.action{
  name = "open_project",
  title = "Open or Focus Project",
  args = { path = "string" },
  run = open,
}

rex.action{
  name = "open_worktree",
  title = "Open Worktree in a New Project Tab",
  args = { project = "string", path = "string" },
  run = open,
}
