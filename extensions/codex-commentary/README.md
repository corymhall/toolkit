# Codex Commentary extension

Adds Codex CLI-style intermediate commentary instructions to Pi's system prompt
when the active model uses the `openai-codex-responses` API.

For tool-using and longer tasks, supported Codex models can emit concise
user-facing progress messages in the Responses API `commentary` phase before or
between tool calls. The completed response remains in the `final` phase.

Pi 0.80.6 already receives, renders, persists, and replays commentary text and
its phase metadata. Pi currently renders commentary like ordinary assistant
text rather than giving it separate styling.

## Prompt adaptation

The extension closely follows the current Codex CLI model instructions. It makes
two deliberate Pi-specific changes:

- It replaces Codex's fixed “no more than 60 seconds” cadence with occasional
  updates during longer work, avoiding unnecessary narration for short tasks.
- It omits the statement that commentary is collapsed after the final answer,
  because Pi does not currently collapse it.

The instructions are applied only to `openai-codex` models using
`openai-codex-responses`; other providers are unchanged. There is no toggle or
persistent state.
