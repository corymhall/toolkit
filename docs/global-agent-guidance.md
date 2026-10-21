# Suggested Global Agent Guidance

Use these instructions in a global agent context file for terminal-aware process
management. For Pi, the file is `~/.pi/agent/AGENTS.md` (or
`$PI_CODING_AGENT_DIR/AGENTS.md`). Merge the section with existing global
instructions rather than replacing unrelated guidance.

```markdown
## Process And Agent Coordination

- When `HERDR_ENV=1`, use Herdr and load its skill before managing long-running
  or interactive processes.
- Otherwise, when `REX_SESSION` and `REX_BLOCK` are set, use Rex and load its
  skill. Scope operations to that session and block rather than the user's focus.
- Use `start_command` and `command_status` when available for ordinary
  long-running commands. They select Herdr or Rex from the environment.
- Re-list terminal resources before acting on saved IDs. Preserve unrelated
  panes and running commands.
- The following review sidecar workflow remains Herdr-only.
- Give each sidecar its own non-focused Herdr tab in the current workspace. Use
  a semantic label such as `agent-general-review` and add a short task suffix
  when duplicate roles may coexist.
- The main session owns sidecar tab creation and cleanup. A sidecar owns only its
  tab and must not spawn additional agents.
- Herdr tab and pane IDs are not durable. Re-list tabs and panes before waiting,
  reading, focusing, or closing. Never reuse a tab containing a working or
  blocked agent.
- Keep a sidecar tab through synthesis so its output remains inspectable. Close
  it after findings are captured and reported unless the user asks to retain it.
- Outside Herdr and Rex, use tmux for long-lived interactive processes.
- One main agent session owns implementation and integration. Use sidecars only
  for bounded research, independent review, or specialist checks; do not
  delegate overlapping implementation work to multiple agents.
- Preserve reusable context in a concise durable artifact. The main session
  must verify material sidecar findings before acting on them.
```

Restart the agent or use its resource reload command after changing a global
context file.
