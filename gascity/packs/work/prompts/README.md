# Work Pack Prompts

Current runnable local work-pack prompts are:

- `worker.md.tmpl`
  - explains the branch-only stop boundary
  - makes bead metadata the durable handoff surface
  - keeps the disposable session work dir separate from the bead-scoped
    worktree
  - explicitly forbids direct-to-main and merge-to-main behavior
- `owner-work.md.tmpl`
  - keeps the shared crew/owner-session structure
  - injects the `work`-repo crew workflow and landing policy
  - preserves the branch-oriented trust boundary for larger work kept in crew
- `triage.md.tmpl`
  - explains the investigation-only boundary
  - allows local repro edits while forbidding push/PR behavior
  - makes triage notes plus `triage_*` metadata the durable output surface

Policy still belongs in config and formula wiring where possible. The prompt is
there to reinforce the intended worker behavior, not to be the only safeguard.
