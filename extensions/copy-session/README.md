# Copy Session

Run `/reference-session` to search saved sessions without leaving the current
conversation. The picker starts in the current working directory. Press Tab to
search all projects and worktrees, with working directories shown in the list.
Enter pastes only the selected session file path at the editor cursor. Escape
cancels without changing your draft. Nothing is submitted to the model.
Press Ctrl+Alt+S to open the picker while keeping a draft, including previously
inserted references. Repeat the shortcut to reference multiple sessions. The
picker cannot delete or rename sessions. It reuses Pi's resume picker, including
its search and sorting controls.

Run `/copy-session` to copy a ready-to-paste prompt asking another agent to use
the Evaler skill to inspect the current saved Pi session. Press Ctrl+S in the
main prompt editor for the same action. It leaves any draft prompt untouched;
Pi's dialog-specific Ctrl+S bindings keep their normal behavior.

Add a question to focus the lookup:

```text
/copy-session Why did we choose this approach?
```

The prompt contains the exact session file path, session ID, working directory,
and your optional question. It copies a reference, not the transcript or a
generated summary. Nothing is sent to the current model, and Evaler is not run
until you paste and submit the prompt in the destination session.

The destination needs Evaler, its skill, and access to the saved session file.
Unsaved sessions are rejected without changing the clipboard. Clipboard writes
use Pi's built-in cross-platform helper, including its terminal clipboard
fallback where supported. Clipboard errors are shown as notifications.

Install locally with `pi install ./extensions/copy-session/index.ts`, then
reload Pi with `/reload`.
