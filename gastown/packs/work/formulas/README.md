# Work Pack Formula Candidates

This directory is still review-first in M3.

Current local direction:

- treat `mol-polecat-work` as a reference pattern
- design a local branch-only variant rather than copying the refinery handoff
- keep work-pack formula ownership inside `work`, not `base`

Open questions:

- Do we want one local work formula first, or a small shared worker base plus a
  work-specific extension?
- How much of the reference structure survives once refinery and direct push are
  removed?
