# Codex Fast Mode extension

Adds a persistent Fast mode toggle for supported OpenAI Responses and legacy
OpenAI Codex models:

```text
/codex-fast on
/codex-fast off
/codex-fast status
```

When enabled, requests for supported `openai` and `openai-codex` Responses models receive:

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
the OpenAI Fast mode documentation and Codex model catalog:

- `gpt-5.4`
- `gpt-5.5`
- `gpt-5.6-luna`
- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-6-astra`
- `gpt-6-sol`
- `gpt-6-luna`
- `gpt-6.1-sol`

Astra's entry was verified in the local OpenAI Codex catalog fetched on
2026-09-09. It lists `priority` as `Fast` with the description
"2x speed, increased usage".

Unknown models and `gpt-5.4-mini` are left unchanged. `/codex-fast status`
reports when the toggle is enabled but inactive for the selected model. The
allowlist should be reviewed when Pi adds or removes OpenAI models.

The current [OpenAI Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode)
shows `gpt-6.1-sol` and confirms that `priority` and `fast` select the same tier.
Fast mode increases usage or cost; the toggle remains off by default.
