# Status Composer

An Amp-inspired Pi input box that moves live session status into the editor
border and removes the separate footer and working row. Rounded side walls and
one row of vertical padding frame the editor content.

The top border shows:

- A ten-cell context-used progress bar and context-remaining percentage. The bar
  starts empty and fills as the session uses context.
- Remaining ChatGPT Codex weekly capacity.
- The active model, thinking level, and Codex Fast mode when active.

The lower border shows the animated working indicator on the left. The right
side shows the working directory, Git branch, and tracked line additions and
deletions relative to `HEAD`. Git line counts refresh at startup and after each
agent run.

All colors come from the active Pi theme. The editor border keeps Pi's normal
thinking-level color. The progress fill uses the context status color, while its
empty cells use the theme's dim color. Context is green above 75%, yellow from
45% through 75%, and red below 45%.

Example:

```text
╭─────────────────────── ━━━━━━━━━━ ctx 81% left · weekly 92% · gpt-5.5 low ─╮
│                                                                            │
│                                                                            │
│                                                                            │
╰─ ⠸ Working ───────────────── ~/personal/toolkit (main +681 -86) ───────────╯
```

## Weekly-limit source

Pi does not expose ChatGPT account quota as session state, but its
provider-response hook includes Codex rolling-window headers. After an OpenAI
Codex response, those headers are authoritative because they came from Pi's
active account.

For an initial value before the first response, the module asks the locally
installed Codex CLI for `account/rateLimits/read` through `codex app-server`,
then selects its seven-day window. `/status-refresh` reinstalls the custom
footer and repeats that fallback request, so it can also recover UI state after
a problematic resource reload.

This means:

- For a startup value, `codex` must be installed and signed into ChatGPT.
- The startup fallback only describes Pi's OpenAI subscription when Pi and
  Codex are signed into the same ChatGPT account. A later Pi response replaces
  it with Pi's own account data.
- If Codex is unavailable, unauthenticated, or changes its experimental
  app-server protocol, the footer displays `weekly ?` until Pi receives
  compatible Codex rate-limit headers. Pi continues normally.

The module never reads or logs Codex credential files. The local Codex
process handles fallback authentication.

## Context semantics

Pi reports context as percent used. The module renders the complement,
rounded to a whole percentage, so it matches Codex's “context left” framing.
Immediately after compaction, Pi may temporarily report context as unknown; the
footer displays `context ?` until usage is available again.
