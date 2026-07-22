# System Prompt extension

Adds a local viewer for Pi's assembled system-prompt string:

```text
/system-prompt
/system-prompt last
/system-prompt current
```

`/system-prompt` and `/system-prompt last` open the prompt captured at the most
recent `agent_start`. That event runs after `before_agent_start`, so the viewer
includes all per-run system-prompt changes made by extensions. If no agent run
has occurred since the extension loaded, it falls back to the currently
assembled prompt and displays a warning.

`/system-prompt current` always reads `ctx.getSystemPrompt()` when the command is
invoked. The prompt opens in Pi's multiline editor for scrolling and copying;
any edits are discarded. The extension does not add the prompt to model context
or persist another copy in the session.

## Boundary

This displays Pi's system-prompt string. It does not include message changes
made by the `context` event, provider payload serialization, or rewrites made by
`before_provider_request`. Provider- or host-level instructions that are not
part of Pi's prompt string are also outside the extension API.

The displayed prompt can contain project context files and other sensitive
local instructions. Treat copied output accordingly.
