# Custom Agents

This directory holds project-scoped custom Codex subagents for this repo.

These files are kept in the repo so we can version, review, and evolve them
alongside the skills and formulas they support.

## Intended install shape

Codex looks for custom agents in `.codex/agents/` (project-scoped) or
`~/.codex/agents/` (personal/global).

We are intentionally keeping the source-of-truth files here first. A later
setup step can symlink them into `~/.codex/agents/`.

Example:

```bash
ln -s /path/to/toolkit-checkout/agents ~/.codex/agents/toolkit
```

Or symlink individual agent files if that layout works better for your local
Codex setup.

## Initial review-focused agents

- `general-reviewer.toml`
- `spec-alignment-reviewer.toml`
- `test-reviewer.toml`
- `error-handling-reviewer.toml`

These are the first building blocks for the review refresh design. The intent
is:

- Codex-native subagents do the primary review work
- each agent has a narrow review lens
- parent sessions synthesize the findings
- optional external review lanes stay additive, not central

## Design notes

- These agents default to `sandbox_mode = "read-only"` because review work
  should usually be non-destructive.
- Reviewer agents use `gpt-5.4` with `model_reasoning_effort = "high"` as the
  default starting point.
- We should keep the agents narrow and opinionated rather than turning one
  agent into a giant generic reviewer with many modes.
