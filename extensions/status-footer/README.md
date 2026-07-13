# Status Footer extension

A compact, Codex-inspired Pi footer that prioritizes two signals:

- `weekly N% left`: remaining ChatGPT Codex subscription capacity.
- `context N% left`: remaining context in the current Pi session.

When space permits, the footer also shows the active model, thinking level,
and Git branch. On narrow terminals it drops those optional fields before quota
or context. Context remaining is green above 75%, yellow from 45% through 75%,
and red below 45%.

Example:

```text
gpt-5.3-codex high · main · weekly 98% left · context 53% left
```

## Weekly-limit source

Pi does not expose ChatGPT account quota as session state, but its
provider-response hook includes Codex rolling-window headers. After an OpenAI
Codex response, those headers are authoritative because they came from Pi's
active account.

For an initial value before the first response, the extension asks the locally
installed Codex CLI for `account/rateLimits/read` through `codex app-server`,
then selects its seven-day window. `/status-refresh` repeats that fallback
request.

This means:

- For a startup value, `codex` must be installed and signed into ChatGPT.
- The startup fallback only describes Pi's OpenAI subscription when Pi and
  Codex are signed into the same ChatGPT account. A later Pi response replaces
  it with Pi's own account data.
- If Codex is unavailable, unauthenticated, or changes its experimental
  app-server protocol, the footer displays `weekly ?` until Pi receives
  compatible Codex rate-limit headers. Pi continues normally.

The extension never reads or logs Codex credential files. The local Codex
process handles fallback authentication.

## Context semantics

Pi reports context as percent used. The extension renders the complement,
rounded to a whole percentage, so it matches Codex's “context left” framing.
Immediately after compaction, Pi may temporarily report context as unknown; the
footer displays `context ?` until usage is available again.
