# Session Default Model extension

Keeps an explicit model and thinking-level default for new Pi sessions without
making normal session changes global.

Set the current selection as the new-session default:

```text
/session-default save
```

For example, select `openai-codex/gpt-5.6-sol`, set thinking to `medium`, and run
`/session-default save`. You can then change the current session to `xhigh`.
Another new session starts with the saved `medium` default.

Other commands:

```text
/session-default show
/session-default clear
```

The extension stores its setting in
`~/.pi/agent/state/session-default-model.json`, or the equivalent path under a
custom Pi agent directory. It does not rewrite this file when `/model`, model
cycling, or thinking-level cycling changes the current session.

## Session behavior

The saved default applies only when the session has no existing entries. Pi
sessions opened with `/resume`, `pi -c`, or a session path keep their recorded
model and thinking-level changes. Forked and cloned sessions also keep their
existing state.

Pi itself saves interactive model changes in `settings.json`. This extension
does not try to prevent that write. Instead, it applies its separate saved
default during the next empty session. Applying the default also returns Pi's
built-in default settings to the saved selection.

If the saved model is unavailable or has no configured authentication, the
extension leaves the new session unchanged and shows a warning. Pi clamps a
saved thinking level when the selected model does not support that level.
