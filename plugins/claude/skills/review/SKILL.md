---
name: review
description: Run Claude Code as a chat-only reviewer for the current git diff or an explicit base branch.
---

# Claude Review

Use this skill when the user asks Claude Code to review local code changes from inside Codex.

## Contract

- Run Claude Code through the shared helper resolved from this loaded skill path.
- Codex includes the absolute path to this `SKILL.md` when loading the skill. Derive the helper path by replacing `/skills/review/SKILL.md` with `/scripts/claude-review.mjs`.
- Use review mode:

```bash
node /absolute/path/to/plugins/claude/scripts/claude-review.mjs --mode review <user request>
```

- Preserve user-supplied flags and focus text after the mode argument.
- If the user gives `--base <ref>`, pass it through. Otherwise review the current working tree.
- Do not edit files in Codex after receiving Claude's review unless the user explicitly asks for follow-up implementation.
- Return Claude's review output to the user as the result. Do not post GitHub comments.

## Expected Output

Claude should report findings first, with file and line references where possible. If Claude finds no material issues, it should say so directly.
