---
name: adversarial-review
description: Run Claude Code as a chat-only adversarial reviewer that challenges implementation and design choices.
---

# Claude Adversarial Review

Use this skill when the user wants Claude Code to challenge a change, pressure-test assumptions, or look for reasons the implementation should not ship yet.

## Contract

- Run Claude Code through the shared helper resolved from this loaded skill path.
- Codex includes the absolute path to this `SKILL.md` when loading the skill. Derive the helper path by replacing `/skills/adversarial-review/SKILL.md` with `/scripts/claude-review.mjs`.
- Use adversarial mode:

```bash
node /absolute/path/to/plugins/claude/scripts/claude-review.mjs --mode adversarial <user request>
```

- Preserve user-supplied flags and focus text after the mode argument.
- If the user gives `--base <ref>`, pass it through. Otherwise review the current working tree.
- Keep the framing adversarial but grounded: material risks, broken assumptions, rollback hazards, failure paths, and real user impact.
- Do not edit files in Codex after receiving Claude's review unless the user explicitly asks for follow-up implementation.
- Return Claude's review output to the user as the result. Do not post GitHub comments.

## Expected Output

Claude should report only defensible, material concerns. If the change looks safe under adversarial scrutiny, it should say so directly.
