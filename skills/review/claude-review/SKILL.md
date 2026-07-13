---
name: claude-review
description: Run Claude Code as a chat-only reviewer for a local diff or branch, including adversarial pressure-testing when requested. Use when the user explicitly wants a Claude second opinion without posting GitHub comments.
---

# Claude Review

Use this skill when the user asks Claude Code to review local changes or
pressure-test an implementation or design.

## Contract

- Run Claude Code through `scripts/claude-review.mjs` inside this skill.
- Resolve the helper relative to the absolute path of this loaded `SKILL.md`.
- Use normal review mode by default:

```bash
node /absolute/path/to/claude-review/scripts/claude-review.mjs --mode review <user request>
```

- Use adversarial mode when the user asks to challenge assumptions, identify
  reasons not to ship, or pressure-test the design:

```bash
node /absolute/path/to/claude-review/scripts/claude-review.mjs --mode adversarial <user request>
```

- Preserve user-supplied flags and focus text after the mode argument.
- If the user gives `--base <ref>`, pass it through. Otherwise review the current
  working tree.
- Keep adversarial feedback grounded in material risks, broken assumptions,
  rollback hazards, failure paths, and real user impact.
- Do not edit files after receiving Claude's review unless the user explicitly
  asks for follow-up implementation.
- Return Claude's review output to the user. Do not post GitHub comments.

## Expected Output

Claude should report defensible findings first, with file and line references
where possible. If it finds no material issues, it should say so directly.
