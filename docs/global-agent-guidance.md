# Global process guidance

Public process instructions live in `agent-config/shared-instructions.md`.
Apply them with `mise bootstrap --yes`, then reload the agent.

Use `start_command` for ordinary long-running commands. Continue independent
work or yield until the completion notification arrives. Use `command_status`
for diagnostics, not routine polling.

When operating Rex manually, load its skill, scope operations to the current
session and block, and re-list resources before acting on saved IDs.
Preserve unrelated panes and commands.
