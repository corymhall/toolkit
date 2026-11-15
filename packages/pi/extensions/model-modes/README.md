# Model Modes

Command-only Pi extension for model and reasoning effort presets.

| Command             | OpenAI Codex model | Effort |
| ------------------- | ------------------ | ------ |
| `/mode implement`   | `gpt-6.1-sol`      | low    |
| `/mode discuss`     | `gpt-6.1-terra`    | medium |
| `/mode investigate` | `gpt-6.1-sol`      | high   |

`/mode` opens a picker. `/mode status` derives the current preset from the actual
model and effort, reporting custom after manual changes that match no preset.
Arguments support autocomplete. Canceling the picker leaves settings unchanged.
Switching is refused while the agent is busy. Missing models or authentication
leave effort unchanged and report an error. No fallback provider is selected.

Modes change only the current session's model and effort through Pi's public APIs.
Pi records those selections for resume. Startup defaults, prompts, tools,
permissions, and service tier are unchanged. Discuss mode does not prevent edits.
Model changes can incur prompt cache misses.

Install this extension with `pi install /absolute/path/to/extensions/model-modes/index.ts`,
then run `/reload` in existing sessions.
