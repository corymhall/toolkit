# toolkit

A collection of Codex-oriented skills, workflow notes, and planning assets for
AI-assisted software engineering.

## Current Direction

This repo is starting fresh around:

- `OpenSpec` for durable planning artifacts when planning is helpful
- `worktrunk` for worktree lifecycle
- `tmux` for one-session-per-worktree ergonomics
- Codex as the primary implementation owner

## Top-Level Areas

- `agents/` — repo-versioned custom Codex subagents
- `general/` — product-agnostic engineering skills
- `.config/wt.toml` — shared `worktrunk` starter config for tmux + Codex
- `docs/` — active workflow notes plus historical planning docs

## Fresh Start Workflow

See [docs/openspec-worktrunk-codex.md](docs/openspec-worktrunk-codex.md) for
the recommended workflow.

## General Skills

Language-specific development skills, review tools, and multi-model evaluation.

| Skill | Description |
|-------|-------------|
| [request-review](general/skills/request-review/) | Launch a manual code or implementation review using Codex-native reviewer agents and synthesize the findings. |
| [multi-model-evaluate](general/skills/multi-model-evaluate/) | Dispatch the same question to multiple AI models and synthesize consensus and disagreements. |
| [review-pr](general/skills/review-pr/) | Review a teammate's PR and produce draft comments for your approval before posting to GitHub. |
| [go-development](general/skills/go-development/) | Implement, refactor, and review production Go code using Google-style conventions. |
| [neovim-plugin-development](general/skills/neovim-plugin-development/) | Build, review, and modernize Neovim plugins in Lua. |
| [ai-contribution-readiness-audit](general/skills/ai-contribution-readiness-audit/) | Evaluate a repo's readiness for AI code contributions and produce concrete fixes. |
| [git-spice-stack-prs](general/skills/git-spice-stack-prs/) | Manage stacked GitHub PRs with git-spice — branch creation, submit, restack, and update cycles. |
| [receiving-code-review](https://github.com/obra/superpowers/tree/main/skills/receiving-code-review) | Protocol for handling review feedback — verify before implementing, push back when wrong. |

Historical planning docs also remain under [`docs/plans/`](docs/plans/).
They are useful as design history, but they are not the active workflow surface.

## Acknowledgements

- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — lightweight, customizable planning workflow
- [max-sixty/worktrunk](https://github.com/max-sixty/worktrunk) — worktree lifecycle and hook-based automation
- [obra/superpowers](https://github.com/obra/superpowers) — thinking and review patterns that still influence the repo
- [steveyegge/gastown](https://github.com/steveyegge/gastown) — reference material that informed earlier experiments

## License

MIT
