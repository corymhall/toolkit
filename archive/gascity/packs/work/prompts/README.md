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
  - teaches pool startup and molecule-entry behavior
  - leaves the ordered triage workflow details to `mol-triage-work`
- `triage-v2.md.tmpl`
  - supports raw-bead manual issue triage without a default sling formula
  - adds explicit skill discipline: use only the local `triage` skill when present
  - adapts the eval-style triage report contract for fresh manual issue testing
  - leaves the session open after bead closure for follow-up until explicitly drained
  - tells the agent not to treat bead closure as session completion

Policy still belongs in config and formula wiring where possible. The prompt is
there to reinforce the intended worker behavior, not to be the only safeguard.
