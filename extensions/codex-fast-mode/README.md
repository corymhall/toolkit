# Codex Fast Mode extension

Adds a persistent, provider-specific Fast mode toggle for supported OpenAI Codex
subscription models:

```text
/codex-fast on
/codex-fast off
/codex-fast status
```

When enabled, requests for supported `openai-codex` Responses models receive:

```json
{
  "service_tier": "priority"
}
```

The extension does not change reasoning effort or text verbosity. It also leaves
an existing `service_tier` untouched so that explicit provider configuration or
an earlier extension takes precedence.

The toggle is stored under Pi's agent state directory and defaults to off. The
status footer displays `fast` next to the model and thinking level only when the
toggle is enabled and the selected model is supported.

## Model support

Pi's model type does not currently expose OpenAI's service-tier capability
metadata. The extension therefore uses a conservative allowlist derived from
the OpenAI Codex model catalog entries that advertise the `priority` tier as
`Fast`:

- `gpt-5.4`
- `gpt-5.5`
- `gpt-5.6-luna`
- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-6-astra`

Astra's entry was verified in the local OpenAI Codex catalog fetched on
2026-09-09. It lists `priority` as `Fast` with the description
"2x speed, increased usage".

Unknown models and `gpt-5.4-mini` are left unchanged. `/codex-fast status`
reports when the toggle is enabled but inactive for the selected model. The
allowlist should be reviewed when Pi adds or removes OpenAI Codex models.
