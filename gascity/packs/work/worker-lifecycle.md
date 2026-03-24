# Work Pack Worker Lifecycle

This note defines the local `work` pack behavior to review before real worker
formula text is finalized.

## Core Intent

The local `work` pack should own a branch-only worker flow for work/open-source
repos:

1. receive scoped work
2. create or reuse an isolated worktree
3. create or reuse a feature branch
4. record durable metadata on the bead
5. stop at the prepared-branch / resumable handoff boundary

It should not:

- push or merge to `main`
- assume refinery-style merge handling
- depend on a surviving worker session for follow-up

## Reference Pattern

Use `mol-polecat-work` as reference for:

- worktree creation
- branch reuse
- metadata reuse
- rejection-aware resume

Do not inherit from it blindly. In particular, the local `work` pack should not
inherit:

- refinery handoff
- push-to-merge assumptions
- town-specific worker lifecycle language

## Current M3 Direction

- close the implementation bead at the branch-ready boundary
- model PR/review/fixup as downstream workflow beads, not as a half-open
  implementation bead
- treat pool sessions as disposable with fresh wake behavior
- treat the bead-scoped `metadata.work_dir` as the durable continuation surface
  for branch/worktree reuse
- treat the session `work_dir` as disposable setup state, not the source of
  truth for continuation

## Local Review Questions

- Which parts of the reference lifecycle are truly neutral enough to keep?
- What is the exact stop boundary for the local work worker?
- Which behaviors belong in local prompt text versus config/formula wiring?
