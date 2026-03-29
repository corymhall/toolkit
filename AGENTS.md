# Agent Instructions

## Evaluation Lens

When adapting skills, formulas, or workflows from other agent systems, first
read:

- `docs/codex-evaluation-lens.md`

Do not assume a successful external workflow should be copied directly.
Evaluate it through that Codex-oriented lens before proposing or implementing
changes.

Prefer:

- OpenSpec for durable planning artifacts when planning is worth the cost
- worktrunk for worktree lifecycle
- tmux for session management
- one main Codex session owning implementation, with sidecar delegation only
  when it materially helps
