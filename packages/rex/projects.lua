-- Session labels are project identities. No registry or checkout/tab tracking.
local opening = false

local function open_project(ctx, args)
  if not ctx.client_id then error("A Rex client is required") end
  if args.path:sub(1, 1) ~= "/" or args.path:find("%c") then error("Expected an absolute project path") end
  local result, err = rex.exec({ "git", "-C", args.path, "rev-parse", "--show-toplevel" })
  if not result or not result.ok then error(err or result.stderr) end
  local path = result.stdout:gsub("\n$", "")
  local home = os.getenv("HOME")
  local label = path
  if home and path:sub(1, #home + 1) == home .. "/" then label = "~" .. path:sub(#home + 1) end
  if #label > 128 then error("Project path exceeds Rex's 128-byte session label limit") end
  local live
  live, err = rex.call("session.list")
  if not live then error(err) end
  local target
  for _, session in ipairs(live.sessions or {}) do
    if session.label == label then
      if target then error("Multiple sessions match " .. label .. ". Rename the duplicate first.") end
      target = session.session_id
    end
  end
  if not target then
    local created
    created, err = rex.call("session.create", {
      label = label,
      initial_windows = { { window_label = "Terminal", layout = {
        block = { flavor = "com.superlogical.terminal.shell", options = { cwd = path } },
      } } },
    })
    if not created then error(err) end
    target = created.session_id
  end
  rex.client.queue("session.select", { session_id = target })
  return { session_id = target, path = path }
end

rex.action{
  name = "open_project",
  title = "Open or Focus Project",
  args = { path = "string" },
  run = function(ctx, args)
    if opening then error("Another project is opening. Inspect Rex before retrying.") end
    opening = true
    local ok, result = pcall(open_project, ctx, args)
    opening = false
    if not ok then error(result, 0) end
    return result
  end,
}
