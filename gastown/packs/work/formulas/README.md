# Work Pack Formulas

The first runnable local work-pack formula is:

- `mol-work-branch-ready.formula.toml`
  - creates or reuses a bead-scoped worktree
  - creates or reuses a `corymhall/<issue>` feature branch
  - records durable bead metadata (`work_dir`, `branch`, `target`,
    `push_remote`, `base_branch`)
  - always pushes the feature branch to `origin`
  - closes the implementation bead at the branch-ready handoff boundary
  - relies on the target repo's own docs (`AGENTS.md`, `CLAUDE.md`, README,
    scripts) for setup and verification commands

Design constraints:

- direct push or merge to `main` stays forbidden
- no automatic resume rebase; rebasing is an explicit follow-up decision
- PR/review/fixup work is downstream and out of scope for this formula
- the durable continuation surface is bead metadata plus the recorded worktree
