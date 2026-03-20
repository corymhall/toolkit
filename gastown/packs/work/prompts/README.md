# Work Pack Prompts

The first runnable local work-pack prompt is:

- `worker.md.tmpl`
  - explains the branch-only stop boundary
  - makes bead metadata the durable handoff surface
  - keeps the disposable session work dir separate from the bead-scoped
    worktree
  - explicitly forbids direct-to-main and merge-to-main behavior

Policy still belongs in config and formula wiring where possible. The prompt is
there to reinforce the intended worker behavior, not to be the only safeguard.
