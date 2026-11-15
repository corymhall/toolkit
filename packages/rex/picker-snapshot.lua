-- Read-only picker data over one connection, without per-query CLI launches.
local listing, err = rex.call("session.list", {})
if not listing then error(err) end
local result = { sessions = {}, views = {}, blocks = {} }
for _, session in ipairs(listing.sessions or {}) do
  local sid = session.session_id
  local attached, attach_err = rex.call("session.attach", { session_id = sid })
  if not attached then
    -- A session can disappear between listing and attaching. Other errors matter.
    local current, list_err = rex.call("session.list", {})
    if not current then error(list_err) end
    for _, live in ipairs(current.sessions or {}) do
      if live.session_id == sid then error(attach_err) end
    end
  else
    table.insert(result.sessions, session)
    result.views[sid] = attached.view
    result.blocks[sid] = {}
    for _, window in ipairs(attached.view.windows or {}) do
      for _, layer in ipairs(window.layers or {}) do
        for _, block in ipairs(layer.blocks or {}) do
          if block.creator_name == "com.superlogical.terminal" then
            local values = {}
            for _, method in ipairs({ "program_status", "process", "pwd", "title" }) do
              local value = rex.call("com.superlogical.terminal." .. method, {
                session_id = sid, block_id = block.block_id, args = {},
              })
              -- Closed panes can race the snapshot. Let Python's ordinary call
              -- surface an error if the missing value is actually needed.
              if value then values[method] = value end
            end
            result.blocks[sid][block.block_id] = values
          end
        end
      end
    end
  end
end
return result
