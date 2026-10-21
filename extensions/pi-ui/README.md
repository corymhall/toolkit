# Pi UI extension

One packaged Pi extension that composes the toolkit's interactive UI features:

- [Tool Cards](tool-cards/README.md) renders built-in and custom tool calls as
  compact, Cendre-aware cards.
- [Status Composer](status-footer/README.md) puts working state, context progress,
  Codex weekly quota, model details, path, and Git status in the input border.
- [Skill Autocomplete](skill-autocomplete/README.md) adds inline `$skill-name`
  completion and explicit user-only skill invocation.

The entry point keeps each feature in a focused module with separate tests.
TUI-only features do not activate in RPC, JSON, or print modes.

Web Access and Command Runner remain separate tool extensions. They import the
shared Tool Cards component for a consistent display.
